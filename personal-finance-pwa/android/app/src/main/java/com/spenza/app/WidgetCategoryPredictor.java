package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * Local, deterministic "most likely category" predictor for the home-screen widget.
 *
 * <p>Scores each predefined expense type from the user's own recent history in the cached
 * Drive backup snapshot (plus current-account queued widget entries), weighting by:
 * <ul>
 *   <li>recency — exponential decay so the last few weeks dominate;</li>
 *   <li>time-of-day — entries logged around the current hour score higher (coffee in the
 *       morning, dinner in the evening);</li>
 *   <li>day-of-week — same weekday gets a small bonus (weekend vs weekday habits).</li>
 * </ul>
 *
 * <p>Purely on-device and read-only: no network, no Gemini, no writes. Returns {@code null}
 * when there is not enough history to make a confident guess, so callers can fall back to a
 * neutral default such as {@code Miscellaneous}.
 */
final class WidgetCategoryPredictor {
    private WidgetCategoryPredictor() {}

    /** Look back window; older entries are ignored entirely. */
    private static final int MAX_HISTORY_DAYS = 90;
    /** Recency half-life in days for the exponential decay. */
    private static final double RECENCY_HALF_LIFE_DAYS = 21.0;
    /** Minimum total weighted score before we trust a prediction. */
    private static final double MIN_CONFIDENCE = 0.5;

    /** Convenience entry point: predicts from the app's cached snapshot + widget queue. */
    static String predictType(Context context) {
        SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
        JSONArray queue = WidgetExpenseQueue.readQueue(context);
        String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
        return predictType(prefs, queue, activeEmail);
    }

    static String predictType(SharedPreferences prefs, JSONArray queue, String activeEmail) {
        try {
            Calendar now = Calendar.getInstance();
            int nowHour = now.get(Calendar.HOUR_OF_DAY);
            int nowDow = now.get(Calendar.DAY_OF_WEEK);
            long todayMidnight = midnight(now);

            Map<String, Double> scores = new HashMap<>();

            JSONArray expenses = snapshotExpenses(prefs);
            if (expenses != null) {
                for (int i = 0; i < expenses.length(); i++) {
                    accumulate(scores, expenses.optJSONObject(i), nowHour, nowDow, todayMidnight);
                }
            }
            // Most recent taps may live only in the queue until Drive sync runs.
            if (queue != null) {
                for (int i = 0; i < queue.length(); i++) {
                    JSONObject queuedItem = queue.optJSONObject(i);
                    if (queuedItem == null) continue;
                    if (!"expense".equals(queuedItem.optString("kind", "expense"))) continue;
                    String queuedEmail = queuedItem.optString("userEmail", null);
                    if (activeEmail != null && queuedEmail != null && !activeEmail.equals(queuedEmail)) {
                        continue;
                    }
                    JSONObject entry = queuedItem.optJSONObject("entry");
                    if (entry == null) entry = queuedItem;
                    accumulate(scores, entry, nowHour, nowDow, todayMidnight);
                }
            }

            String best = null;
            double bestScore = 0;
            for (Map.Entry<String, Double> e : scores.entrySet()) {
                if (e.getValue() > bestScore) {
                    bestScore = e.getValue();
                    best = e.getKey();
                }
            }
            return bestScore >= MIN_CONFIDENCE ? best : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static void accumulate(
        Map<String, Double> scores,
        JSONObject entry,
        int nowHour,
        int nowDow,
        long todayMidnight
    ) {
        if (entry == null) return;
        String type = WidgetExpenseUtils.normalizeWidgetType(entry.optString("type", null));
        if (type == null || type.trim().isEmpty()) return;

        String date = entry.optString("date", null);
        long entryMidnight = midnightFromDate(date);
        if (entryMidnight <= 0) return;
        long daysAgo = Math.round((todayMidnight - entryMidnight) / (double) DAY_MS);
        if (daysAgo < 0) daysAgo = 0;
        if (daysAgo > MAX_HISTORY_DAYS) return;

        double recency = Math.pow(0.5, daysAgo / RECENCY_HALF_LIFE_DAYS);

        double timeBonus = 1.0;
        int entryHour = hourOf(entry.optString("timestamp", null));
        if (entryHour >= 0) {
            int diff = circularHourDistance(entryHour, nowHour);
            if (diff <= 1) timeBonus = 2.0;
            else if (diff <= 2) timeBonus = 1.6;
            else if (diff <= 3) timeBonus = 1.3;
        }

        double dowBonus = (dowOf(entryMidnight) == nowDow) ? 1.25 : 1.0;

        double weight = recency * timeBonus * dowBonus;
        Double current = scores.get(type);
        scores.put(type, (current == null ? 0 : current) + weight);
    }

    private static final long DAY_MS = 24L * 60 * 60 * 1000;

    private static JSONArray snapshotExpenses(SharedPreferences prefs) {
        String raw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
        if (raw == null) return null;
        try {
            JSONObject doc = new JSONObject(raw).optJSONObject("doc");
            return doc == null ? null : doc.optJSONArray("expenses");
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static long midnight(Calendar calendar) {
        Calendar c = (Calendar) calendar.clone();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    private static long midnightFromDate(String yyyyMmDd) {
        if (yyyyMmDd == null || yyyyMmDd.trim().isEmpty()) return 0;
        try {
            String[] parts = yyyyMmDd.split("-");
            Calendar c = Calendar.getInstance();
            c.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]), 0, 0, 0);
            c.set(Calendar.MILLISECOND, 0);
            return c.getTimeInMillis();
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static int dowOf(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        return c.get(Calendar.DAY_OF_WEEK);
    }

    /** Parses the local hour-of-day from a UTC ISO timestamp; -1 when unavailable. */
    private static int hourOf(String isoTimestamp) {
        if (isoTimestamp == null || isoTimestamp.trim().isEmpty()) return -1;
        try {
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date parsed = fmt.parse(isoTimestamp);
            if (parsed == null) return -1;
            Calendar c = Calendar.getInstance();
            c.setTime(parsed);
            return c.get(Calendar.HOUR_OF_DAY);
        } catch (Exception ignored) {
            return -1;
        }
    }

    private static int circularHourDistance(int a, int b) {
        int diff = Math.abs(a - b) % 24;
        return Math.min(diff, 24 - diff);
    }
}
