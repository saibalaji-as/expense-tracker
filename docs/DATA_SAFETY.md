# Spenza — Google Play Data Safety Reference

This document records what data Spenza collects, why, and how — for accurate
completion of the Google Play Data Safety form.

---

## Data Collected

### Personal Info
- Email address (Google Sign-In) — required, encrypted in transit
- Name (Google Sign-In) — required, encrypted in transit

### Financial Info
- Expense amounts and categories — stored in user's own Google Drive
- Account balances — stored in user's own Google Drive
- Subscription tier and expiry — stored in Firebase Firestore

### Payment Info
- Payments processed by Razorpay
- No card or payment details stored by Spenza
- Razorpay is a sub-processor under their own privacy policy

### Device Info
- FCM push token — for reminders, stored in Firestore
- Timezone — for scheduling reminders, stored in Firestore

### App Activity
- Google Drive file access (backup files only)
- Google Sheets access (import only, user-initiated)

---

## Data NOT Collected
- No browsing history
- No contacts
- No location
- No notification content (processed on-device only, never uploaded)

---

## User Controls
- Delete all data: Settings → Delete Account
- Disable notifications: Settings → Notifications
- Export data: Settings → Export Backup
- Revoke Drive access: Google Account settings
