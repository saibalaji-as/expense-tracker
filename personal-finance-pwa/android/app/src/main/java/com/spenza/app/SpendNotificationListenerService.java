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

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SpendNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "SpendNotification";
    private static final long DEDUPE_WINDOW_MS = 10 * 60 * 1000L;

    private static final String[] SPEND_KEYWORDS = {
        "debited",
        "debit",
        "dr",
        "spent",
        "used",
        "paid",
        "payment",
        "purchase",
        "purchased",
        "withdrawn",
        "withdrawal",
        "charged",
        "deducted",
        "sent",
        "transferred",
        "upi",
        "card transaction",
        "transaction of",
        "txn",
        "pos",
        "atm",
        "ecom",
        "e-commerce",
        "billpay",
        "bill paid",
        "autopay",
        "auto pay",
        "nach",
        "ach debit",
        "mandate debit",
        "emi",
        "fee",
        "fees",
        "charges"
    };

    private static final String[] AMOUNT_CONTEXT_KEYWORDS = {
        "debited",
        "debit",
        "spent",
        "used",
        "paid",
        "payment",
        "purchase",
        "purchased",
        "withdrawn",
        "withdrawal",
        "charged",
        "deducted",
        "sent",
        "transferred",
        "pos",
        "atm",
        "bill paid",
        "autopay",
        "auto pay",
        "nach",
        "emi",
        "fee",
        "fees",
        "charges"
    };

    private static final String[] INCOME_KEYWORDS = {
        "credited",
        "received",
        "refund",
        "refunded",
        "cashback",
        "reversed",
        "reversal",
        "salary",
        "deposited",
        "deposit",
        "credited to",
        "credit received",
        "payment received",
        "money received"
    };

    private static final String[] NON_FINAL_TRANSACTION_KEYWORDS = {
        "failed",
        "declined",
        "unsuccessful",
        "pending",
        "processing",
        "timed out",
        "timeout",
        "cancelled",
        "canceled",
        "rejected",
        "request received",
        "payment request",
        "collect request",
        "mandate created",
        "mandate setup"
    };

    private static final String[] SENSITIVE_SECURITY_KEYWORDS = {
        "otp",
        "one time password",
        "pin",
        "cvv",
        "password",
        "verification code",
        "authorise",
        "authorize",
        "authentication"
    };

    private static final String[] BALANCE_CONTEXT_KEYWORDS = {
        "balance",
        "bal",
        "avl",
        "available",
        "limit",
        "ref",
        "reference",
        "otp"
    };

    private static final Pattern AMOUNT_CANDIDATE = Pattern.compile(
        "(?:(rs\\.?|inr|₹|usd|\\$|aed|د\\.إ)\\s*)?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?:\\s*(rs\\.?|inr|₹|usd|\\$|aed|د\\.إ))?",
        Pattern.CASE_INSENSITIVE
    );

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
        SpendCandidate candidate = SpendCandidate.from(text, sbn.getPackageName());
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
            .setContentTitle("Log this expense?")
            .setContentText("Detected " + candidate.displayAmount() + " spent. Tap to review and save.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(
                "Detected " + candidate.displayAmount() + " spent. Tap to review and save."
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

    private static final class SpendCandidate {
        final double amount;
        final String comment;
        final String sourcePackage;

        private SpendCandidate(double amount, String comment, String sourcePackage) {
            this.amount = amount;
            this.comment = comment;
            this.sourcePackage = sourcePackage == null ? "" : sourcePackage;
        }

        static SpendCandidate from(String rawText, String sourcePackage) {
            if (TextUtils.isEmpty(rawText)) return null;
            String normalized = rawText.replace('\n', ' ').replaceAll("\\s+", " ").trim();
            String lower = normalized.toLowerCase(Locale.US);
            if (!looksLikeSpend(lower) || looksLikeCreditOrNonSpend(lower)) return null;

            double amount = parseAmount(normalized);
            if (amount <= 0) return null;
            String comment = normalized.length() > 90 ? normalized.substring(0, 87).trim() + "..." : normalized;
            return new SpendCandidate(amount, comment, sourcePackage);
        }

        private static boolean looksLikeSpend(String lower) {
            return containsAny(lower, SPEND_KEYWORDS);
        }

        private static boolean looksLikeCreditOrNonSpend(String lower) {
            return containsAny(lower, INCOME_KEYWORDS)
                || containsAny(lower, NON_FINAL_TRANSACTION_KEYWORDS)
                || containsAny(lower, SENSITIVE_SECURITY_KEYWORDS);
        }

        private static double parseAmount(String text) {
            Matcher matcher = AMOUNT_CANDIDATE.matcher(text);
            double bestAmount = 0;
            int bestScore = 0;
            String lower = text.toLowerCase(Locale.US);

            while (matcher.find()) {
                double amount = parseMoney(matcher.group(2));
                if (amount <= 0) continue;
                int start = matcher.start();
                int end = matcher.end();
                String window = lower.substring(Math.max(0, start - 42), Math.min(lower.length(), end + 42));
                if (containsAny(window, BALANCE_CONTEXT_KEYWORDS) && !containsAny(window, AMOUNT_CONTEXT_KEYWORDS)) {
                    continue;
                }

                boolean hasCurrency = !isBlank(matcher.group(1)) || !isBlank(matcher.group(3));
                int score = 0;
                if (hasCurrency) score += 4;
                if (containsAny(window, AMOUNT_CONTEXT_KEYWORDS)) score += 6;
                if (containsAny(window, new String[] { "balance", "bal", "avl", "available" })) score -= 3;
                if (score > bestScore) {
                    bestScore = score;
                    bestAmount = amount;
                }
            }
            return bestScore >= 4 ? bestAmount : 0;
        }

        private static double parseMoney(String raw) {
            if (raw == null) return 0;
            try {
                return Double.parseDouble(raw.replace(",", ""));
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }

        private static boolean containsAny(String text, String[] needles) {
            for (String needle : needles) {
                if (containsTerm(text, needle)) return true;
            }
            return false;
        }

        private static boolean containsTerm(String text, String needle) {
            if (isBlank(text) || isBlank(needle)) return false;
            if (needle.indexOf(' ') >= 0 || needle.indexOf('-') >= 0) {
                return text.contains(needle);
            }
            return Pattern.compile("(^|[^a-z0-9])" + Pattern.quote(needle) + "([^a-z0-9]|$)")
                .matcher(text)
                .find();
        }

        private static boolean isBlank(String text) {
            return text == null || text.trim().isEmpty();
        }

        String displayAmount() {
            return "₹" + String.format(Locale.US, "%.0f", Math.max(0, amount));
        }

        String dedupeKey() {
            return sourcePackage + ":" + WidgetExpenseUtils.roundMoney(amount) + ":" + comment.hashCode();
        }
    }
}
