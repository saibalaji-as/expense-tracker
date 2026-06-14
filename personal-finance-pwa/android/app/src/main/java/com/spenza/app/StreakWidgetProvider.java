package com.spenza.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * StreakWidgetProvider renders the Spenza Daily Streak home screen widget.
 *
 * Mirrors the standalone, removable design of {@link ExpenseWidgetProvider}: it only reads
 * local data, never blocks on Drive/network, and can be hidden by removing its manifest
 * receiver. Tapping the widget opens the Spenza app.
 */
public class StreakWidgetProvider extends AppWidgetProvider {
    private static final int COMPACT_MAX_HEIGHT_DP = 160;
    private static final int OPEN_APP_REQUEST_ROOT = 201;
    private static final int OPEN_APP_REQUEST_CTA = 202;

    private static final int[] DAY_DOT_IDS = {
        R.id.streak_day0, R.id.streak_day1, R.id.streak_day2, R.id.streak_day3,
        R.id.streak_day4, R.id.streak_day5, R.id.streak_day6
    };
    private static final int[] DAY_LABEL_IDS = {
        R.id.streak_lbl0, R.id.streak_lbl1, R.id.streak_lbl2, R.id.streak_lbl3,
        R.id.streak_lbl4, R.id.streak_lbl5, R.id.streak_lbl6
    };

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StreakWidgetProvider.class));
        if (ids.length > 0) {
            new StreakWidgetProvider().onUpdate(context, manager, ids);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
        StreakReminderScheduler.scheduleDailyStreakReminder(context);
    }

    @Override
    public void onEnabled(Context context) {
        StreakReminderScheduler.scheduleDailyStreakReminder(context);
    }

    @Override
    public void onDisabled(Context context) {
        // Last streak widget removed — stop the daily reminder.
        StreakReminderScheduler.cancelStreakReminder(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager appWidgetManager,
        int appWidgetId,
        Bundle newOptions
    ) {
        updateWidget(context, appWidgetManager, appWidgetId);
    }

    private static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        Bundle options = appWidgetManager.getAppWidgetOptions(appWidgetId);
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        boolean compact = minHeight > 0 && minHeight <= COMPACT_MAX_HEIGHT_DP;
        int layoutId = compact ? R.layout.streak_widget_compact : R.layout.streak_widget;

        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        WidgetTheme theme = WidgetTheme.from(context);
        theme.applySurface(context, views, R.id.widget_surface, options);
        StreakCalculator streak = StreakCalculator.from(context);
        bindCommon(context, views, streak);
        if (!compact) {
            bindDetails(context, views, streak);
            views.setTextColor(R.id.streak_title, theme.primaryColor());
            views.setInt(R.id.streak_cta, "setBackgroundResource", theme.ctaDrawable());
            views.setOnClickPendingIntent(R.id.streak_cta, openAppIntent(context, OPEN_APP_REQUEST_CTA));
        }
        views.setOnClickPendingIntent(R.id.streak_widget_root, openAppIntent(context, OPEN_APP_REQUEST_ROOT));
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static void bindCommon(Context context, RemoteViews views, StreakCalculator streak) {
        int countColor;
        int statusColor;
        int badgeBg;
        int flameRes;
        String statusText;

        switch (streak.state) {
            case StreakCalculator.STATE_ACTIVE:
                statusText = "On track";
                statusColor = R.color.spenza_food;
                countColor = R.color.spenza_flame_end;
                badgeBg = R.drawable.streak_flame_badge;
                flameRes = R.drawable.ic_widget_flame;
                break;
            case StreakCalculator.STATE_AT_RISK:
                statusText = "At risk";
                statusColor = R.color.spenza_streak_atrisk;
                countColor = R.color.spenza_streak_atrisk;
                badgeBg = R.drawable.streak_flame_badge_atrisk;
                flameRes = R.drawable.ic_widget_flame;
                break;
            case StreakCalculator.STATE_BROKEN:
            default:
                statusText = "Start today";
                statusColor = R.color.spenza_streak_broken;
                countColor = R.color.spenza_streak_broken;
                badgeBg = R.drawable.streak_flame_badge_broken;
                flameRes = R.drawable.ic_widget_flame_off;
                break;
        }

        views.setTextViewText(R.id.streak_count, String.valueOf(streak.currentStreak));
        views.setTextColor(R.id.streak_count, ContextCompat.getColor(context, countColor));
        views.setTextViewText(R.id.streak_count_label, streak.currentStreak == 1 ? "day streak" : "day streak");
        views.setTextViewText(R.id.streak_status, statusText);
        views.setTextColor(R.id.streak_status, ContextCompat.getColor(context, statusColor));
        views.setInt(R.id.streak_flame_badge, "setBackgroundResource", badgeBg);
        views.setImageViewResource(R.id.streak_flame_badge, flameRes);
    }

    private static void bindDetails(Context context, RemoteViews views, StreakCalculator streak) {
        views.setTextViewText(R.id.streak_best, "Best " + streak.longestStreak);
        views.setTextViewText(R.id.streak_message, messageFor(streak));

        String today = WidgetExpenseUtils.localDateToday();
        for (int i = 0; i < 7; i++) {
            String date = StreakCalculator.shiftDate(today, -(6 - i));
            boolean isToday = i == 6;
            int dotRes;
            if (streak.last7[i]) {
                dotRes = R.drawable.streak_day_dot_on;
            } else if (isToday) {
                dotRes = R.drawable.streak_day_dot_today;
            } else {
                dotRes = R.drawable.streak_day_dot_off;
            }
            views.setImageViewResource(DAY_DOT_IDS[i], dotRes);
            views.setTextViewText(DAY_LABEL_IDS[i], weekdayLetter(date));
        }
    }

    private static String messageFor(StreakCalculator streak) {
        switch (streak.state) {
            case StreakCalculator.STATE_ACTIVE:
                if (streak.currentStreak <= 1) {
                    return "First day done. Come back tomorrow to grow it.";
                }
                return "Day " + streak.currentStreak + " logged. Your streak is safe.";
            case StreakCalculator.STATE_AT_RISK:
                return "Don't break your " + streak.currentStreak + "-day streak — log before midnight.";
            case StreakCalculator.STATE_BROKEN:
            default:
                return streak.hasData
                    ? "Your streak reset. Log an expense today to start again."
                    : "Log your first expense to start a streak.";
        }
    }

    private static PendingIntent openAppIntent(Context context, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String weekdayLetter(String date) {
        Calendar calendar = Calendar.getInstance();
        try {
            Date parsed = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(date);
            if (parsed != null) calendar.setTime(parsed);
        } catch (ParseException ignored) {
            // Use current date.
        }
        switch (calendar.get(Calendar.DAY_OF_WEEK)) {
            case Calendar.SUNDAY: return "S";
            case Calendar.MONDAY: return "M";
            case Calendar.TUESDAY: return "T";
            case Calendar.WEDNESDAY: return "W";
            case Calendar.THURSDAY: return "T";
            case Calendar.FRIDAY: return "F";
            case Calendar.SATURDAY: return "S";
            default: return "";
        }
    }
}
