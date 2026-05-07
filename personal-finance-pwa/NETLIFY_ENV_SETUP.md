# Netlify Environment Variables Setup

## Required Environment Variables

You need to add these environment variables in your Netlify Dashboard for the backend functions to work.

### Where to Add Them

1. Go to your Netlify site dashboard
2. Navigate to: **Site Settings** → **Environment Variables**
3. Click **"Add a variable"** or **"Add environment variables"**
4. Add each variable below

---

## Variables to Add

### 1. FIREBASE_PROJECT_ID

**Value:** Your Firebase project ID

**Where to find it:**
- Firebase Console → Project Settings → General
- Look for "Project ID"
- Example: `spenza-notifications`

```
Variable name: FIREBASE_PROJECT_ID
Value: your-project-id
```

---

### 2. FIREBASE_CLIENT_EMAIL

**Value:** Your Firebase service account email

**Where to find it:**
- Open your downloaded service account JSON file
- Look for the `client_email` field
- Example: `firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com`

```
Variable name: FIREBASE_CLIENT_EMAIL
Value: firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
```

---

### 3. FIREBASE_PRIVATE_KEY

**Value:** Your Firebase service account private key

**Where to find it:**
- Open your downloaded service account JSON file
- Look for the `private_key` field
- Copy the ENTIRE value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- Keep the `\n` characters (they represent line breaks)

**Important:** 
- Copy the value exactly as it appears in the JSON file
- Include the quotes if they're part of the value
- The key should look like: `"-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n"`

```
Variable name: FIREBASE_PRIVATE_KEY
Value: "-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

---

## Example Service Account JSON Structure

Your Firebase service account JSON file looks like this:

```json
{
  "type": "service_account",
  "project_id": "spenza-notifications",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@spenza-notifications.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

**Extract these three values:**
1. `project_id` → FIREBASE_PROJECT_ID
2. `client_email` → FIREBASE_CLIENT_EMAIL
3. `private_key` → FIREBASE_PRIVATE_KEY

---

## Verification

After adding the environment variables:

1. ✅ All three variables are added
2. ✅ Variable names are exactly as specified (case-sensitive)
3. ✅ Private key includes BEGIN/END markers
4. ✅ Private key includes `\n` characters

---

## Deploy

After setting environment variables:

1. **Redeploy your site** (environment variables only apply to new deployments)
2. Go to: **Deploys** → **Trigger deploy** → **Deploy site**
3. Wait for deployment to complete
4. Test your functions

---

## Testing Functions

Once deployed, your functions will be available at:

```
https://your-site.netlify.app/.netlify/functions/register-token
https://your-site.netlify.app/.netlify/functions/send-reminders
https://your-site.netlify.app/.netlify/functions/update-preferences
https://your-site.netlify.app/.netlify/functions/unregister-token
```

You can test the `send-reminders` function manually by visiting:
```
https://your-site.netlify.app/.netlify/functions/send-reminders
```

It should return a JSON response with the number of notifications sent.

---

## Troubleshooting

### Function returns 500 error
- Check Netlify function logs: **Functions** → Click on function → **Function log**
- Verify environment variables are set correctly
- Ensure private key has `\n` characters (not actual line breaks)

### "Firebase Admin initialization failed"
- Double-check all three environment variables
- Verify private key format
- Make sure you redeployed after adding variables

### "Permission denied" errors
- Verify Firestore security rules allow server-side access
- Check that service account has proper permissions in Firebase

---

## Security Notes

- ✅ Never commit the service account JSON file to Git
- ✅ Never expose environment variables in frontend code
- ✅ Only backend functions can access these variables
- ✅ Netlify encrypts environment variables at rest
