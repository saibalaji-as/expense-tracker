package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * Hand-off of captured credit-card statement messages to the Angular app.
 *
 * The notification listener parses a bank's statement message on-device
 * (SpendNotificationClassifier.parseStatement) and stores only the FIGURES
 * here — total due, minimum due, due date, card last-4. The Angular
 * ExpenseStore reads this key on startup/resume, confirms the statement when
 * nothing needs a decision, otherwise asks the user in the statement dialog,
 * and rewrites the key with whatever is still waiting.
 *
 * PRIVACY: the message text itself is never stored; nothing here is synced.
 */
final class CardStatementDetections {
    private static final int MAX_ITEMS = 20;

    private CardStatementDetections() {}

    /**
     * Stores a detection. Returns false when the same statement (card + amount)
     * is already waiting, or when persisting fails.
     */
    static synchronized boolean append(Context context, SpendNotificationClassifier.StatementInfo statement) {
        if (statement == null || statement.amount < 0) return false;
        try {
            SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
            JSONArray existing = read(prefs);
            String userEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
            double amount = WidgetExpenseUtils.roundMoney(statement.amount);

            JSONArray next = new JSONArray();
            // Keep the newest MAX_ITEMS - 1 so the store never grows without bound.
            int start = Math.max(0, existing.length() - (MAX_ITEMS - 1));
            for (int i = start; i < existing.length(); i++) {
                JSONObject item = existing.optJSONObject(i);
                if (item == null) continue;
                boolean sameCard = sameText(item.optString("cardLast4", null), statement.cardLast4);
                boolean sameAmount = Math.abs(item.optDouble("amount", -1) - amount) < 0.005;
                boolean sameUser = sameText(item.optString("userEmail", null), userEmail);
                if (sameCard && sameAmount && sameUser) return false;
                next.put(item);
            }

            JSONObject detection = new JSONObject();
            detection.put("id", UUID.randomUUID().toString());
            detection.put("amount", amount);
            if (statement.minDue > 0) detection.put("minDue", WidgetExpenseUtils.roundMoney(statement.minDue));
            if (statement.dueDateStr != null) detection.put("dueDateStr", statement.dueDateStr);
            if (statement.cardLast4 != null) detection.put("cardLast4", statement.cardLast4);
            detection.put("detectedDateStr", WidgetExpenseUtils.localDateToday());
            if (userEmail != null) detection.put("userEmail", userEmail);
            next.put(detection);

            prefs.edit().putString(WidgetExpenseConstants.CARD_STATEMENT_DETECTIONS_KEY, next.toString()).apply();
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    private static JSONArray read(SharedPreferences prefs) {
        String raw = prefs.getString(WidgetExpenseConstants.CARD_STATEMENT_DETECTIONS_KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static boolean sameText(String a, String b) {
        String left = a == null || a.isEmpty() || "null".equals(a) ? null : a;
        String right = b == null || b.isEmpty() ? null : b;
        return left == null ? right == null : left.equals(right);
    }
}
