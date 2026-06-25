package com.spenza.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Locale;

public class SpendNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "SpendNotification";
    private static final long DEDUPE_WINDOW_MS = 10 * 60 * 1000L;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "Notification listener connected");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.d(TAG, "Notification listener disconnected");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new ComponentName(this, SpendNotificationListenerService.class));
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        if (getPackageName().equals(sbn.getPackageName())) return;
        if (!isPromptEnabled()) return;

        Notification notification = sbn.getNotification();
        if ((notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

        String text = collectText(notification);
        SpendCandidate candidate = SpendCandidate.from(text, sbn.getPackageName(), currentCurrency());
        if (candidate == null || isDuplicate(candidate)) return;
        showPrompt(candidate);
    }

    private boolean isPromptEnabled() {
        return WidgetExpenseQueue.prefs(this)
            .getBoolean(WidgetExpenseConstants.SPEND_NOTIFICATION_PROMPTS_ENABLED_KEY, false);
    }

    private String collectText(Notification notification) {
        StringBuilder builder = new StringBuilder();
        addText(builder, notification.extras.getCharSequence(Notification.EXTRA_TITLE));
        addText(builder, notification.extras.getCharSequence(Notification.EXTRA_TEXT));
        addText(builder, notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        addText(builder, notification.extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        CharSequence[] lines = notification.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) addText(builder, line);
        }
        Parcelable[] messages = notification.extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (messages != null) {
            for (Parcelable parcelable : messages) {
                if (parcelable instanceof Bundle) {
                    addText(builder, ((Bundle) parcelable).getCharSequence("text"));
                }
            }
        }
        return builder.toString().trim();
    }

    private void addText(StringBuilder builder, CharSequence text) {
        if (text == null) return;
        String value = text.toString().trim();
        if (value.isEmpty()) return;
        if (builder.length() > 0) builder.append(' ');
        builder.append(value);
    }

    private boolean isDuplicate(SpendCandidate candidate) {
        SharedPreferences prefs = WidgetExpenseQueue.prefs(this);
        long now = System.currentTimeMillis();
        String dedupe = candidate.dedupeKey();
        String last = prefs.getString(WidgetExpenseConstants.SPEND_NOTIFICATION_DEDUPE_KEY, "");
        long lastAt = prefs.getLong(WidgetExpenseConstants.SPEND_NOTIFICATION_DEDUPE_KEY + "_at", 0);
        if (dedupe.equals(last) && now - lastAt < DEDUPE_WINDOW_MS) return true;
        prefs.edit()
            .putString(WidgetExpenseConstants.SPEND_NOTIFICATION_DEDUPE_KEY, dedupe)
            .putLong(WidgetExpenseConstants.SPEND_NOTIFICATION_DEDUPE_KEY + "_at", now)
            .apply();
        return false;
    }

    private void showPrompt(SpendCandidate candidate) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "Cannot show spend prompt without POST_NOTIFICATIONS permission");
            return;
        }

        NotificationChannelManager.createNotificationChannels(this);
        Intent intent = new Intent(this, ExpenseWidgetActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(WidgetExpenseConstants.WIDGET_CATEGORY_EXTRA, WidgetExpenseConstants.TYPE_MISC);
        intent.putExtra(WidgetExpenseConstants.WIDGET_AMOUNT_EXTRA, candidate.amount);
        intent.putExtra(WidgetExpenseConstants.WIDGET_COMMENT_EXTRA, candidate.comment);
        intent.putExtra(WidgetExpenseConstants.WIDGET_SOURCE_EXTRA, WidgetExpenseConstants.WIDGET_SOURCE_NOTIFICATION_PROMPT);
        intent.putExtra(WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXTRA, candidate.amountKind);
        intent.putExtra(WidgetExpenseConstants.WIDGET_IS_CREDIT_CARD_EXTRA, candidate.isCreditCard);

        int requestCode = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            this,
            NotificationChannelManager.CHANNEL_ID_SPEND_PROMPTS
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(candidate.isCredit() ? "Record received money?" : "Log this expense?")
            .setContentText("Detected " + candidate.displayAmount() + (candidate.isCredit() ? " received." : " spent.") + " Tap to review and save.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(
                "Detected " + candidate.displayAmount() + (candidate.isCredit() ? " received." : " spent.") + " Tap to review and save."
            ))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(42_200 + Math.abs(candidate.dedupeKey().hashCode() % 500), builder.build());
        }
    }

    private String currentCurrency() {
        SharedPreferences prefs = WidgetExpenseQueue.prefs(this);
        String savedCurrency = prefs.getString(WidgetExpenseConstants.CURRENCY_KEY, null);
        if ("USD".equalsIgnoreCase(savedCurrency)) return "USD";
        if ("AED".equalsIgnoreCase(savedCurrency)) return "AED";
        if ("INR".equalsIgnoreCase(savedCurrency)) return "INR";

        String raw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
        if (raw != null) {
            try {
                JSONObject root = new JSONObject(raw);
                JSONObject doc = root.optJSONObject("doc");
                JSONObject metadata = doc == null ? null : doc.optJSONObject("metadata");
                String currency = metadata == null ? null : metadata.optString("currency", null);
                if ("USD".equalsIgnoreCase(currency)) return "USD";
                if ("AED".equalsIgnoreCase(currency)) return "AED";
                if ("INR".equalsIgnoreCase(currency)) return "INR";
            } catch (Exception ignored) {
                // Use app default.
            }
        }
        return "INR";
    }

    private static final class SpendCandidate {
        final double amount;
        final String comment;
        final String sourcePackage;
        final String currency;
        final String amountKind;
        final boolean isCreditCard;

        private SpendCandidate(double amount, String comment, String sourcePackage, String currency, String amountKind, boolean isCreditCard) {
            this.amount = amount;
            this.comment = comment;
            this.sourcePackage = sourcePackage == null ? "" : sourcePackage;
            this.currency = normalizeCurrency(currency);
            this.amountKind = WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT.equals(amountKind)
                ? WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT
                : WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXPENSE;
            this.isCreditCard = isCreditCard;
        }

        static SpendCandidate from(String rawText, String sourcePackage, String currency) {
            if (TextUtils.isEmpty(rawText)) return null;
            SpendNotificationClassifier.Classification classification =
                SpendNotificationClassifier.classify(rawText, sourcePackage, currency);
            if (!classification.shouldPrompt()) return null;

            String normalized = classification.normalizedText;
            String comment = normalized.length() > 90 ? normalized.substring(0, 87).trim() + "..." : normalized;
            String amountKind = classification.type == SpendNotificationClassifier.Type.INCOME_OR_REFUND
                ? WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT
                : WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXPENSE;
            return new SpendCandidate(classification.amount, comment, sourcePackage, currency, amountKind, classification.isCreditCard);
        }

        boolean isCredit() {
            return WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT.equals(amountKind);
        }

        String displayAmount() {
            return currencySymbol(currency) + String.format(Locale.US, "%.0f", Math.max(0, amount));
        }

        String dedupeKey() {
            return sourcePackage + ":" + amountKind + ":" + currency + ":" + WidgetExpenseUtils.roundMoney(amount) + ":" + comment.hashCode();
        }

        private static String normalizeCurrency(String currency) {
            if ("USD".equalsIgnoreCase(currency)) return "USD";
            if ("AED".equalsIgnoreCase(currency)) return "AED";
            return "INR";
        }

        private static String currencySymbol(String currency) {
            switch (currency) {
                case "USD":
                    return "$";
                case "AED":
                    return "AED ";
                case "INR":
                default:
                    return "₹";
            }
        }
    }
}
