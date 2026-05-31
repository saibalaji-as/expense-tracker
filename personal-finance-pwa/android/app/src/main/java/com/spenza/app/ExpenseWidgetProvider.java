package com.spenza.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

public class ExpenseWidgetProvider extends AppWidgetProvider {
    private static final int QUICK_MAX_HEIGHT_DP = 110;
    private static final int FIVE_COLUMN_MIN_WIDTH_DP = 360;

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ExpenseWidgetProvider.class));
        if (ids.length > 0) {
            new ExpenseWidgetProvider().onUpdate(context, manager, ids);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
        WidgetExpenseSyncWorker.schedule(context);
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
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        boolean quickOnly = minHeight > 0 && minHeight <= QUICK_MAX_HEIGHT_DP;
        boolean showShopping = minWidth >= FIVE_COLUMN_MIN_WIDTH_DP;
        int layoutId = quickOnly ? R.layout.expense_widget_quick : R.layout.expense_widget;
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        if (!quickOnly) {
            bindDailyInsight(context, views, false);
        }
        views.setViewVisibility(R.id.widget_shopping, showShopping ? View.VISIBLE : View.GONE);
        bindButton(context, views, R.id.widget_food, WidgetExpenseConstants.TYPE_FOOD, 101);
        bindButton(context, views, R.id.widget_transport, WidgetExpenseConstants.TYPE_TRANSPORT, 102);
        bindButton(context, views, R.id.widget_entertainment, WidgetExpenseConstants.TYPE_ENTERTAINMENT, 103);
        bindButton(context, views, R.id.widget_shopping, WidgetExpenseConstants.TYPE_SHOPPING, 104);
        bindButton(context, views, R.id.widget_more, WidgetExpenseConstants.TYPE_MORE, 105);
        bindCreditButton(context, views, R.id.widget_credit, 106);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static void bindButton(Context context, RemoteViews views, int viewId, String category, int requestCode) {
        Intent intent = new Intent(context, ExpenseWidgetActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(WidgetExpenseConstants.WIDGET_CATEGORY_EXTRA, category);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(viewId, pendingIntent);
    }

    private static void bindCreditButton(Context context, RemoteViews views, int viewId, int requestCode) {
        Intent intent = new Intent(context, ExpenseWidgetActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXTRA, WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(viewId, pendingIntent);
    }

    private static void bindDailyInsight(Context context, RemoteViews views, boolean compact) {
        DailyInsight insight = DailyInsight.from(context);
        String budgetText = compact
            ? insight.spentText + "\n" + insight.budgetText
            : insight.spentText + " spent of " + insight.budgetText;
        views.setTextViewText(R.id.widget_budget_amount, budgetText);
        views.setProgressBar(R.id.widget_budget_progress, 100, insight.progressPercent, false);
        views.setTextViewText(R.id.widget_trend_badge, insight.trendBadge);
        views.setTextViewText(R.id.widget_trend_text, insight.trendText);
    }

    private static final class DailyInsight {
        final String spentText;
        final String budgetText;
        final int progressPercent;
        final String trendBadge;
        final String trendText;

        private DailyInsight(String spentText, String budgetText, int progressPercent, String trendBadge, String trendText) {
            this.spentText = spentText;
            this.budgetText = budgetText;
            this.progressPercent = progressPercent;
            this.trendBadge = trendBadge;
            this.trendText = trendText;
        }

        static DailyInsight from(Context context) {
            SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
            JSONObject doc = localBackupDocument(prefs);
            if (doc == null) {
                return new DailyInsight("₹0", "₹0", 0, "0%", "Open Spenza once to load insight");
            }

            JSONObject metadata = doc.optJSONObject("metadata");
            String currency = metadata == null ? "INR" : metadata.optString("currency", "INR");
            double monthlyIncome = metadata == null ? 0 : metadata.optDouble("monthlyIncome", 0);
            JSONArray limits = doc.optJSONArray("limits");
            JSONArray expenses = doc.optJSONArray("expenses");
            String today = WidgetExpenseUtils.localDateToday();
            String yesterday = yesterday();
            double todaySpent = totalForDate(expenses, today);
            double yesterdaySpent = totalForDate(expenses, yesterday);
            JSONArray queued = WidgetExpenseQueue.readQueue(context);
            String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
            todaySpent += queuedTotalForDate(queued, today, activeEmail);
            yesterdaySpent += queuedTotalForDate(queued, yesterday, activeEmail);
            double dailyBudget = dailyBudget(monthlyIncome, limits, today);
            int progress = dailyBudget > 0 ? (int) Math.min(100, Math.round((todaySpent / dailyBudget) * 100)) : 0;
            return new DailyInsight(
                formatMoney(currency, todaySpent),
                formatMoney(currency, dailyBudget),
                progress,
                trendBadge(todaySpent, yesterdaySpent),
                trendText(todaySpent, yesterdaySpent)
            );
        }

        private static JSONObject localBackupDocument(SharedPreferences prefs) {
            String raw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
            if (raw == null) return null;
            try {
                JSONObject snapshot = new JSONObject(raw);
                return snapshot.optJSONObject("doc");
            } catch (JSONException ignored) {
                return null;
            }
        }

        private static double totalForDate(JSONArray expenses, String date) {
            if (expenses == null) return 0;
            double total = 0;
            for (int i = 0; i < expenses.length(); i++) {
                JSONObject entry = expenses.optJSONObject(i);
                if (entry != null && date.equals(entry.optString("date"))) {
                    total += entry.optDouble("amount", 0);
                }
            }
            return total;
        }

        private static double queuedTotalForDate(JSONArray queue, String date, String activeEmail) {
            if (queue == null || activeEmail == null) return 0;
            double total = 0;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject queuedItem = queue.optJSONObject(i);
                if (queuedItem == null || !activeEmail.equals(queuedItem.optString("userEmail", null))) continue;
                JSONObject entry = queuedItem.optJSONObject("entry");
                if (entry != null && date.equals(entry.optString("date"))) {
                    total += entry.optDouble("amount", 0);
                }
            }
            return total;
        }

        private static double dailyBudget(double monthlyIncome, JSONArray limits, String date) {
            double monthlyLimit = 0;
            if (limits != null) {
                for (int i = 0; i < limits.length(); i++) {
                    JSONObject limit = limits.optJSONObject(i);
                    if (limit != null) monthlyLimit += (limit.optDouble("userPercentage", 0) / 100.0) * monthlyIncome;
                }
            }
            if (monthlyLimit <= 0) monthlyLimit = monthlyIncome;
            return monthlyLimit <= 0 ? 0 : Math.ceil(monthlyLimit / daysInMonth(date));
        }

        private static int daysInMonth(String date) {
            Calendar calendar = Calendar.getInstance();
            try {
                String[] parts = date.split("-");
                calendar.set(Calendar.YEAR, Integer.parseInt(parts[0]));
                calendar.set(Calendar.MONTH, Integer.parseInt(parts[1]) - 1);
                calendar.set(Calendar.DAY_OF_MONTH, 1);
            } catch (Exception ignored) {
                // Use current month.
            }
            return calendar.getActualMaximum(Calendar.DAY_OF_MONTH);
        }

        private static String yesterday() {
            Calendar calendar = Calendar.getInstance();
            calendar.add(Calendar.DAY_OF_MONTH, -1);
            return WidgetExpenseUtils.localDate(calendar);
        }

        private static String trendBadge(double todaySpent, double yesterdaySpent) {
            if (yesterdaySpent <= 0) return todaySpent > 0 ? "New" : "0%";
            int percent = (int) Math.round(Math.abs((todaySpent - yesterdaySpent) / yesterdaySpent) * 100);
            return (todaySpent <= yesterdaySpent ? "↘ " : "↗ ") + percent + "%";
        }

        private static String trendText(double todaySpent, double yesterdaySpent) {
            if (yesterdaySpent <= 0) return todaySpent > 0 ? "First spend today" : "No spend logged today";
            int percent = (int) Math.round(Math.abs((todaySpent - yesterdaySpent) / yesterdaySpent) * 100);
            if (todaySpent <= yesterdaySpent) return percent + "% less than yesterday";
            return percent + "% more than yesterday";
        }

        private static String formatMoney(String currency, double amount) {
            String symbol;
            switch (currency) {
                case "USD":
                    symbol = "$";
                    break;
                case "AED":
                    symbol = "د.إ";
                    break;
                case "INR":
                default:
                    symbol = "₹";
                    break;
            }
            return symbol + String.format(Locale.US, "%.0f", Math.max(0, amount));
        }
    }
}
