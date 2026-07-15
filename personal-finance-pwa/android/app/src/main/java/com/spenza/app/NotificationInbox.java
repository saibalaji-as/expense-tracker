package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * Device-local inbox of classified spend-notification detections.
 *
 * Every detection is persisted here BEFORE the review prompt is posted, so a
 * swiped/cleared prompt no longer loses the transaction — the Angular
 * /notifications screen recovers it from this store.
 *
 * PRIVACY: items contain SMS-derived text. This key must never be merged into
 * the Drive backup document or family Firestore sync. Only the resulting
 * ExpenseEntry / DebtPayment / adjustment (numbers, category, user comment)
 * ever leaves the device.
 */
final class NotificationInbox {
    private static final int MAX_ITEMS = 200;
    private static final long MAX_AGE_MS = 60L * 24 * 60 * 60 * 1000; // 60 days

    static final String STATUS_PENDING = "pending";
    static final String STATUS_LOGGED = "logged";

    private NotificationInbox() {}

    /**
     * Appends a pending detection and returns its inbox id.
     * Returns null when persisting fails; callers still show the prompt.
     */
    static synchronized String append(
        Context context,
        String kind,
        double amount,
        String currency,
        String comment,
        String sourcePackage,
        String cardLast4
    ) {
        try {
            SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
            JSONArray inbox = read(prefs);
            String id = UUID.randomUUID().toString();

            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
            item.put("detectedAt", isoNow());
            item.put("kind", kind);
            item.put("amount", WidgetExpenseUtils.roundMoney(amount));
            item.put("currency", currency);
            item.put("comment", comment == null ? "" : comment);
            item.put("sourceApp", sourcePackage == null ? "" : sourcePackage);
            if (cardLast4 != null && !cardLast4.trim().isEmpty()) {
                item.put("cardLast4", cardLast4.trim());
            }
            item.put("status", STATUS_PENDING);

            inbox.put(item);
            write(prefs, evict(inbox));
            return id;
        } catch (JSONException error) {
            return null;
        }
    }

    /** Marks an item's status (e.g. logged) and optionally links the created record id. */
    static synchronized void markStatus(Context context, String inboxId, String status, String linkedEntryId) {
        if (inboxId == null || inboxId.trim().isEmpty()) return;
        try {
            SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
            JSONArray inbox = read(prefs);
            boolean changed = false;
            for (int i = 0; i < inbox.length(); i++) {
                JSONObject item = inbox.optJSONObject(i);
                if (item == null || !inboxId.equals(item.optString("id"))) continue;
                item.put("status", status);
                item.put("statusChangedAt", isoNow());
                if (linkedEntryId != null && !linkedEntryId.trim().isEmpty()) {
                    item.put("linkedEntryId", linkedEntryId);
                }
                changed = true;
                break;
            }
            if (changed) write(prefs, inbox);
        } catch (JSONException ignored) {
            // Non-fatal: the Angular side re-derives handled state via auto-match.
        }
    }

    private static JSONArray read(SharedPreferences prefs) {
        String raw = prefs.getString(WidgetExpenseConstants.NOTIFICATION_INBOX_KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void write(SharedPreferences prefs, JSONArray inbox) {
        prefs.edit()
            .putString(WidgetExpenseConstants.NOTIFICATION_INBOX_KEY, inbox.toString())
            .apply();
    }

    /** Drops items older than 60 days, then trims oldest-first to the cap. */
    private static JSONArray evict(JSONArray inbox) {
        long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
        JSONArray fresh = new JSONArray();
        for (int i = 0; i < inbox.length(); i++) {
            JSONObject item = inbox.optJSONObject(i);
            if (item == null) continue;
            long detectedAt = parseIso(item.optString("detectedAt", ""));
            if (detectedAt == 0 || detectedAt >= cutoff) fresh.put(item);
        }
        if (fresh.length() <= MAX_ITEMS) return fresh;
        JSONArray capped = new JSONArray();
        for (int i = fresh.length() - MAX_ITEMS; i < fresh.length(); i++) {
            capped.put(fresh.optJSONObject(i));
        }
        return capped;
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static long parseIso(String value) {
        if (value == null || value.isEmpty()) return 0;
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date parsed = format.parse(value);
            return parsed == null ? 0 : parsed.getTime();
        } catch (Exception ignored) {
            return 0;
        }
    }
}
