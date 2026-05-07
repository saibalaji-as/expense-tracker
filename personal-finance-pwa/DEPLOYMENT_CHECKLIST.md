# Deployment & Testing Checklist

## ✅ Step 1: Verify Netlify Deployment

### Check Deployment Status
1. Go to your Netlify Dashboard
2. Navigate to **Deploys** tab
3. Verify latest deploy shows **"Published"** status
4. Note your site URL (e.g., `https://your-site.netlify.app`)

### Check Functions Deployed
1. In Netlify Dashboard, go to **Functions** tab
2. You should see 4 functions listed:
   - ✅ register-token
   - ✅ send-reminders
   - ✅ update-preferences
   - ✅ unregister-token

---

## ✅ Step 2: Test Functions Manually

### Test 1: Send Reminders Function
Open this URL in your browser:
```
https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
```

**Expected Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "totalUsers": 0,
  "sent": 0,
  "skipped": 0,
  "errors": 0,
  "message": "Processed 0 users: 0 sent, 0 skipped, 0 errors"
}
```

**If you see this:** ✅ Backend is working!

**If you see 500 error:** ❌ Check environment variables and function logs

### Test 2: Check Function Logs
1. Netlify Dashboard → **Functions**
2. Click on **send-reminders**
3. View **Function log**
4. Look for:
   - ✅ "Firebase Admin initialized successfully"
   - ✅ "Starting reminder check..."
   - ❌ Any error messages

---

## ✅ Step 3: Test Frontend Integration

### Enable Notifications in Your App
1. Open your deployed PWA: `https://YOUR-SITE.netlify.app`
2. Go to **Settings** page
3. Find the **Notifications** section
4. Click **"Enable Notifications"**
5. Grant permission when browser asks

### Check Browser Console
Open DevTools (F12) and check console for:
- ✅ "FCM token obtained: ..."
- ✅ "FCM token registered successfully"
- ❌ Any error messages

### Verify in Firestore
1. Go to Firebase Console
2. Navigate to **Firestore Database**
3. Check **users** collection
4. You should see a document with your userId
5. Document should contain:
   ```
   fcmToken: "..."
   intervalMinutes: 60
   lastNotifiedAt: 0
   createdAt: (timestamp)
   ```

**If you see this:** ✅ Frontend → Backend → Firestore working!

---

## ✅ Step 4: Test Notification Delivery

### Test Foreground Notification (App Open)
1. Keep your app open
2. Manually trigger send-reminders:
   ```
   https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
   ```
3. Wait a few seconds
4. You should see a notification appear

**Note:** First notification won't send immediately because `lastNotifiedAt: 0` means "never notified", but the interval check might not trigger on first run. Update the Firestore document manually:

1. Go to Firestore Console
2. Find your user document
3. Edit `lastNotifiedAt` to a timestamp from 2 hours ago
4. Save
5. Trigger send-reminders again
6. You should receive notification!

### Test Background Notification (App Minimized)
1. Minimize your browser (don't close)
2. Trigger send-reminders again
3. You should see notification appear
4. Click notification → app should open/focus

### Test Sleep Mode (App Closed)
1. **Close your browser completely**
2. Wait 5 minutes
3. Trigger send-reminders (from another device or use cron)
4. You should receive notification even with browser closed!

**This is the key test!** If this works, FCM is working correctly.

---

## ✅ Step 5: Setup Cron Job

### Option A: cron-job.org (Recommended - Free)

1. Go to [cron-job.org](https://cron-job.org)
2. Click **"Sign up"** (free account)
3. Verify email
4. Click **"Create cronjob"**
5. Fill in details:
   - **Title:** `Spenza Reminders`
   - **Address (URL):** `https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders`
   - **Schedule:**
     - **Every:** `15 minutes`
     - Or use cron expression: `*/15 * * * *`
   - **Request method:** `GET`
   - **Request timeout:** `30 seconds`
6. Click **"Create cronjob"**
7. Enable the cronjob (toggle switch)

**Verify it's working:**
- Wait 15 minutes
- Check **Execution history** in cron-job.org
- Should show successful executions
- Check Netlify function logs for activity

---

### Option B: GitHub Actions (Alternative - Free)

Create file: `.github/workflows/send-reminders.yml`

```yaml
name: Send Reminders

on:
  schedule:
    # Runs every 15 minutes
    - cron: '*/15 * * * *'
  
  # Allows manual trigger from Actions tab
  workflow_dispatch:

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    
    steps:
      - name: Trigger Netlify Function
        run: |
          response=$(curl -s -w "\n%{http_code}" https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders)
          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | head -n-1)
          
          echo "HTTP Status: $http_code"
          echo "Response: $body"
          
          if [ "$http_code" != "200" ]; then
            echo "Error: Function returned $http_code"
            exit 1
          fi
```

**Commit and push:**
```bash
git add .github/workflows/send-reminders.yml
git commit -m "Add GitHub Actions cron job"
git push
```

**Verify:**
- Go to GitHub → Your repo → **Actions** tab
- You should see the workflow
- Click **"Run workflow"** to test manually

---

## ✅ Step 6: End-to-End Testing

### Complete User Flow Test

1. **Enable notifications:**
   - Open app → Settings
   - Enable notifications
   - Set interval to 15 minutes (for quick testing)
   - Check Firestore document created

2. **Wait for first notification:**
   - Close app completely
   - Wait 15-20 minutes
   - You should receive notification
   - Click notification → app opens

3. **Change interval:**
   - Open app → Settings
   - Change interval to 30 minutes
   - Check Firestore document updated

4. **Disable notifications:**
   - Open app → Settings
   - Disable notifications
   - Check Firestore document deleted
   - No more notifications should arrive

---

## ✅ Step 7: Monitor for 24 Hours

### Check These Metrics

**Netlify Functions:**
- Go to Functions → send-reminders
- Check invocation count (should be ~96/day with 15-min interval)
- Check error rate (should be 0%)
- Check average duration (should be <2 seconds)

**Firebase Firestore:**
- Check users collection size
- Monitor read/write operations
- Verify within free tier limits

**Cron Job:**
- Check execution history
- Verify 100% success rate
- Check response times

---

## 🐛 Troubleshooting

### Issue: "500 Internal Server Error" from functions

**Solution:**
1. Check Netlify function logs
2. Common causes:
   - Environment variables not set correctly
   - Private key format wrong (needs `\n` characters)
   - Firebase Admin SDK initialization failed

**Fix:**
- Go to Netlify → Site Settings → Environment Variables
- Verify all 3 variables are set
- For FIREBASE_PRIVATE_KEY, ensure it includes `\n` (not actual line breaks)
- Redeploy site after fixing

---

### Issue: "FCM token not generated"

**Solution:**
1. Check browser console for errors
2. Verify `firebase.config.ts` has correct values
3. Verify `firebase-messaging-sw.js` has correct values
4. Check VAPID key is correct

**Fix:**
- Update config files with correct Firebase credentials
- Commit and push
- Hard refresh browser (Ctrl+Shift+R)

---

### Issue: "Notification permission denied"

**Solution:**
- User must grant permission
- Check browser settings → Site permissions
- Some browsers block notifications by default

**Fix:**
- Clear site data and try again
- Check browser notification settings
- Try different browser

---

### Issue: "Notifications work when app open, not when closed"

**Solution:**
- This is what FCM solves!
- Verify service worker is registered
- Check firebase-messaging-sw.js is deployed

**Fix:**
1. Open DevTools → Application → Service Workers
2. Verify `firebase-messaging-sw.js` is registered
3. Check for errors in service worker
4. Unregister and re-register if needed

---

### Issue: "No notifications received after 15 minutes"

**Solution:**
1. Check cron job is running
2. Manually trigger send-reminders
3. Check Firestore lastNotifiedAt timestamp
4. Verify interval calculation

**Fix:**
- Check cron-job.org execution history
- Manually trigger: `https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders`
- Check Netlify function logs
- Verify user document exists in Firestore

---

## 📊 Success Metrics

After 24 hours, you should see:

- ✅ **Netlify Functions:** ~96 invocations (15-min interval)
- ✅ **Firestore Reads:** ~96 reads per user
- ✅ **Firestore Writes:** ~1 write per notification sent
- ✅ **FCM Messages:** Notifications delivered successfully
- ✅ **Error Rate:** 0%
- ✅ **User Feedback:** Notifications received even when app closed

---

## 🎉 Success Criteria

Your FCM implementation is successful when:

- ✅ Notifications work when app is open
- ✅ Notifications work when app is minimized
- ✅ **Notifications work when app is closed** ← KEY TEST
- ✅ **Notifications work when device is sleeping** ← KEY TEST
- ✅ Clicking notification opens the app
- ✅ Interval changes are respected
- ✅ Disabling stops notifications
- ✅ No errors in logs
- ✅ All within free tier limits

---

## 📝 Next Steps After Success

1. ✅ Set interval back to 60 minutes (or user preference)
2. ✅ Monitor for a week
3. ✅ Gather user feedback
4. ✅ Consider enhancements:
   - Custom notification messages
   - Different notification times
   - Notification categories
   - Rich notifications with actions

---

## 🆘 Need Help?

**Check logs:**
- Netlify: Functions → send-reminders → Function log
- Firebase: Firestore Database → users collection
- Browser: DevTools → Console

**Review documentation:**
- `API_REFERENCE.md` - API details
- `FCM_INTEGRATION_DIAGRAM.md` - Architecture
- `NETLIFY_ENV_SETUP.md` - Environment variables

**Common issues:**
- Environment variables not set → Redeploy after setting
- Config files not updated → Update and commit
- Service worker not registered → Check DevTools
- Cron job not running → Check cron-job.org

---

**Ready to test?** Follow the steps above in order!
