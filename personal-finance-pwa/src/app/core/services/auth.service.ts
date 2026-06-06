import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StorageService } from './storage.service';
import { BackupMode } from './backup-mode.service';
import { firebaseConfig } from '../config/firebase.config';
import { environment } from '../../../environments/environment';
import type { Auth } from 'firebase/auth';

declare const google: any;

const CLIENT_ID = (window as any).__GOOGLE_CLIENT_ID__ ?? '';

// Scopes required for Google Sheets API access
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// Always request all required scopes — openid/email/profile for Firebase Auth identity
// verification (userinfo endpoint), drive.appdata for private config/backup file,
// spreadsheets for Sheets import migration. Full drive scope removed in v8.
const ALL_SCOPES = `openid email profile ${SHEETS_SCOPE} ${DRIVE_APPDATA_SCOPE}`;
const SCOPE_VERSION = '8'; // v8 = removed full drive scope (family sync now uses Firestore)
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
  readonly displayName = computed(() => this.userEmail()?.split('@')[0] ?? null);

  #accessToken: string | null = null;
  #firebaseAuth: Auth | null = null;

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
      this.#nativeInitPromise = (async () => {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        await SocialLogin.initialize({
          google: {
            // webClientId is required by the plugin on Android for token verification
            webClientId: '663004583066-vu5c3p5pcsg86thjftfts1t45690kll3.apps.googleusercontent.com',
          },
        });
      })().catch((err) => console.error('SocialLogin.initialize failed:', err));
    }
  }

  // ---------------------------------------------------------------------------
  // Private lazy Firebase initializer
  // ---------------------------------------------------------------------------

  async #getFirebaseAuth(): Promise<Auth> {
    if (this.#firebaseAuth) return this.#firebaseAuth;
    const { getApps, initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#firebaseAuth = getAuth(app);
    return this.#firebaseAuth;
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

    // Restore the native access token so ensureToken() doesn't re-trigger the
    // full SocialLogin.login() flow on app resume (avoids the 20-second delay
    // when opening the subscription page after a cold start).
    if (this.#isNative) {
      const storedToken = await this.storageService.get(NATIVE_ACCESS_TOKEN_KEY);
      const expiresAtStr = await this.storageService.get(NATIVE_ACCESS_TOKEN_EXPIRES_AT_KEY);
      if (storedToken && expiresAtStr) {
        const expiresAt = parseInt(expiresAtStr, 10);
        // Keep a 5-minute buffer so we don't hand out a token that's about to expire.
        if (Number.isFinite(expiresAt) && Date.now() < expiresAt - 5 * 60 * 1000) {
          this.#accessToken = storedToken;
        }
      }
    }
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

  /**
   * Ensures Firebase Auth has a signed-in user without triggering any interactive UI.
   * On cold starts (kill → relaunch) the Firebase Auth IndexedDB session may not be
   * restored, leaving currentUser null. If we have a stored Google access token we
   * can call signInWithCredential silently to re-establish the Firebase session.
   */
  async ensureFirebaseSignedInSilently(): Promise<void> {
    const auth = await this.#getFirebaseAuth();
    await auth.authStateReady();
    if (!auth.currentUser && this.#accessToken) {
      try {
        const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
        const credential = GoogleAuthProvider.credential(null, this.#accessToken);
        const userCred = await signInWithCredential(auth, credential);
        this.firebaseUid.set(userCred.user.uid);
        await this.storageService.set('firebase_uid', userCred.user.uid);
      } catch (err) {
        console.warn('[AuthService] Silent Firebase re-sign-in failed:', err);
      }
    }
  }

  /**
   * Returns a Firebase ID token for the currently signed-in Firebase user,
   * or null if no Firebase user is available. Does not attempt re-authentication.
   */
  async getFirebaseIdToken(): Promise<string | null> {
    try {
      const auth = await this.#getFirebaseAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) return null;
      return user.getIdToken();
    } catch {
      return null;
    }
  }

  async ensureFirebaseIdToken(): Promise<string> {
    const auth = await this.#getFirebaseAuth();

    // Wait for Firebase to restore its persisted auth state (IndexedDB) before
    // checking currentUser. Without this, currentUser may be null immediately
    // after a cold start even though the user was previously signed in, causing
    // an unnecessary (and slow) re-authentication round-trip.
    await auth.authStateReady();

    if (!auth.currentUser && this.isAuthenticated()) {
      const accessToken = await this.ensureToken();
      await this.#signIntoFirebase(null, accessToken);
    }

    const user = auth.currentUser;
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

    const { signInWithCustomToken } = await import('firebase/auth');
    const auth = await this.#getFirebaseAuth();
    const credential = await signInWithCustomToken(auth, body.customToken);
    this.firebaseUid.set(credential.user.uid);
    await this.storageService.set('firebase_uid', credential.user.uid);
  }

  // ---------------------------------------------------------------------------
  // Native (Android / iOS) — @capgo/capacitor-social-login
  // ---------------------------------------------------------------------------

  async #nativeSignIn(): Promise<SignInResult> {
    await this.#nativeInitPromise;
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    const previousEmail = await this.storageService.get('gapi_user_email');

    const scopes = [SHEETS_SCOPE, DRIVE_APPDATA_SCOPE];

    // First attempt may throw "No credentials found" on Android Credential Manager
    // when there is no cached credential (e.g., cold first-time launch). A second
    // call reliably surfaces the interactive account-picker, so retry once.
    let result;
    try {
      result = await SocialLogin.login({ provider: 'google', options: { scopes } });
    } catch (err: any) {
      const msg: string = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
      if (msg.includes('no credentials') || msg.includes('no account')) {
        result = await SocialLogin.login({ provider: 'google', options: { scopes } });
      } else {
        throw err;
      }
    }

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
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.logout({ provider: 'google' });
    } catch (err) {
      // Non-critical — local state is already cleared
      if (isDevMode()) { console.warn('Native sign-out error:', err); }
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
        if (isDevMode()) { console.warn('Google token revoke failed after local sign-out:', err); }
      });
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  async #signIntoFirebase(idToken: string | null, accessToken: string): Promise<void> {
    try {
      const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
      const auth = await this.#getFirebaseAuth();
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCred = await signInWithCredential(auth, credential);
      const uid = userCred.user.uid;
      this.firebaseUid.set(uid);
      await this.storageService.set('firebase_uid', uid);
    } catch (err) {
      // Non-critical for Drive features, but subscription will fail without Firebase auth.
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
    void (async () => {
      const { signOut } = await import('firebase/auth');
      const auth = await this.#getFirebaseAuth();
      await signOut(auth);
    })().catch(() => {});
  }

  #nativeTokenExpiresAt(accessToken: { expires?: string } | null): string {
    const parsedExpiry = accessToken?.expires ? Date.parse(accessToken.expires) : NaN;
    const expiresAt = Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Date.now() + 55 * 60 * 1000;
    return String(expiresAt);
  }
}
