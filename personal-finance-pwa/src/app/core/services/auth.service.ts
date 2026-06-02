import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { StorageService } from './storage.service';
import { BackupMode } from './backup-mode.service';
import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  signInWithCustomToken,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { firebaseConfig } from '../config/firebase.config';
import { environment } from '../../../environments/environment';

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
const NATIVE_ACCESS_TOKEN_KEY = 'gapi_access_token';
const NATIVE_ACCESS_TOKEN_EXPIRES_AT_KEY = 'gapi_access_token_expires_at';
const SUBSCRIBE_URL = 'https://spenza-finance.web.app/#/subscribe';

export interface SignInResult {
  email: string | null;
  accountChanged: boolean;
}

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
  readonly firebaseUid = signal<string | null>(null);

  #accessToken: string | null = null;
  readonly #firebaseAuth = getAuth(
    getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
  );

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
  readonly #nativeInitPromise: Promise<void> | null = null;

  constructor(
    private readonly storageService: StorageService,
  ) {
    // Restore session state from storage so the auth guard lets the user
    // through immediately — a fresh token is obtained lazily on the first API call.
    this.sessionRestored = this.#restoreSession();

    // Initialize the native Google Sign-In plugin once on startup.
    if (this.#isNative) {
      this.#nativeInitPromise = SocialLogin.initialize({
        google: {
          // webClientId is required by the plugin on Android for token verification
          webClientId: '663004583066-vu5c3p5pcsg86thjftfts1t45690kll3.apps.googleusercontent.com',
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
      await this.storageService.remove(NATIVE_ACCESS_TOKEN_KEY);
      await this.storageService.remove(NATIVE_ACCESS_TOKEN_EXPIRES_AT_KEY);
      await this.storageService.set('gapi_scope_version', currentScopeVersion);
      return;
    }

    this.isAuthenticated.set(true);
    const email = await this.storageService.get('gapi_user_email');
    if (email) this.userEmail.set(email);
    const uid = await this.storageService.get('firebase_uid');
    if (uid) this.firebaseUid.set(uid);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  signIn(): Promise<SignInResult> {
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

  /** Discards the in-memory access token so the next ensureToken() call fetches a fresh one. */
  clearToken(): void {
    this.#accessToken = null;
    this.#tokenRequestPromise = null;
  }

  getAccessToken(): string | null {
    return this.#accessToken;
  }

  needsInteractiveWebToken(): boolean {
    return !this.#isNative && this.isAuthenticated() && !this.#accessToken;
  }

  /**
   * Returns a stable user ID, fetching one silently if not yet available.
   * Handles existing sessions where firebase_uid was never stored.
   */
  async ensureUserId(): Promise<string | null> {
    const existing = this.firebaseUid();
    if (existing) return existing;
    if (!this.isAuthenticated()) return null;
    try {
      const accessToken = await this.ensureToken();
      const res = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
      );
      if (res.ok) {
        const info = await res.json();
        if (info.sub) {
          const sub = String(info.sub);
          this.firebaseUid.set(sub);
          await this.storageService.set('firebase_uid', sub);
        }
      }
      await this.#signIntoFirebase(null, accessToken);
    } catch {
      // Non-critical
    }
    return this.firebaseUid();
  }

  async ensureFirebaseIdToken(): Promise<string> {
    if (!this.#firebaseAuth.currentUser && this.isAuthenticated()) {
      const accessToken = await this.ensureToken();
      await this.#signIntoFirebase(null, accessToken);
    }

    const user = this.#firebaseAuth.currentUser;
    if (!user) {
      throw new Error('Could not verify your subscription account. Open this page from the Spenza app and try again.');
    }
    return user.getIdToken();
  }

  async createSubscriptionPageUrl(): Promise<string> {
    const idToken = await this.ensureFirebaseIdToken();
    const response = await fetch(`${environment.firebaseFunctionsUrl}/createSubscriptionHandoff`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Subscription management is not deployed yet. Please try again after the app update finishes.');
      }
      throw new Error('Could not open subscription management. Please try again.');
    }

    const body = await response.json() as { code?: string };
    if (!body.code) {
      throw new Error('Subscription handoff did not return a code.');
    }
    return `${SUBSCRIBE_URL}?handoff=${encodeURIComponent(body.code)}`;
  }

  async redeemSubscriptionHandoff(code: string): Promise<void> {
    const response = await fetch(`${environment.firebaseFunctionsUrl}/redeemSubscriptionHandoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Subscription management is not deployed yet. Open it again after the app update finishes.');
      }
      throw new Error('This subscription link has expired. Open it again from the Spenza app.');
    }

    const body = await response.json() as { customToken?: string };
    if (!body.customToken) {
      throw new Error('Subscription handoff did not return a token.');
    }

    const credential = await signInWithCustomToken(this.#firebaseAuth, body.customToken);
    this.firebaseUid.set(credential.user.uid);
    await this.storageService.set('firebase_uid', credential.user.uid);
  }

  // ---------------------------------------------------------------------------
  // Native (Android / iOS) — @capgo/capacitor-social-login
  // ---------------------------------------------------------------------------

  async #nativeSignIn(): Promise<SignInResult> {
    await this.#nativeInitPromise;
    const previousEmail = await this.storageService.get('gapi_user_email');

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
    await this.storageService.set(NATIVE_ACCESS_TOKEN_KEY, token);
    await this.storageService.set(NATIVE_ACCESS_TOKEN_EXPIRES_AT_KEY, this.#nativeTokenExpiresAt(googleResult.accessToken));

    const email = googleResult.profile?.email ?? null;
    if (email) {
      this.userEmail.set(email);
      await this.storageService.set('gapi_user_email', email);
    }

    // Sign into Firebase Auth using the Google access token (native idToken preferred)
    const idToken = (googleResult as any).idToken ?? null;
    await this.#signIntoFirebase(idToken, token);

    return {
      email,
      accountChanged: !!previousEmail && !!email && previousEmail !== email,
    };
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

  #webSignIn(): Promise<SignInResult> {
    return waitForGsiScript().then(
      () =>
        new Promise<SignInResult>((resolve, reject) => {
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
              const previousEmail = await this.storageService.get('gapi_user_email');
              let signedInEmail: string | null = null;
              try {
                const infoResponse = await fetch(
                  `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${response.access_token}`
                );
                if (infoResponse.ok) {
                  const info = await infoResponse.json();
                  if (info.email) {
                    signedInEmail = String(info.email);
                    this.userEmail.set(signedInEmail);
                    await this.storageService.set('gapi_user_email', signedInEmail);
                  }
                  // Use Google sub as stable UID fallback — overwritten by Firebase UID if auth succeeds
                  if (info.sub) {
                    const googleSub = String(info.sub);
                    this.firebaseUid.set(googleSub);
                    await this.storageService.set('firebase_uid', googleSub);
                  }
                }
              } catch {
                // Non-critical — email display is optional
              }
              // Sign into Firebase Auth with the Google access token (overwrites sub if successful)
              await this.#signIntoFirebase(null, response.access_token);

              resolve({
                email: signedInEmail,
                accountChanged: !!previousEmail && !!signedInEmail && previousEmail !== signedInEmail,
              });
            },
          });
          tokenClient.requestAccessToken();
        })
    );
  }

  #webSignOut(): Promise<void> {
    const token = this.#accessToken;
    this.#clearAuthState();

    if (!token) return Promise.resolve();

    return waitForGsiScript()
      .then(
        () =>
          new Promise<void>((resolve) => {
            google.accounts.oauth2.revoke(token, () => resolve());
          })
      )
      .catch((err) => {
        console.warn('Google token revoke failed after local sign-out:', err);
      });
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  async #signIntoFirebase(idToken: string | null, accessToken: string): Promise<void> {
    try {
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCred = await signInWithCredential(this.#firebaseAuth, credential);
      const uid = userCred.user.uid;
      this.firebaseUid.set(uid);
      await this.storageService.set('firebase_uid', uid);
    } catch (err) {
      // Non-critical — Firebase Auth failure does not block Drive-based features
      console.warn('[AuthService] Firebase sign-in failed:', err);
    }
  }

  #clearAuthState(): void {
    this.#accessToken = null;
    this.isAuthenticated.set(false);
    this.userEmail.set(null);
    this.firebaseUid.set(null);
    void this.storageService.remove('gapi_auth_state');
    void this.storageService.remove('gapi_user_email');
    void this.storageService.remove('gapi_scope_version');
    void this.storageService.remove('firebase_uid');
    void this.storageService.remove(NATIVE_ACCESS_TOKEN_KEY);
    void this.storageService.remove(NATIVE_ACCESS_TOKEN_EXPIRES_AT_KEY);
    void firebaseSignOut(this.#firebaseAuth).catch(() => {});
  }

  #nativeTokenExpiresAt(accessToken: { expires?: string } | null): string {
    const parsedExpiry = accessToken?.expires ? Date.parse(accessToken.expires) : NaN;
    const expiresAt = Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Date.now() + 55 * 60 * 1000;
    return String(expiresAt);
  }
}
