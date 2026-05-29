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
    static final String AI_SETTINGS_KEY = "spenza_ai_settings_private";
    static final String CURRENCY_KEY = "spenza_currency";
    static final String SPEND_NOTIFICATION_PROMPTS_ENABLED_KEY = "spenza_spend_notification_prompts_enabled_v1";
    static final String SPEND_NOTIFICATION_DEDUPE_KEY = "spenza_spend_notification_dedupe_v1";
    static final String WIDGET_CATEGORY_EXTRA = "com.spenza.app.WIDGET_CATEGORY";
    static final String WIDGET_AMOUNT_EXTRA = "com.spenza.app.WIDGET_AMOUNT";
    static final String WIDGET_COMMENT_EXTRA = "com.spenza.app.WIDGET_COMMENT";
    static final String WIDGET_SOURCE_EXTRA = "com.spenza.app.WIDGET_SOURCE";
    static final String WIDGET_AMOUNT_KIND_EXTRA = "com.spenza.app.WIDGET_AMOUNT_KIND";
    static final String WIDGET_AMOUNT_KIND_EXPENSE = "expense";
    static final String WIDGET_AMOUNT_KIND_CREDIT = "credit";
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
