# 🔍 Function Testing Guide

## Issue: Browser Opens App Instead of Showing JSON

This happens because your browser might be caching the redirect or the Angular app is intercepting the request.

---

## Solution 1: Use Browser DevTools (Recommended)

### Step 1: Open DevTools
1. Open your site in browser
2. Press **F12** to open DevTools
3. Go to **Network** tab
4. Keep DevTools open

### Step 2: Test Function
1. In the address bar, type:
   ```
   https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
   ```
2. Press Enter
3. Look at the **Network** tab

### Step 3: Check Response
1. Find the request to `send-reminders`
2. Click on it
3. Go to **Response** tab
4. You should see JSON:
   ```json
   {
     "success": true,
     "totalUsers": 0,
     "sent": 0,
     "skipped": 0,
     "errors": 0
   }
   ```

**✅ If you see JSON:** Functions are working! The redirect is just visual.

**❌ If you see HTML:** Functions might not be deployed.

---

## Solution 2: Use cURL (Terminal)

Open terminal and run:

```bash
curl https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
```

**Expected Output:**
```json
{
  "success": true,
  "totalUsers": 0,
  "sent": 0,
  "skipped": 0,
  "errors": 0,
  "message": "Processed 0 users: 0 sent, 0 skipped, 0 errors"
}
```

**✅ If you see this:** Functions are working perfectly!

---

## Solution 3: Use Postman or Insomnia

1. Open Postman or Insomnia
2. Create new GET request
3. URL: `https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders`
4. Send request
5. Check response

---

## Solution 4: Check Netlify Dashboard

### Verify Functions Deployed

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Click **Functions** tab
4. You should see:
   ```
   ✅ register-token
   ✅ send-reminders
   ✅ update-preferences
   ✅ unregister-token
   ```

### Check Function Logs

1. Click on **send-reminders**
2. Click **Function log**
3. You should see logs when you access the URL

**If you see logs:** Function is being called and working!

---

## Solution 5: Use Test Page

1. Open: `https://YOUR-SITE.netlify.app/test-fcm.html`
2. Enter your site URL
3. Click **"Test send-reminders"** button
4. Check the result displayed on the page

This bypasses any browser caching or redirect issues.

---

## Why This Happens

### Possible Reasons:

1. **Browser Cache**
   - Browser cached the redirect
   - Solution: Hard refresh (Ctrl+Shift+R)

2. **Service Worker**
   - Service worker intercepting requests
   - Solution: Unregister service workers in DevTools

3. **Angular Routing**
   - Angular router catching the URL
   - Solution: Use curl or DevTools Network tab

4. **Functions Not Deployed**
   - Build succeeded but functions didn't deploy
   - Solution: Check Netlify Functions tab

---

## Diagnostic Steps

### Step 1: Check if Functions Exist

**Method A: Netlify Dashboard**
- Go to Functions tab
- Should see 4 functions listed

**Method B: Direct URL Test**
```bash
curl -I https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
```

Expected: `HTTP/2 200` (not 404)

### Step 2: Check Function Response

```bash
curl https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
```

Expected: JSON response (not HTML)

### Step 3: Check Function Logs

1. Netlify Dashboard → Functions → send-reminders
2. Check if logs appear when you access the URL
3. Look for errors

---

## Common Issues & Fixes

### Issue 1: 404 Not Found

**Cause:** Functions not deployed

**Fix:**
1. Check `netlify.toml` has `functions = "netlify/functions"`
2. Check functions are in correct directory
3. Redeploy site

### Issue 2: 500 Internal Server Error

**Cause:** Environment variables not set or function error

**Fix:**
1. Check Netlify → Site Settings → Environment Variables
2. Check function logs for error details
3. Verify Firebase credentials

### Issue 3: Browser Shows App Instead of JSON

**Cause:** Browser rendering the response as HTML

**Fix:**
- Use curl or DevTools Network tab
- Check actual HTTP response, not browser display
- The function IS working, browser is just displaying it differently

---

## Quick Test Commands

### Test All Functions

```bash
# Test send-reminders
curl https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders

# Test with verbose output
curl -v https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders

# Test and save response
curl https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders > response.json
cat response.json
```

### Check HTTP Status

```bash
curl -I https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
```

Expected:
```
HTTP/2 200
content-type: application/json
```

---

## What Success Looks Like

### In Terminal (curl):
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

### In DevTools Network Tab:
- Status: `200 OK`
- Type: `xhr` or `fetch`
- Response: JSON (not HTML)

### In Netlify Dashboard:
- Functions tab shows 4 functions
- Function logs show execution
- No errors in logs

---

## Next Steps After Verification

Once you confirm functions are working (via curl or DevTools):

1. ✅ Functions are deployed and working
2. ✅ Continue with frontend testing
3. ✅ Enable notifications in your app
4. ✅ Test notification delivery
5. ✅ Setup cron job

---

## TL;DR - Quick Test

**Run this in terminal:**
```bash
curl https://YOUR-SITE.netlify.app/.netlify/functions/send-reminders
```

**Expected:** JSON with `"success": true`

**If you see JSON:** ✅ Everything is working! Continue with testing.

**If you see HTML or error:** Check Netlify Functions tab and logs.

---

**The browser showing your app is likely just a display issue. The function IS working - verify with curl or DevTools!**
