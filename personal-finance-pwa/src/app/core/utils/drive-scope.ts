/**
 * Pure, dependency-free helpers for the Google Drive AppData scope.
 *
 * Extracted from auth.service so the granular-consent rule can be unit-tested
 * without importing auth.service (which touches `window` at module load and
 * cannot be imported in the Node test environment).
 */

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/**
 * Google's granular consent lets a user untick the Drive checkbox at sign-in.
 * The returned token then 403s on every Drive call and re-triggers sign-in
 * forever. We must detect a missing appdata scope and re-prompt instead.
 */
export function grantedScopesIncludeDrive(scopeString: string | null | undefined): boolean {
  return !!scopeString && scopeString.includes(DRIVE_APPDATA_SCOPE);
}
