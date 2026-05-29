package com.spenza.app;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SpendNotificationClassifier {
    enum Type {
        EXPENSE_TRANSACTION,
        INCOME_OR_REFUND,
        BALANCE_OR_STATEMENT,
        PAYMENT_REQUEST,
        FAILED_OR_PENDING,
        SECURITY_OR_OTP,
        APP_UPDATE_OR_SYSTEM,
        UNKNOWN
    }

    static final class Classification {
        final Type type;
        final double confidence;
        final double amount;
        final String normalizedText;

        private Classification(Type type, double confidence, double amount, String normalizedText) {
            this.type = type;
            this.confidence = confidence;
            this.amount = amount;
            this.normalizedText = normalizedText;
        }

        boolean shouldPrompt() {
            return (type == Type.EXPENSE_TRANSACTION || type == Type.INCOME_OR_REFUND) && confidence >= 0.68 && amount > 0;
        }
    }

    private static final String[] IGNORED_SOURCE_PACKAGES = {
        "com.android.vending",
        "com.sec.android.app.samsungapps",
        "com.amazon.venezia"
    };

    private static final String[] SMS_SOURCE_PACKAGES = {
        "com.google.android.apps.messaging",
        "com.android.mms",
        "com.android.messaging",
        "com.samsung.android.messaging",
        "com.miui.mms",
        "com.coloros.mms",
        "com.oneplus.mms",
        "com.vivo.messaging",
        "com.htc.sense.mms",
        "com.sonyericsson.conversations"
    };

    private static final String[] SMS_SOURCE_HINTS = {
        "sms",
        "mms",
        "messaging",
        "messages"
    };

    private static final String[] EXPENSE_ACTION_TERMS = {
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
        "card transaction",
        "transaction of",
        "pos",
        "atm",
        "ecom",
        "e-commerce",
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

    private static final String[] PAYMENT_RAIL_TERMS = {
        "upi",
        "card",
        "a/c",
        "account",
        "acct",
        "bank",
        "wallet",
        "txn",
        "transaction",
        "ref no",
        "utr"
    };

    private static final String[] INCOME_TERMS = {
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

    private static final String[] PAYMENT_REQUEST_TERMS = {
        "request received",
        "payment request",
        "collect request",
        "requested money",
        "requesting money",
        "approve payment",
        "mandate created",
        "mandate setup"
    };

    private static final String[] FAILED_OR_PENDING_TERMS = {
        "failed",
        "declined",
        "unsuccessful",
        "pending",
        "processing",
        "timed out",
        "timeout",
        "cancelled",
        "canceled",
        "rejected"
    };

    private static final String[] SECURITY_TERMS = {
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

    private static final String[] APP_UPDATE_OR_SYSTEM_TERMS = {
        "update available",
        "updates available",
        "app update",
        "app updates",
        "apps updated",
        "updated successfully",
        "download pending",
        "downloading",
        "downloaded",
        "installing",
        "installed",
        "play protect",
        "security scan",
        "secure your",
        "storage",
        "backup complete",
        "sync complete"
    };

    private static final String[] BALANCE_TERMS = {
        "balance",
        "bal",
        "avl",
        "available",
        "limit",
        "statement",
        "mini statement",
        "due amount",
        "outstanding"
    };

    private static final Pattern AMOUNT_CANDIDATE = Pattern.compile(
        "(?:(rs\\.?|inr|₹|rupees?|usd|us\\$|\\$|dollars?|aed|د\\.إ|dh|dhs|dirhams?)\\s*)?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?:\\s*(rs\\.?|inr|₹|rupees?|usd|us\\$|\\$|dollars?|aed|د\\.إ|dh|dhs|dirhams?))?",
        Pattern.CASE_INSENSITIVE
    );

    private SpendNotificationClassifier() {}

    static Classification classify(String rawText, String sourcePackage) {
        return classify(rawText, sourcePackage, "INR");
    }

    static Classification classify(String rawText, String sourcePackage, String appCurrency) {
        if (rawText == null || rawText.trim().isEmpty()) {
            return new Classification(Type.UNKNOWN, 0, 0, "");
        }

        String normalized = rawText.replace('\n', ' ').replaceAll("\\s+", " ").trim();
        String lower = normalized.toLowerCase(Locale.US);
        String packageName = sourcePackage == null ? "" : sourcePackage.toLowerCase(Locale.US);
        String currency = normalizeCurrency(appCurrency);

        if (containsExactPackage(packageName, IGNORED_SOURCE_PACKAGES) || looksLikeAppUpdateOrSystem(lower)) {
            return new Classification(Type.APP_UPDATE_OR_SYSTEM, 0.98, 0, normalized);
        }
        if (!isSmsSource(packageName)) {
            return new Classification(Type.UNKNOWN, 0, 0, normalized);
        }
        if (containsAny(lower, SECURITY_TERMS)) {
            return new Classification(Type.SECURITY_OR_OTP, 0.98, 0, normalized);
        }
        if (containsAny(lower, PAYMENT_REQUEST_TERMS)) {
            return new Classification(Type.PAYMENT_REQUEST, 0.92, 0, normalized);
        }
        if (containsAny(lower, FAILED_OR_PENDING_TERMS)) {
            return new Classification(Type.FAILED_OR_PENDING, 0.9, 0, normalized);
        }
        AmountResult amount = parseBestAmount(normalized, lower, currency);
        if (containsAny(lower, INCOME_TERMS)) {
            double confidence = amount.amount > 0 ? Math.min(0.98, amount.score + 0.5) : 0.9;
            return new Classification(Type.INCOME_OR_REFUND, confidence, amount.amount, normalized);
        }

        boolean hasExpenseAction = containsAny(lower, EXPENSE_ACTION_TERMS);
        boolean hasPaymentRail = containsAny(lower, PAYMENT_RAIL_TERMS);
        boolean balanceOnly = containsAny(lower, BALANCE_TERMS) && !hasExpenseAction;

        if (balanceOnly) {
            return new Classification(Type.BALANCE_OR_STATEMENT, 0.82, 0, normalized);
        }

        double score = 0;
        if (amount.amount > 0) score += amount.score;
        if (hasExpenseAction) score += 0.38;
        if (hasPaymentRail) score += 0.16;
        if (containsAny(lower, BALANCE_TERMS)) score -= 0.16;

        if (amount.amount > 0 && score >= 0.68) {
            return new Classification(Type.EXPENSE_TRANSACTION, Math.min(0.98, score), amount.amount, normalized);
        }

        return new Classification(Type.UNKNOWN, Math.max(0, Math.min(0.5, score)), 0, normalized);
    }

    private static boolean looksLikeAppUpdateOrSystem(String lower) {
        return containsAny(lower, APP_UPDATE_OR_SYSTEM_TERMS)
            || (containsAny(lower, new String[] { "available", "update", "updates", "install", "installed", "secure" })
                && containsAny(lower, new String[] { "play store", "google play", "samsung store", "galaxy store", "app", "apps" }));
    }

    private static boolean isSmsSource(String packageName) {
        return containsExactPackage(packageName, SMS_SOURCE_PACKAGES) || containsAny(packageName, SMS_SOURCE_HINTS);
    }

    private static String normalizeCurrency(String appCurrency) {
        if ("USD".equalsIgnoreCase(appCurrency)) return "USD";
        if ("AED".equalsIgnoreCase(appCurrency)) return "AED";
        return "INR";
    }

    private static AmountResult parseBestAmount(String text, String lower, String appCurrency) {
        Matcher matcher = AMOUNT_CANDIDATE.matcher(text);
        double bestAmount = 0;
        double bestScore = 0;

        while (matcher.find()) {
            double amount = parseMoney(matcher.group(2));
            if (amount <= 0) continue;

            int start = matcher.start();
            int end = matcher.end();
            String window = lower.substring(Math.max(0, start - 48), Math.min(lower.length(), end + 48));
            String currencyMarker = !isBlank(matcher.group(1)) ? matcher.group(1) : matcher.group(3);
            boolean hasCurrency = isCurrencyMarkerForApp(currencyMarker, appCurrency);
            if (!hasCurrency) continue;
            boolean hasExpenseContext = containsAny(window, EXPENSE_ACTION_TERMS);
            boolean hasPaymentContext = containsAny(window, PAYMENT_RAIL_TERMS);
            boolean hasBalanceContext = containsAny(window, BALANCE_TERMS);

            double score = 0.34;
            if (hasExpenseContext) score += 0.34;
            if (hasPaymentContext) score += 0.12;
            if (hasBalanceContext && !hasExpenseContext) score -= 0.35;

            if (score > bestScore) {
                bestScore = score;
                bestAmount = amount;
            }
        }

        return new AmountResult(bestAmount, bestScore);
    }

    private static boolean isCurrencyMarkerForApp(String marker, String appCurrency) {
        if (isBlank(marker)) return false;
        String value = marker.trim().toLowerCase(Locale.US).replace(".", "");
        switch (appCurrency) {
            case "USD":
                return value.equals("usd") || value.equals("$") || value.equals("us$") || value.equals("dollar") || value.equals("dollars");
            case "AED":
                return value.equals("aed") || value.equals("دإ") || value.equals("dh") || value.equals("dhs")
                    || value.equals("dirham") || value.equals("dirhams");
            case "INR":
            default:
                return value.equals("inr") || value.equals("rs") || value.equals("₹") || value.equals("rupee") || value.equals("rupees");
        }
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

    private static boolean containsExactPackage(String packageName, String[] packages) {
        for (String ignoredPackage : packages) {
            if (ignoredPackage.equals(packageName)) return true;
        }
        return false;
    }

    private static boolean containsTerm(String text, String needle) {
        if (isBlank(text) || isBlank(needle)) return false;
        if (needle.indexOf(' ') >= 0 || needle.indexOf('-') >= 0 || needle.indexOf('/') >= 0) {
            return text.contains(needle);
        }
        return Pattern.compile("(^|[^a-z0-9])" + Pattern.quote(needle) + "([^a-z0-9]|$)")
            .matcher(text)
            .find();
    }

    private static boolean isBlank(String text) {
        return text == null || text.trim().isEmpty();
    }

    private static final class AmountResult {
        final double amount;
        final double score;

        private AmountResult(double amount, double score) {
            this.amount = amount;
            this.score = score;
        }
    }
}
