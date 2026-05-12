# Family Mode Fixes - Complete Summary

## Issues Fixed

### 1. ✅ 404 Error When Partner Accesses Shared File
**Problem**: Partner got 404 error when trying to access the owner's shared file, even though the file was shared correctly in Google Drive.

**Root Cause**: The app was using `drive.file` OAuth scope, which only allows access to files created by the app itself, not files shared by others.

**Solution**: Changed OAuth scope from `drive.file` to `drive` (full Drive access).

**Files Changed**:
- `auth.service.ts`: Updated scope from `drive.file` to `drive`
- Scope version bumped from v5 to v6 to force re-authentication

**Impact**: Both owner and partner must sign out and sign in again to grant the new permission.

---

### 2. ✅ Partner Redirected to Mode Selection After Re-login
**Problem**: When the partner signed out and signed back in, they were redirected to the mode selection screen instead of going directly to the app with their family mode configuration.

**Root Cause**: The family setup flow was not calling `setMode('family')` when the partner connected. This meant:
- The `mode` field in `spenza-config.json` was `null`
- When the partner signed back in, `loadFromDrive()` loaded the config with `mode: null`
- The app thought the user hadn't selected a mode yet
- User was redirected to mode selection

**Solution**: Added `setMode('family')` calls in all family setup flows:
1. When partner connects with file ID
2. When owner creates new shared file
3. When owner reuses existing file

**Files Changed**:
- `family-setup.component.ts`: Added `setMode('family')` in three places:
  - `onPartnerConnect()` - when partner enters file ID
  - `onOwnerReuseExisting()` - when owner reuses existing file
  - `#createAndFinish()` - when owner creates new file

**Impact**: Now the mode is properly saved to Drive config and persists across sign-ins.

---

### 3. ✅ Config Not Saving (No Config File ID)
**Problem**: Partner could access family-setup without being authenticated, causing "No config file ID — cannot save to Drive" errors.

**Root Cause**: The `family-setup` and `mode-select` routes had no auth guard, allowing unauthenticated access. The config file is only created after sign-in when `loadFromDrive()` is called.

**Solution**: Added `authGuard` to both `family-setup` and `mode-select` routes.

**Files Changed**:
- `app.routes.ts`: Added `canActivate: [authGuard]` to both routes

**Impact**: Users must sign in before accessing these routes, ensuring config file exists before trying to save.

---

### 4. ✅ Enhanced Debug Logging
**Problem**: Hard to diagnose data loading issues.

**Solution**: Added comprehensive console logging to track:
- Number of expenses and limits loaded
- Monthly income value
- Document structure
- Store state after loading

**Files Changed**:
- `expense-store.service.ts`: Enhanced logging in `loadFromDrive()` method

---

## Correct Partner Setup Flow

### First Time Setup (New Partner):
1. Partner opens the app
2. **Sign in with Google** (auth/callback page)
3. After sign-in, redirected to **Mode Selection** (because mode is null)
4. Select **"Family / Shared"**
5. Select **"I am a Partner"**
6. **Enter the File ID** shared by owner
7. Click **"Connect"**
8. Config is saved to Drive ✅
9. Redirected to app with data ✅

### Subsequent Sign-ins (Returning Partner):
1. Partner opens the app
2. **Sign in with Google**
3. Config is loaded from Drive (mode: family, sharedFileId: xxx)
4. **Directly to app** with data ✅

---

### Config File Location
Each user has their own `spenza-config.json` file stored in their Google Drive `appDataFolder`:
- **Owner's config**: In owner's appDataFolder
- **Partner's config**: In partner's appDataFolder

### Config Structure
```json
{
  "version": "1.0",
  "mode": "family",           // ← This was missing!
  "sharedFileId": "1Www...",  // ← File ID of shared backup
  "ownerRole": "partner",     // ← "owner" or "partner"
  "lastUpdated": "2026-05-12T..."
}
```

### Why Mode Must Be Set
When a user signs in:
1. `authService.sessionRestored` completes
2. `backupModeService.loadFromDrive()` is called
3. Config is loaded from Drive
4. If `mode === null`, user is redirected to mode selection
5. If `mode === 'family'` but no `sharedFileId`, user is redirected to family setup
6. Otherwise, app loads data and continues

**Before the fix**: Partner's config had `mode: null`, causing redirect to mode selection.
**After the fix**: Partner's config has `mode: 'family'`, app loads correctly.

---

## Testing Checklist

### For Owner:
- [ ] Sign out and sign in again (to get new OAuth scope)
- [ ] Create a new shared backup OR reuse existing
- [ ] Verify mode is set: Check console for `mode: family`
- [ ] Add a test expense
- [ ] Sign out and sign back in
- [ ] Verify you go directly to the app (not mode selection)
- [ ] Verify your data is still there

### For Partner:
- [ ] Sign out and sign in again (to get new OAuth scope)
- [ ] Enter the file ID shared by owner
- [ ] Verify connection succeeds (no 404 error)
- [ ] Verify you see the owner's data
- [ ] Sign out and sign back in
- [ ] **Critical**: Verify you go directly to the app (not mode selection)
- [ ] Verify data is still visible

### Both Users:
- [ ] Add/edit/delete expenses
- [ ] Verify changes sync between users
- [ ] Check browser console for any errors
- [ ] Verify monthly income and limits are shared

---

## Deployment Steps

1. **Rebuild the app**:
   ```bash
   cd personal-finance-pwa
   npm run build
   ```

2. **Deploy to hosting**:
   ```bash
   # Deploy to your hosting platform
   # (Firebase, Netlify, Vercel, etc.)
   ```

3. **Clear browser cache** (important!):
   - Users should clear cache or do a hard refresh
   - Or increment the app version to force cache invalidation

4. **Both users must re-authenticate**:
   - Sign out from the app
   - Sign in again
   - This grants the new `drive` scope permission

5. **Partner must reconnect** (if already set up):
   - If the partner was already connected before the fix
   - They should sign out and sign in
   - The app will detect missing mode and redirect to mode selection
   - Select "Family / Shared" → "I am a Partner"
   - Enter the file ID again
   - Now the mode will be properly saved

---

## Console Logs to Look For

### Successful Partner Sign-In:
```
[App] sessionRestored — isAuthenticated: true
[BackupModeService] loadFromDrive — loading config from Drive
[App] Starting Drive bootstrap...
[ExpenseStore] loadFromDrive — start
[ExpenseStore] loadFromDrive — mode: family
[ExpenseStore] loadFromDrive — family mode, reading shared file: 1Www...
[ExpenseStore] loadFromDrive — read complete. expenses: X | limits: Y | monthlyIncome: Z
[ExpenseStore] loadFromDrive — state updated. Store now has: {...}
[App] Drive bootstrap complete. driveFileId: 1Www...
```

### If Mode Is Missing (Before Fix):
```
[BackupModeService] loadFromDrive — config loaded, mode: null
[App] Mode is null, redirecting to mode selection
```

### After Fix:
```
[BackupModeService] loadFromDrive — config loaded, mode: family
[App] Mode is family, sharedFileId: 1Www..., proceeding to load data
```

---

## Troubleshooting

### Partner Still Redirected to Mode Selection
1. Check browser console for mode value
2. If mode is still null, the partner needs to reconnect:
   - Go through family setup again
   - Enter the file ID
   - The fix will now save the mode

### Still Getting 404 Error
1. Verify both users have signed out and back in (new OAuth scope)
2. Check if file is still shared in Google Drive
3. Verify the file ID is correct
4. Check browser console for the actual error message

### No Data Showing
1. Check if the shared file has any data (see debug-family-mode.md)
2. Owner should add test data
3. Partner should refresh the app
4. Check console logs for data loading

---

## Files Modified

1. **auth.service.ts**
   - Changed OAuth scope from `drive.file` to `drive`
   - Updated scope version from v5 to v6

2. **family-setup.component.ts**
   - Added `setMode('family')` in `onPartnerConnect()`
   - Added `setMode('family')` in `onOwnerReuseExisting()`
   - Added `setMode('family')` in `#createAndFinish()`

3. **app.routes.ts**
   - Added `canActivate: [authGuard]` to `mode-select` route
   - Added `canActivate: [authGuard]` to `family-setup` route

4. **expense-store.service.ts**
   - Enhanced debug logging in `loadFromDrive()`

5. **Documentation**
   - Created `debug-family-mode.md`
   - Created `FAMILY_MODE_FIXES.md` (this file)
   - Created `verify-family-mode.js`

---

## Next Steps

1. Deploy the updated app
2. Test with both owner and partner accounts
3. Verify the fixes work as expected
4. Monitor console logs for any issues
5. If issues persist, share console logs for further debugging
