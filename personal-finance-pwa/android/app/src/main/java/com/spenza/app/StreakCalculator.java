package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * StreakCalculator derives the user's daily expense-logging streak from the local
 * Drive backup snapshot plus current-account queued widget expenses.
 *
 * Streak rule (Duolingo-style): a day "counts" when at least one expense is logged on
 * that local date. The streak stays alive through the end of today as long as yesterday
 * was logged; it only resets to zero once a full day passes with nothing logged.
 *
 * This is read-only local logic and does not touch Drive, network, or auth.
 */
final class StreakCalculator {
    static final int STATE_ACTIVE = 0;   // today is already logged
    static final int STATE_AT_RISK = 1;  // streak alive but today not logged yet
    static final int STATE_BROKEN = 2;   // no live streak (broken or never started)

    private static final String BEST_STREAK_KEY = "spenza_streak_best_v1";

    final int currentStreak;
    final int longestStreak;
    final boolean todayComplete;
    final int state;
    /** Completion for the last 7 days; index 0 = 6 days ago, index 6 = today. */
    final boolean[] last7;
    final boolean hasData;

    private StreakCalculator(
        int currentStreak,
        int longestStreak,
        boolean todayComplete,
        int state,
        boolean[] last7,
        boolean hasData
    ) {
        this.currentStreak = currentStreak;
        this.longestStreak = longestStreak;
        this.todayComplete = todayComplete;
        this.state = state;
        this.last7 = last7;
        this.hasData = hasData;
    }

    static StreakCalculator from(Context context) {
        SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
        Set<String> days = loggedDays(context, prefs);
        String today = WidgetExpenseUtils.localDateToday();
        boolean todayComplete = days.contains(today);

        // Walk backwards from the latest "alive" anchor (today if logged, else yesterday).
        int current = 0;
        String cursor;
        if (todayComplete) {
            cursor = today;
        } else {
            String yesterday = shiftDate(today, -1);
            cursor = days.contains(yesterday) ? yesterday : null;
        }
        while (cursor != null && days.contains(cursor)) {
            current++;
            cursor = shiftDate(cursor, -1);
        }

        int longest = longestRun(days);
        int best = Math.max(longest, current);
        int persistedBest = 0;
        try {
            persistedBest = Integer.parseInt(prefs.getString(BEST_STREAK_KEY, "0"));
        } catch (NumberFormatException ignored) {
            // Fall back to 0.
        }
        best = Math.max(best, persistedBest);
        if (best != persistedBest) {
            prefs.edit().putString(BEST_STREAK_KEY, String.valueOf(best)).apply();
        }

        boolean[] last7 = new boolean[7];
        for (int i = 0; i < 7; i++) {
            last7[i] = days.contains(shiftDate(today, -(6 - i)));
        }

        int state;
        if (todayComplete) {
            state = STATE_ACTIVE;
        } else if (current > 0) {
            state = STATE_AT_RISK;
        } else {
            state = STATE_BROKEN;
        }

        return new StreakCalculator(current, best, todayComplete, state, last7, !days.isEmpty());
    }

    private static Set<String> loggedDays(Context context, SharedPreferences prefs) {
        Set<String> days = new HashSet<>();
        JSONObject doc = localBackupDocument(prefs);
        if (doc != null) {
            JSONArray expenses = doc.optJSONArray("expenses");
            if (expenses != null) {
                for (int i = 0; i < expenses.length(); i++) {
                    JSONObject entry = expenses.optJSONObject(i);
                    if (entry == null) continue;
                    String date = entry.optString("date", "");
                    if (!date.isEmpty()) days.add(date);
                }
            }
        }

        JSONArray queue = WidgetExpenseQueue.readQueue(context);
        String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
        if (queue != null && activeEmail != null) {
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item == null || !activeEmail.equals(item.optString("userEmail", null))) continue;
                JSONObject entry = item.optJSONObject("entry");
                if (entry == null) continue;
                String date = entry.optString("date", "");
                if (!date.isEmpty()) days.add(date);
            }
        }
        return days;
    }

    private static int longestRun(Set<String> days) {
        int longest = 0;
        for (String day : days) {
            // Only start counting from the first day of a run.
            if (days.contains(shiftDate(day, -1))) continue;
            int length = 0;
            String cursor = day;
            while (days.contains(cursor)) {
                length++;
                cursor = shiftDate(cursor, 1);
            }
            if (length > longest) longest = length;
        }
        return longest;
    }

    static String shiftDate(String date, int deltaDays) {
        Calendar calendar = Calendar.getInstance();
        try {
            Date parsed = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(date);
            if (parsed != null) calendar.setTime(parsed);
        } catch (ParseException ignored) {
            // Use current date.
        }
        calendar.add(Calendar.DAY_OF_MONTH, deltaDays);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
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
}
