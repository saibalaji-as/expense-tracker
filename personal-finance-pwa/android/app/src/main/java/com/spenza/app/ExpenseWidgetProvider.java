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
    // Two size tiers only (widget is 4x1 or 4x2; taller resizing is blocked via
    // maxResizeHeight): <=70dp (one row) -> buttons-only quick layout, otherwise
    // the 2-row layout with the budget header.
    private static final int QUICK_MAX_HEIGHT_DP = 70;
    private static final int FIVE_COLUMN_MIN_WIDTH_DP = 360;

    // Category chip icon views, restyled per app design style (glass/neu/clay/brutal).
    private static final int[] CHIP_ICON_IDS = {
        R.id.widget_food_icon, R.id.widget_transport_icon, R.id.widget_entertainment_icon,
        R.id.widget_shopping_icon, R.id.widget_more_icon, R.id.widget_credit_icon
    };
    private static final int[] CHIP_CLAY_BGS = {
        R.drawable.widget_chip_clay_food, R.drawable.widget_chip_clay_transport,
        R.drawable.widget_chip_clay_entertainment, R.drawable.widget_chip_clay_shopping,
        R.drawable.widget_chip_clay_misc, R.drawable.widget_chip_clay_credit
    };
    private static final int[] CHIP_BRUTAL_BGS = {
        R.drawable.widget_chip_brutal_food, R.drawable.widget_chip_brutal_transport,
        R.drawable.widget_chip_brutal_entertainment, R.drawable.widget_chip_brutal_shopping,
        R.drawable.widget_chip_brutal_misc, R.drawable.widget_chip_brutal_credit
    };

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ExpenseWidgetProvider.class));
        if (ids.length > 0) {
            new ExpenseWidgetProvider().onUpdate(context, manager, ids);
        }
        // A new expense/snapshot also changes today's streak — keep the streak widget in sync.
        StreakWidgetProvider.updateAll(context);
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
        WidgetTheme theme = WidgetTheme.from(context);
        theme.applySurface(context, views, R.id.widget_surface, options);
        if (!quickOnly) {
            bindDailyInsight(context, views);
            // The "spent of budget" line is the widget's hero — tint it with the
            // user's palette so the widget matches the in-app theme.
            views.setTextColor(R.id.widget_budget_amount, theme.primaryColor());
            views.setInt(R.id.expense_widget_brand, "setBackgroundResource", theme.ctaDrawable());
        }
        applyDesignStyle(views, theme, quickOnly);
        views.setViewVisibility(R.id.widget_shopping, showShopping ? View.VISIBLE : View.GONE);
        bindButton(context, views, R.id.widget_food, WidgetExpenseConstants.TYPE_FOOD, 101);
        bindButton(context, views, R.id.widget_transport, WidgetExpenseConstants.TYPE_TRANSPORT, 102);
        bindButton(context, views, R.id.widget_entertainment, WidgetExpenseConstants.TYPE_ENTERTAINMENT, 103);
        bindButton(context, views, R.id.widget_shopping, WidgetExpenseConstants.TYPE_SHOPPING, 104);
        bindButton(context, views, R.id.widget_more, WidgetExpenseConstants.TYPE_MORE, 105);
        bindCreditButton(context, views, R.id.widget_credit, 106);
        applyPredictedHighlight(context, views, showShopping);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * Restyles the widget's inner elements (category chips, trend pill, brand badge)
     * to match the app's selected design style so the widget reads as glass /
     * neumorphism / claymorphism / neobrutalism, not just its background surface.
     * The XML defaults stay as a safe fallback.
     */
    private static void applyDesignStyle(RemoteViews views, WidgetTheme theme, boolean quickOnly) {
        switch (theme.style()) {
            case WidgetSurface.GLASS:
                for (int id : CHIP_ICON_IDS) {
                    views.setInt(id, "setBackgroundResource", R.drawable.widget_chip_glass);
                }
                if (!quickOnly) {
                    views.setInt(R.id.widget_trend_badge, "setBackgroundResource", R.drawable.widget_pill_glass);
                }
                break;
            case WidgetSurface.NEUMORPHISM:
                for (int id : CHIP_ICON_IDS) {
                    views.setInt(id, "setBackgroundResource", R.drawable.widget_chip_neu);
                }
                break;
            case WidgetSurface.CLAYMORPHISM:
                for (int i = 0; i < CHIP_ICON_IDS.length; i++) {
                    views.setInt(CHIP_ICON_IDS[i], "setBackgroundResource", CHIP_CLAY_BGS[i]);
                }
                break;
            case WidgetSurface.NEOBRUTALISM:
                for (int i = 0; i < CHIP_ICON_IDS.length; i++) {
                    views.setInt(CHIP_ICON_IDS[i], "setBackgroundResource", CHIP_BRUTAL_BGS[i]);
                }
                if (!quickOnly) {
                    views.setInt(R.id.widget_trend_badge, "setBackgroundResource", R.drawable.widget_pill_brutal);
                    views.setInt(R.id.expense_widget_brand, "setBackgroundResource", R.drawable.widget_brand_badge_brutal);
                }
                break;
        }
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

    /**
     * Highlights the quick-action button for the category the user is most likely to log
     * right now (from {@link WidgetCategoryPredictor}). When the predicted category has no
     * dedicated quick button — or the Shopping slot is hidden — we highlight "More", which
     * already opens the form pre-selected to the predicted category. No-ops when there is
     * not enough history to predict.
     */
    private static void applyPredictedHighlight(Context context, RemoteViews views, boolean showShopping) {
        int viewId = predictedButtonId(WidgetCategoryPredictor.predictType(context), showShopping);
        if (viewId != 0) {
            views.setInt(viewId, "setBackgroundResource", R.drawable.widget_predicted_highlight);
        }
    }

    private static int predictedButtonId(String predicted, boolean showShopping) {
        if (predicted == null) return 0;
        if (WidgetExpenseConstants.TYPE_FOOD.equals(predicted)) return R.id.widget_food;
        if (WidgetExpenseConstants.TYPE_TRANSPORT.equals(predicted)) return R.id.widget_transport;
        if (WidgetExpenseConstants.TYPE_ENTERTAINMENT.equals(predicted)) return R.id.widget_entertainment;
        if (WidgetExpenseConstants.TYPE_SHOPPING.equals(predicted)) {
            return showShopping ? R.id.widget_shopping : R.id.widget_more;
        }
        // Any other predicted category lives behind the More form, which opens pre-selected.
        return R.id.widget_more;
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

    private static void bindDailyInsight(Context context, RemoteViews views) {
        DailyInsight insight = DailyInsight.from(context);
        views.setTextViewText(R.id.widget_budget_amount, insight.spentText + " of " + insight.budgetText);
        views.setProgressBar(R.id.widget_budget_progress, 100, insight.progressPercent, false);
        views.setTextViewText(R.id.widget_trend_badge, insight.trendBadge);
        // Single caption line under the hero amount. Partner-aware framing wins: in family
        // mode the spend total above is the combined family total, so the caption calls that
        // out and shows who logged the most recent expense. Otherwise it carries the trend.
        String caption = insight.subtitle != null
            ? insight.subtitle
            : insight.trendText.toUpperCase(Locale.US);
        views.setTextViewText(R.id.expense_widget_subtitle, caption);
    }

    private static final class DailyInsight {
        final String spentText;
        final String budgetText;
        final int progressPercent;
        final String trendBadge;
        final String trendText;
        /** Header subtitle; null keeps the layout default ("DAILY INSIGHT"). */
        final String subtitle;

        private DailyInsight(String spentText, String budgetText, int progressPercent, String trendBadge, String trendText, String subtitle) {
            this.spentText = spentText;
            this.budgetText = budgetText;
            this.progressPercent = progressPercent;
            this.trendBadge = trendBadge;
            this.trendText = trendText;
            this.subtitle = subtitle;
        }

        static DailyInsight from(Context context) {
            SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
            JSONObject doc = localBackupDocument(prefs);
            if (doc == null) {
                return new DailyInsight("₹0", "₹0", 0, "0%", "Open Spenza once to load insight", null);
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
            String subtitle = familySubtitle(prefs, expenses, queued, today, activeEmail);
            return new DailyInsight(
                formatMoney(currency, todaySpent),
                formatMoney(currency, dailyBudget),
                progress,
                trendBadge(todaySpent, yesterdaySpent),
                trendText(todaySpent, yesterdaySpent),
                subtitle
            );
        }

        /**
         * Family-mode header subtitle. Returns null in single mode so the layout keeps its
         * default "DAILY INSIGHT". In family mode the budget figures already aggregate both
         * members (partner expenses are merged into the local backup), so the subtitle frames
         * the total as the family's and names who logged the most recent expense today.
         */
        private static String familySubtitle(
            SharedPreferences prefs,
            JSONArray expenses,
            JSONArray queue,
            String today,
            String activeEmail
        ) {
            if (!"family".equals(prefs.getString(WidgetExpenseConstants.BACKUP_MODE_KEY, null))) {
                return null;
            }

            JSONObject latest = null;
            String latestTs = "";
            if (expenses != null) {
                for (int i = 0; i < expenses.length(); i++) {
                    JSONObject entry = expenses.optJSONObject(i);
                    if (entry == null || !today.equals(entry.optString("date"))) continue;
                    String ts = entry.optString("timestamp", "");
                    if (latest == null || ts.compareTo(latestTs) > 0) {
                        latest = entry;
                        latestTs = ts;
                    }
                }
            }
            if (queue != null && activeEmail != null) {
                for (int i = 0; i < queue.length(); i++) {
                    JSONObject queuedItem = queue.optJSONObject(i);
                    if (queuedItem == null || !activeEmail.equals(queuedItem.optString("userEmail", null))) continue;
                    JSONObject entry = queuedItem.optJSONObject("entry");
                    if (entry == null || !today.equals(entry.optString("date"))) continue;
                    String ts = entry.optString("timestamp", "");
                    if (latest == null || ts.compareTo(latestTs) > 0) {
                        latest = entry;
                        latestTs = ts;
                    }
                }
            }

            if (latest == null) {
                return "FAMILY · SHARED TODAY";
            }
            String author = latest.optString("createdByEmail", null);
            boolean isSelf = author == null
                ? "owner".equalsIgnoreCase(prefs.getString(WidgetExpenseConstants.OWNER_ROLE_KEY, null))
                : (activeEmail != null && activeEmail.equalsIgnoreCase(author));
            String who = isSelf ? "YOU" : authorLabel(author);
            return "FAMILY · " + who + " LOGGED LAST";
        }

        /** Short display name for the partner — email prefix when available, else a generic label. */
        private static String authorLabel(String email) {
            if (email != null && email.contains("@")) {
                String prefix = email.substring(0, email.indexOf('@')).trim();
                if (!prefix.isEmpty()) {
                    if (prefix.length() > 12) prefix = prefix.substring(0, 12);
                    return prefix.toUpperCase(Locale.US);
                }
            }
            return "PARTNER";
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
