package com.spenza.app;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

final class WidgetExpenseUtils {
    private WidgetExpenseUtils() {}

    static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    static String localDateToday() {
        return localDate(Calendar.getInstance());
    }

    static String localDate(Calendar calendar) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
    }

    static JSONObject buildExpenseEntry(
        SharedPreferences prefs,
        String type,
        double amount,
        String comment,
        String date,
        String accountId
    ) throws JSONException {
        return buildExpenseEntry(prefs, type, amount, comment, date, accountId, null);
    }

    static JSONObject buildExpenseEntry(
        SharedPreferences prefs,
        String type,
        double amount,
        String comment,
        String date,
        String accountId,
        String debtId
    ) throws JSONException {
        JSONObject entry = new JSONObject();
        double limit = calculateDailyLimit(prefs, type, date);
        String email = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
        String role = prefs.getString(WidgetExpenseConstants.OWNER_ROLE_KEY, null);

        entry.put("id", UUID.randomUUID().toString());
        entry.put("date", date == null || date.trim().isEmpty() ? localDateToday() : date);
        entry.put("amount", roundMoney(amount));
        entry.put("type", normalizeWidgetType(type));
        entry.put("limit", limit);
        entry.put("savings", roundMoney(limit - amount));
        entry.put("timestamp", isoNow());
        if (comment != null && !comment.trim().isEmpty()) entry.put("comment", comment.trim());
        if (debtId != null && !debtId.trim().isEmpty()) {
            // Credit-card purchase: linked to the card, never to an asset account.
            entry.put("debtId", debtId.trim());
        } else if (accountId != null && !accountId.trim().isEmpty()) {
            entry.put("accountId", accountId.trim());
        }
        if (email != null && !email.trim().isEmpty()) entry.put("createdByEmail", email);
        if (role != null && !role.trim().isEmpty()) entry.put("createdByRole", role);
        return entry;
    }

    /**
     * A queued credit-card bill payment. The app resolves it through
     * ExpenseStore.recordDebtPayment so the account deduction, card outstanding
     * reduction, expense entry, and payment audit record stay atomic.
     */
    static JSONObject buildCcPayment(
        SharedPreferences prefs,
        String debtId,
        String accountId,
        double amount,
        String comment,
        String detectedCardLast4
    ) throws JSONException {
        JSONObject payment = new JSONObject();
        String email = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
        String role = prefs.getString(WidgetExpenseConstants.OWNER_ROLE_KEY, null);

        payment.put("id", UUID.randomUUID().toString());
        if (debtId != null && !debtId.trim().isEmpty()) payment.put("debtId", debtId.trim());
        payment.put("accountId", accountId);
        payment.put("amount", roundMoney(amount));
        payment.put("date", localDateToday());
        if (comment != null && !comment.trim().isEmpty()) payment.put("comment", comment.trim());
        if (detectedCardLast4 != null && !detectedCardLast4.trim().isEmpty()) payment.put("ccLast4", detectedCardLast4.trim());
        payment.put("createdAt", isoNow());
        if (email != null && !email.trim().isEmpty()) payment.put("createdByEmail", email);
        if (role != null && !role.trim().isEmpty()) payment.put("createdByRole", role);
        return payment;
    }

    static JSONObject buildAccountAdjustment(
        SharedPreferences prefs,
        String accountId,
        double amount,
        String reason
    ) throws JSONException {
        JSONObject adjustment = new JSONObject();
        String email = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
        String role = prefs.getString(WidgetExpenseConstants.OWNER_ROLE_KEY, null);

        adjustment.put("id", UUID.randomUUID().toString());
        adjustment.put("accountId", accountId);
        adjustment.put("amount", roundMoney(amount));
        adjustment.put("kind", "increase");
        if (reason != null && !reason.trim().isEmpty()) adjustment.put("reason", reason.trim());
        adjustment.put("createdAt", isoNow());
        if (email != null && !email.trim().isEmpty()) adjustment.put("createdByEmail", email);
        if (role != null && !role.trim().isEmpty()) adjustment.put("createdByRole", role);
        return adjustment;
    }

    static JSONArray activeAccounts(SharedPreferences prefs) {
        JSONObject doc = localBackupDocument(prefs);
        JSONArray accounts = doc == null ? null : doc.optJSONArray("accounts");
        JSONArray active = new JSONArray();
        if (accounts == null) return active;
        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.optJSONObject(i);
            if (account != null && !account.optBoolean("archived", false)) {
                active.put(account);
            }
        }
        return active;
    }

    /** Active credit-card debt accounts from the cached backup document. */
    static JSONArray activeCreditCards(SharedPreferences prefs) {
        JSONObject doc = localBackupDocument(prefs);
        JSONArray debts = doc == null ? null : doc.optJSONArray("debts");
        JSONArray active = new JSONArray();
        if (debts == null) return active;
        for (int i = 0; i < debts.length(); i++) {
            JSONObject debt = debts.optJSONObject(i);
            if (debt == null) continue;
            if (!"credit-card".equals(debt.optString("type", ""))) continue;
            if (!"active".equals(debt.optString("status", "active"))) continue;
            active.put(debt);
        }
        return active;
    }

    static String normalizeWidgetType(String type) {
        if (type == null) return WidgetExpenseConstants.TYPE_MISC;
        String trimmed = type.trim();
        if ("Housing".equalsIgnoreCase(trimmed) || "Home".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_HOUSING;
        }
        if ("Food".equalsIgnoreCase(trimmed) || "Food & Groceries".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_FOOD;
        }
        if ("Transport".equalsIgnoreCase(trimmed) || "Transportation".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_TRANSPORT;
        }
        if ("Utilities".equalsIgnoreCase(trimmed) || "Bills".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_UTILITIES;
        }
        if ("Healthcare".equalsIgnoreCase(trimmed) || "Health".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_HEALTHCARE;
        }
        if ("Entertainment".equalsIgnoreCase(trimmed)) return WidgetExpenseConstants.TYPE_ENTERTAINMENT;
        if ("Dining".equalsIgnoreCase(trimmed) || "Dining Out".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_DINING;
        }
        if (
            "Shop".equalsIgnoreCase(trimmed)
                || "Shopping".equalsIgnoreCase(trimmed)
                || "Shopping/Clothing".equalsIgnoreCase(trimmed)
        ) {
            return WidgetExpenseConstants.TYPE_SHOPPING;
        }
        if ("Savings".equalsIgnoreCase(trimmed) || "Savings/Emergency Fund".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_SAVINGS;
        }
        if ("Investments".equalsIgnoreCase(trimmed) || "Investment".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_INVESTMENTS;
        }
        if ("Education".equalsIgnoreCase(trimmed)) return WidgetExpenseConstants.TYPE_EDUCATION;
        if ("Personal Care".equalsIgnoreCase(trimmed) || "Personal".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_PERSONAL;
        }
        if ("Subscriptions".equalsIgnoreCase(trimmed) || "Subscription".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_SUBSCRIPTIONS;
        }
        if ("Misc".equalsIgnoreCase(trimmed) || "Miscellaneous".equalsIgnoreCase(trimmed)) {
            return WidgetExpenseConstants.TYPE_MISC;
        }
        for (String allowed : WidgetExpenseConstants.ALLOWED_TYPES) {
            if (allowed.equals(trimmed)) return allowed;
        }
        return WidgetExpenseConstants.TYPE_MISC;
    }

    static double calculateDailyLimit(SharedPreferences prefs, String type, String date) {
        JSONObject doc = localBackupDocument(prefs);
        if (doc == null) return 0;
        double monthlyIncome = doc.optJSONObject("metadata") == null
            ? 0
            : doc.optJSONObject("metadata").optDouble("monthlyIncome", 0);
        JSONArray limits = doc.optJSONArray("limits");
        if (monthlyIncome <= 0 || limits == null) return 0;

        String normalizedType = normalizeWidgetType(type);
        double userPercentage = 0;
        for (int i = 0; i < limits.length(); i++) {
            JSONObject limit = limits.optJSONObject(i);
            if (limit != null && normalizedType.equals(limit.optString("type"))) {
                userPercentage = limit.optDouble("userPercentage", 0);
                break;
            }
        }
        if (userPercentage <= 0) return 0;
        return Math.ceil(((userPercentage / 100.0) * monthlyIncome) / daysInMonth(date));
    }

    private static JSONObject localBackupDocument(SharedPreferences prefs) {
        String raw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw).optJSONObject("doc");
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static int daysInMonth(String yyyyMmDd) {
        Calendar calendar = Calendar.getInstance();
        if (yyyyMmDd != null) {
            try {
                Date parsed = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(yyyyMmDd);
                if (parsed != null) calendar.setTime(parsed);
            } catch (ParseException ignored) {
                // Use current month.
            }
        }
        return calendar.getActualMaximum(Calendar.DAY_OF_MONTH);
    }

    static double roundMoney(double amount) {
        return Math.round(amount * 100.0) / 100.0;
    }
}
