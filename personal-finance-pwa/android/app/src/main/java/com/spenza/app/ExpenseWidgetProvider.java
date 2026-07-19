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
    // Layout tiers, chosen from the launcher-reported height of the CURRENT
    // orientation (portrait uses OPTION_APPWIDGET_MAX_HEIGHT, landscape uses
    // OPTION_APPWIDGET_MIN_HEIGHT — a landscape/portrait RemoteViews pair lets the
    // system pick). Launcher cell heights vary wildly (a "row" is ~40dp on dense
    // grids, ~100dp on tall ones), so tiers key off dp the content needs, not rows:
    //   < 115dp  -> quick layout: category buttons ONLY (budget line hidden)
    //   115-149  -> standard 2-row layout
    //   >= 150dp -> roomy 2-row layout with scaled-up chips and type
    private static final int QUICK_MAX_HEIGHT_DP = 115;
    private static final int ROOMY_MIN_HEIGHT_DP = 150;
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
        int maxWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minWidth);
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        int maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeight);

        // On phones: portrait shows minWidth x maxHeight, landscape maxWidth x minHeight.
        RemoteViews portrait = buildViews(context, minWidth, maxHeight);
        RemoteViews views = (minHeight == maxHeight && minWidth == maxWidth)
            ? portrait
            : new RemoteViews(buildViews(context, maxWidth, minHeight), portrait);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static RemoteViews buildViews(Context context, int widthDp, int heightDp) {
        boolean quickOnly = heightDp > 0 && heightDp < QUICK_MAX_HEIGHT_DP;
        boolean roomy = !quickOnly && heightDp >= ROOMY_MIN_HEIGHT_DP;
        boolean showShopping = widthDp >= FIVE_COLUMN_MIN_WIDTH_DP;
        int layoutId = quickOnly
            ? R.layout.expense_widget_quick
            : (roomy ? R.layout.expense_widget_tall : R.layout.expense_widget);
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        WidgetTheme theme = WidgetTheme.from(context);
        theme.applySurface(context, views, R.id.widget_surface, widthDp, heightDp);
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
        if (!quickOnly) {
            // Circle Splits row exists only in the 2-row layouts.
            bindCircleRow(context, views);
        }
        applyPredictedHighlight(context, views, showShopping);
        return views;
    }

    /**
     * Circle Splits quick-log row: visible only while at least one circle is
     * active (cache written by the app), labelled with the trip name so the
     * user always knows this button logs a GROUP expense, not a personal one.
     */
    private static void bindCircleRow(Context context, RemoteViews views) {
        android.content.SharedPreferences prefs =
            context.getSharedPreferences(WidgetExpenseConstants.PREFS_NAME, Context.MODE_PRIVATE);
        org.json.JSONArray circles = WidgetExpenseUtils.activeCircles(prefs);
        if (circles.length() == 0) {
            views.setViewVisibility(R.id.widget_circle_row, View.GONE);
            return;
        }
        org.json.JSONObject first = circles.optJSONObject(0);
        String firstName = first == null ? "Circle" : first.optString("name", "Circle");
        String label = circles.length() == 1
            ? "◎ " + firstName + " · Circle expense"
            : "◎ Circle expense · " + circles.length() + " trips";
        views.setTextViewText(R.id.widget_circle_row, label);
        views.setViewVisibility(R.id.widget_circle_row, View.VISIBLE);

        Intent intent = new Intent(context, ExpenseWidgetActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(
            WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXTRA,
            WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CIRCLE
        );
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            107,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_circle_row, pendingIntent);
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
            JSONArray expenses = doc.optJSONArray("expenses");
            String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
            // Widget two-way sync: merge partner records delivered by FCM while
            // the app was closed (display-only overlay; supersede rule keyed on
            // the snapshot's savedAt — once the app rewrites the snapshot, the
            // overlay copies are redundant and pruned).
            expenses = PartnerPendingStore.overlayExpenses(
                context, expenses, activeEmail, snapshotSavedAtMillis(prefs));
            String today = WidgetExpenseUtils.localDateToday();
            String yesterday = yesterday();
            double todaySpent = totalForDate(expenses, today);
            double yesterdaySpent = totalForDate(expenses, yesterday);
            JSONArray queued = WidgetExpenseQueue.readQueue(context);
            todaySpent += queuedTotalForDate(queued, today, activeEmail);
            yesterdaySpent += queuedTotalForDate(queued, yesterday, activeEmail);
            double dailyBudget = dailyBudget(monthlyIncome);
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

        /**
         * When the app last rewrote the local snapshot (epoch millis, 0 when
         * unknown). Overlay records received before this instant were already
         * applied into the snapshot by the app's ledger listener.
         */
        private static long snapshotSavedAtMillis(SharedPreferences prefs) {
            String raw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
            if (raw == null) return 0;
            try {
                String savedAt = new JSONObject(raw).optString("savedAt", "");
                if (savedAt.isEmpty()) return 0;
                java.text.SimpleDateFormat format =
                    new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                java.util.Date parsed = format.parse(savedAt);
                return parsed == null ? 0 : parsed.getTime();
            } catch (JSONException | java.text.ParseException ignored) {
                return 0; // fail open: id-dedup in overlayExpenses still prevents double counts
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

        /**
         * MUST match the app's Daily Expense hero exactly
         * (daily-expense.component.ts `dailyBudget`): Math.round(monthlyIncome / 30).
         * The widget previously derived a limit-percentage/days-in-month figure,
         * which drifted from the number shown in the app.
         */
        private static double dailyBudget(double monthlyIncome) {
            return monthlyIncome > 0 ? Math.round(monthlyIncome / 30.0) : 0;
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
