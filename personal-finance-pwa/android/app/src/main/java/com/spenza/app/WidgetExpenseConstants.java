package com.spenza.app;

final class WidgetExpenseConstants {
    static final String PREFS_NAME = "CapacitorStorage";
    static final String QUEUE_KEY = "spenza_widget_expense_queue_v1";
    static final String LOCAL_BACKUP_CACHE_KEY = "spenza_drive_backup_snapshot_v1";
    static final String AUTH_STATE_KEY = "gapi_auth_state";
    static final String USER_EMAIL_KEY = "gapi_user_email";
    static final String ACCESS_TOKEN_KEY = "gapi_access_token";
    static final String ACCESS_TOKEN_EXPIRES_AT_KEY = "gapi_access_token_expires_at";
    static final String BACKUP_MODE_KEY = "spenza_backup_mode";
    static final String SHARED_FILE_ID_KEY = "spenza_shared_file_id";
    static final String OWNER_ROLE_KEY = "spenza_owner_role";
    // Firestore-based family instant sync (widget → partner) plumbing.
    static final String FIRESTORE_FAMILY_ID_KEY = "spenza_firestore_family_id";
    // Display-only overlay of partner ledger records delivered by FCM while the
    // app is closed (widget two-way sync). Never synced anywhere.
    static final String PARTNER_PENDING_KEY = "spenza_widget_partner_pending_v1";
    // Rotated FCM token handoff: onNewToken (Java, no Firebase ID token available)
    // stashes the fresh token here; the Angular layer re-registers it with the
    // backend on next launch (NotificationService.ensureNativeTokenFresh) and
    // clears the key. Without this, token rotation silently killed the
    // owner→partner widget push (notifyPartnerLedgerWrite found no live token).
    static final String PENDING_FCM_TOKEN_KEY = "spenza_fcm_pending_token_v1";
    static final String FIREBASE_UID_KEY = "firebase_uid";
    static final String FIREBASE_REFRESH_TOKEN_KEY = "firebase_refresh_token";
    static final String FIREBASE_API_KEY = "AIzaSyBAIhHX1sfUPpRpHTdLUf5TE0snqI904hg";
    static final String SECURETOKEN_URL = "https://securetoken.googleapis.com/v1/token?key=" + FIREBASE_API_KEY;
    // Family Ledger commit (record-level Firestore sync — see
    // docs/family-sync-centralization-plan.md). The legacy
    // syncWidgetExpenseToFamily endpoint remains deployed for older APKs.
    static final String FAMILY_WIDGET_SYNC_URL =
        "https://us-central1-spenza-notifications.cloudfunctions.net/commitFamilyLedger";
    static final String AI_SETTINGS_KEY = "spenza_ai_settings_private";
    static final String CURRENCY_KEY = "spenza_currency";
    static final String SPEND_NOTIFICATION_PROMPTS_ENABLED_KEY = "spenza_spend_notification_prompts_enabled_v1";
    static final String SPEND_NOTIFICATION_DEDUPE_KEY = "spenza_spend_notification_dedupe_v1";
    // Device-local notification inbox. PRIVACY: contains SMS-derived text; must
    // never be synced into the Drive backup or family Firestore documents.
    static final String NOTIFICATION_INBOX_KEY = "spenza_notification_inbox_v1";
    static final String WIDGET_INBOX_ID_EXTRA = "com.spenza.app.WIDGET_INBOX_ID";
    static final String PRO_TIER_KEY = "spenza_pro_tier";
    static final String WIDGET_CATEGORY_EXTRA = "com.spenza.app.WIDGET_CATEGORY";
    static final String WIDGET_AMOUNT_EXTRA = "com.spenza.app.WIDGET_AMOUNT";
    static final String WIDGET_COMMENT_EXTRA = "com.spenza.app.WIDGET_COMMENT";
    static final String WIDGET_SOURCE_EXTRA = "com.spenza.app.WIDGET_SOURCE";
    static final String WIDGET_AMOUNT_KIND_EXTRA = "com.spenza.app.WIDGET_AMOUNT_KIND";
    static final String WIDGET_AMOUNT_KIND_EXPENSE = "expense";
    static final String WIDGET_AMOUNT_KIND_CREDIT = "credit";
    static final String WIDGET_AMOUNT_KIND_CC_PAYMENT = "cc-payment";
    /** Circle Splits mode: the dialog shows circle fields only (circle picker,
     *  description, amount) and queues a `circle-expense` item for the app. */
    static final String WIDGET_AMOUNT_KIND_CIRCLE = "circle";
    static final String WIDGET_IS_CREDIT_CARD_EXTRA = "com.spenza.app.WIDGET_IS_CREDIT_CARD";
    static final String WIDGET_CC_LAST4_EXTRA = "com.spenza.app.WIDGET_CC_LAST4";
    static final String WIDGET_IS_SALARY_EXTRA = "com.spenza.app.WIDGET_IS_SALARY";
    static final String WIDGET_SOURCE_NOTIFICATION_PROMPT = "notification-prompt";
    static final String TYPE_MORE = "__spenza_more__";
    static final String SYNC_WORK_NAME = "spenza-widget-expense-sync";

    static final String TYPE_HOUSING = "Housing";
    static final String TYPE_FOOD = "Food & Groceries";
    static final String TYPE_TRANSPORT = "Transportation";
    static final String TYPE_UTILITIES = "Utilities";
    static final String TYPE_HEALTHCARE = "Healthcare";
    static final String TYPE_ENTERTAINMENT = "Entertainment";
    static final String TYPE_DINING = "Dining Out";
    static final String TYPE_SHOPPING = "Shopping/Clothing";
    static final String TYPE_SAVINGS = "Savings/Emergency Fund";
    static final String TYPE_INVESTMENTS = "Investments";
    static final String TYPE_EDUCATION = "Education";
    static final String TYPE_PERSONAL = "Personal Care";
    static final String TYPE_SUBSCRIPTIONS = "Subscriptions";
    static final String TYPE_MISC = "Miscellaneous";

    static final String[] ALLOWED_TYPES = {
        TYPE_HOUSING,
        TYPE_FOOD,
        TYPE_TRANSPORT,
        TYPE_UTILITIES,
        TYPE_HEALTHCARE,
        TYPE_ENTERTAINMENT,
        TYPE_DINING,
        TYPE_SHOPPING,
        TYPE_SAVINGS,
        TYPE_INVESTMENTS,
        TYPE_EDUCATION,
        TYPE_PERSONAL,
        TYPE_SUBSCRIPTIONS,
        TYPE_MISC,
    };

    static final String FUNCTIONS_BASE_URL = "https://spenzaio.netlify.app/.netlify/functions";

    private WidgetExpenseConstants() {}
}
