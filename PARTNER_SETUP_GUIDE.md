# Partner Setup Guide - Step by Step

## Prerequisites
- Owner has created a shared backup file
- Owner has shared the file with your Google account in Google Drive
- Owner has given you the File ID

---

## First Time Setup

### Step 1: Open the App
Open the Spenza app in your browser.

### Step 2: Sign In
1. You'll see the sign-in page
2. Click **"Sign in with Google"**
3. Choose your Google account (the one the owner shared the file with)
4. Grant the requested permissions:
   - Google Sheets access
   - Google Drive access (appDataFolder)
   - Google Drive access (full)

### Step 3: Select Mode
After signing in, you'll be redirected to **Mode Selection**:
1. Click **"Family / Shared"**

### Step 4: Choose Role
You'll see two options:
1. Click **"I am a Partner"**

### Step 5: Enter File ID
1. Paste the File ID that the owner shared with you
2. Click **"Connect"**

### Step 6: Success!
- If successful, you'll be redirected to the app
- You should see the owner's data (expenses, limits, monthly income)
- You can now add/edit/delete expenses
- All changes sync with the owner

---

## What If It Doesn't Work?

### Error: "File not found or invalid"
**Cause**: The file ID is incorrect or the file doesn't exist.

**Solution**:
- Double-check the File ID (copy it again from the owner)
- Make sure there are no extra spaces
- Ask the owner to verify the file still exists in their Drive

### Error: "Access denied"
**Cause**: The owner hasn't shared the file with your Google account.

**Solution**:
- Ask the owner to share the file in Google Drive
- Make sure they shared it with the correct email address
- They should give you "Editor" access (not just "Viewer")

### No Data Showing
**Cause**: The shared file is empty.

**Solution**:
- Ask the owner to add some test data
- Refresh your app
- Data should appear

### Redirected to Mode Selection Again
**Cause**: You're using an old version of the app.

**Solution**:
- Clear your browser cache
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Sign in again
- Go through the setup flow again

---

## After Setup - Signing In Again

Once you've completed the setup, subsequent sign-ins are much simpler:

1. Open the app
2. Sign in with Google
3. **That's it!** You'll go directly to the app with all your data

The app remembers your configuration, so you don't need to enter the File ID again.

---

## Troubleshooting

### Check Your Configuration
Open the browser console (F12) and run:
```javascript
console.log('Mode:', localStorage.getItem('spenza_backup_mode'));
console.log('Shared File ID:', localStorage.getItem('spenza_shared_file_id'));
console.log('Owner Role:', localStorage.getItem('spenza_owner_role'));
```

**Expected output**:
```
Mode: family
Shared File ID: 1Www... (your file ID)
Owner Role: partner
```

If any of these are `null`, you need to go through the setup again.

---

## Common Questions

### Q: Can I use the app offline?
A: No, family mode requires an internet connection to sync with the shared Drive file.

### Q: Can I switch back to single user mode?
A: Yes, go to Settings → Backup Mode → Switch Mode. Your family data will be preserved.

### Q: What happens if the owner deletes the shared file?
A: You'll get an error when trying to load data. Ask the owner to restore the file or create a new one.

### Q: Can we both edit at the same time?
A: Yes, but the last person to save will overwrite the other's changes. It's best to coordinate who's entering data.

### Q: How do I know if my changes are synced?
A: Changes are saved immediately to Drive. If you see no errors, your changes are synced.

---

## Need Help?

If you're still having issues:
1. Check the browser console for error messages (F12)
2. Run the verification script: `verify-family-mode.js`
3. Share the console logs with the developer
4. Make sure you're using the latest version of the app
