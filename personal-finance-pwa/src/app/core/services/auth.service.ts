import { Injectable, signal } from '@angular/core';

declare const google: any;

const CLIENT_ID = (window as any).__GOOGLE_CLIENT_ID__ ?? '';

/** Resolves once the GSI script has finished loading. */
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
   * Shared promise for an in-flight token request.
   * Prevents multiple simultaneous popup/silent requests.
   */
  #tokenRequestPromise: Promise<string> | null = null;

  constructor() {
    // If the user was previously signed in, restore their session state
    // immediately so the UI shows them as authenticated and the auth guard
    // lets them through — without opening any popup.
    // A fresh token will be obtained lazily on the first API call via ensureToken().
    if (localStorage.getItem('gapi_auth_state') === '1') {
      this.isAuthenticated.set(true);
      const email = localStorage.getItem('gapi_user_email');
      if (email) this.userEmail.set(email);
    }
  }

  signIn(): Promise<void> {
    return waitForGsiScript().then(
      () =>
        new Promise<void>((resolve, reject) => {
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            callback: async (response: any) => {
              if (response.error) {
                reject(new Error(response.error_description ?? response.error));
                return;
              }
              this.#accessToken = response.access_token;
              this.isAuthenticated.set(true);
              localStorage.setItem('gapi_auth_state', '1');
              try {
                const infoResponse = await fetch(
                  `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${response.access_token}`
                );
                if (infoResponse.ok) {
                  const info = await infoResponse.json();
                  if (info.email) {
                    this.userEmail.set(info.email);
                    localStorage.setItem('gapi_user_email', info.email);
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

  /**
   * Returns a valid access token, requesting a new one if needed.
   * This is the method API services should call instead of getAccessToken()
   * directly — it handles token expiry transparently.
   *
   * Only opens a popup when the token is actually missing/expired,
   * and only when called from a user-initiated action.
   */
  ensureToken(): Promise<string> {
    if (this.#accessToken) return Promise.resolve(this.#accessToken);

    // Reuse an in-flight request if one is already pending
    if (this.#tokenRequestPromise) return this.#tokenRequestPromise;

    this.#tokenRequestPromise = waitForGsiScript()
      .then(
        () =>
          new Promise<string>((resolve, reject) => {
            const tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: CLIENT_ID,
              scope: 'https://www.googleapis.com/auth/spreadsheets',
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
                localStorage.setItem('gapi_auth_state', '1');
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

  getAccessToken(): string | null {
    return this.#accessToken;
  }

  #clearAuthState(): void {
    this.#accessToken = null;
    this.isAuthenticated.set(false);
    this.userEmail.set(null);
    localStorage.removeItem('gapi_auth_state');
    localStorage.removeItem('gapi_user_email');
  }
}
