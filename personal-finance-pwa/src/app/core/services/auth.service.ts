import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { StorageService } from './storage.service';
import { BackupMode } from './backup-mode.service';

declare const google: any;

const CLIENT_ID = (window as any).__GOOGLE_CLIENT_ID__ ?? '';

// Scopes required for Google Sheets API access
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// Use full drive scope to allow access to shared files (required for family mode partner access)
// drive.file scope only allows access to files created by the app, not shared files
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

// Always request all required scopes — drive.appdata for config file,
// drive for family shared backup (includes shared file access), spreadsheets for Sheets import.
const ALL_SCOPES = `${SHEETS_SCOPE} ${DRIVE_APPDATA_SCOPE} ${DRIVE_SCOPE}`;
const SCOPE_VERSION = '6'; // v6 = full drive scope instead of drive.file

export function computeScopes(_mode: BackupMode | null): string {
  return ALL_SCOPES;
}

export function computeScopeVersion(_mode: BackupMode | null): string {
  return SCOPE_VERSION;
}

/** Resolves once the GSI script has finished loading (web only). */
function waitForGsiScript(): Promise<void> {
  if (typeof google !== 'undefined') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (!script) {
      reject(new Error('GSI script not found in document.'));
      return;
    }
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load GSI script')));
  });
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly isAuthenticated = signal<boolean>(false);
  readonly userEmail = signal<string | null>(null);

  #accessToken: string | null = null;

  /**
   * Shared promise for an in-flight token request (web only).
   * Prevents multiple simultaneous popup/silent requests.
   */
  #tokenRequestPromise: Promise<string> | null = null;

  /** Whether we are running inside a Capacitor native shell (Android/iOS). */
  readonly #isNative = Capacitor.isNativePlatform();

  /**
   * Resolves once the persisted auth state has been read from storage.
   * Await this before checking isAuthenticated() on app startup.
   */
  readonly sessionRestored: Promise<void>;

  constructor(
    private readonly storageService: StorageService,
  ) {
    // Restore session state from storage so the auth guard lets the user
    // through immediately — a fresh token is obtained lazily on the first API call.
    this.sessionRestored = this.#restoreSession();

    // Initialize the native Google Sign-In plugin once on startup.
    if (this.#isNative) {
      SocialLogin.initialize({
        google: {
          // webClientId is required by the plugin on Android for token verification
          webClientId: '335358015393-9jek528175b4030m56oro1si8vknvlvu.apps.googleusercontent.com',
          // Android OAuth Client ID created in Google Cloud Console
          // Package: com.spenza.app | SHA-1: A9:87:C7:2A:58:35:B4:AA:AE:13:F7:84:99:EF:91:45:4D:9A:C4:9B
          iOSServerClientId: '335358015393-vp8s227vqliul2vseqo7t6i1brgas95v.apps.googleusercontent.com',
        },
      }).catch((err) => console.error('SocialLogin.initialize failed:', err));
    }
  }

  // ---------------------------------------------------------------------------
  // Private async session restore
  // ---------------------------------------------------------------------------

  async #restoreSession(): Promise<void> {
    const authState = await this.storageService.get('gapi_auth_state');
    if (authState !== '1') return;

    const currentScopeVersion = SCOPE_VERSION;
    const storedScopeVersion = await this.storageService.get('gapi_scope_version');
    if (storedScopeVersion !== currentScopeVersion) {
      console.info('[AuthService] Scope version changed — clearing cached auth state to force re-consent.');
      await this.storageService.remove('gapi_auth_state');
      await this.storageService.remove('gapi_user_email');
      await this.storageService.set('gapi_scope_version', currentScopeVersion);
      return;
    }

    this.isAuthenticated.set(true);
    const email = await this.storageService.get('gapi_user_email');
    if (email) this.userEmail.set(email);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  signIn(): Promise<void> {
    return this.#isNative ? this.#nativeSignIn() : this.#webSignIn();
  }

  /**
   * Returns a valid access token, requesting a new one if needed.
   * Services should call this instead of getAccessToken() directly —
   * it handles token expiry transparently.
   *
   * On native, the token is always retrieved via the plugin.
   * On web, a popup is opened only when the token is missing/expired.
   */
  ensureToken(): Promise<string> {
    if (this.#accessToken) return Promise.resolve(this.#accessToken);

    if (this.#isNative) {
      return this.#nativeSignIn().then(() => {
        if (!this.#accessToken) throw new Error('Native sign-in did not return a token.');
        return this.#accessToken;
      });
    }

    // Web: reuse an in-flight request if one is already pending
    if (this.#tokenRequestPromise) return this.#tokenRequestPromise;

    this.#tokenRequestPromise = waitForGsiScript()
      .then(
        () =>
          new Promise<string>((resolve, reject) => {
            const tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: CLIENT_ID,
              scope: ALL_SCOPES,
              prompt: '',
              callback: (response: any) => {
                this.#tokenRequestPromise = null;
                if (response.error) {
                  this.#clearAuthState();
                  reject(new Error(response.error_description ?? response.error));
                  return;
                }
                this.#accessToken = response.access_token;
                this.isAuthenticated.set(true);
                void this.storageService.set('gapi_auth_state', '1');
                void this.storageService.set('gapi_scope_version', SCOPE_VERSION);
                resolve(response.access_token);
              },
            });
            tokenClient.requestAccessToken({ prompt: '' });
          })
      )
      .catch((err) => {
        this.#tokenRequestPromise = null;
        throw err;
      });

    return this.#tokenRequestPromise;
  }

  signOut(): Promise<void> {
    return this.#isNative ? this.#nativeSignOut() : this.#webSignOut();
  }

  getAccessToken(): string | null {
    return this.#accessToken;
  }

  // ---------------------------------------------------------------------------
  // Native (Android / iOS) — @capgo/capacitor-social-login
  // ---------------------------------------------------------------------------

  async #nativeSignIn(): Promise<void> {
    const scopes = [SHEETS_SCOPE, DRIVE_APPDATA_SCOPE, DRIVE_SCOPE];

    const result = await SocialLogin.login({
      provider: 'google',
      options: { scopes },
    });

    // result.result is GoogleLoginResponse (online mode)
    const googleResult = result.result;
    if (googleResult.responseType !== 'online') {
      throw new Error('Expected online Google login response.');
    }

    const token = googleResult.accessToken?.token ?? null;
    if (!token) throw new Error('Google Sign-In did not return an access token.');

    this.#accessToken = token;
    this.isAuthenticated.set(true);
    await this.storageService.set('gapi_auth_state', '1');
    await this.storageService.set('gapi_scope_version', SCOPE_VERSION);

    const email = googleResult.profile?.email ?? null;
    if (email) {
      this.userEmail.set(email);
      await this.storageService.set('gapi_user_email', email);
    }
  }

  async #nativeSignOut(): Promise<void> {
    this.#clearAuthState();
    try {
      await SocialLogin.logout({ provider: 'google' });
    } catch (err) {
      // Non-critical — local state is already cleared
      console.warn('Native sign-out error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Web — Google Identity Services (GSI) popup flow
  // ---------------------------------------------------------------------------

  #webSignIn(): Promise<void> {
    return waitForGsiScript().then(
      () =>
        new Promise<void>((resolve, reject) => {
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: ALL_SCOPES,
            callback: async (response: any) => {
              if (response.error) {
                reject(new Error(response.error_description ?? response.error));
                return;
              }
              this.#accessToken = response.access_token;
              this.isAuthenticated.set(true);
              await this.storageService.set('gapi_auth_state', '1');
              await this.storageService.set('gapi_scope_version', SCOPE_VERSION);
              try {
                const infoResponse = await fetch(
                  `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${response.access_token}`
                );
                if (infoResponse.ok) {
                  const info = await infoResponse.json();
                  if (info.email) {
                    this.userEmail.set(info.email);
                    await this.storageService.set('gapi_user_email', info.email);
                  }
                }
              } catch {
                // Non-critical — email display is optional
              }
              resolve();
            },
          });
          tokenClient.requestAccessToken();
        })
    );
  }

  #webSignOut(): Promise<void> {
    return waitForGsiScript().then(
      () =>
        new Promise<void>((resolve) => {
          const token = this.#accessToken;
          this.#clearAuthState();
          if (token) {
            google.accounts.oauth2.revoke(token, () => resolve());
          } else {
            resolve();
          }
        })
    );
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  #clearAuthState(): void {
    this.#accessToken = null;
    this.isAuthenticated.set(false);
    this.userEmail.set(null);
    void this.storageService.remove('gapi_auth_state');
    void this.storageService.remove('gapi_user_email');
    void this.storageService.remove('gapi_scope_version');
  }
}
