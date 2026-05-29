package com.spenza.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SpendNotificationClassifierTest {
    @Test
    public void classifiesDebitAsExpense() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs. 250.00 debited from HDFC Bank A/c XX1234 at Swiggy via UPI. Avl bal Rs. 1200.",
            "com.google.android.apps.messaging"
        );

        assertEquals(SpendNotificationClassifier.Type.EXPENSE_TRANSACTION, result.type);
        assertTrue(result.shouldPrompt());
        assertEquals(250.0, result.amount, 0.001);
    }

    @Test
    public void ignoresPlayStoreUpdateSummary() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "57 updates available Instagram, Samsung Browser, WhatsApp Messenger, Google Pay: Secure your apps",
            "com.android.vending"
        );

        assertEquals(SpendNotificationClassifier.Type.APP_UPDATE_OR_SYSTEM, result.type);
        assertFalse(result.shouldPrompt());
    }

    @Test
    public void ignoresOtpSecurityMessage() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "OTP 532104 is your verification code for UPI login. Do not share it.",
            "com.google.android.apps.messaging"
        );

        assertEquals(SpendNotificationClassifier.Type.SECURITY_OR_OTP, result.type);
        assertFalse(result.shouldPrompt());
    }

    @Test
    public void classifiesCreditAsPromptableIncome() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "INR 499 credited to your bank account ending 1234.",
            "com.google.android.apps.messaging"
        );

        assertEquals(SpendNotificationClassifier.Type.INCOME_OR_REFUND, result.type);
        assertTrue(result.shouldPrompt());
        assertEquals(499.0, result.amount, 0.001);
    }

    @Test
    public void ignoresFailedTransaction() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Payment of Rs 1200 failed due to insufficient balance.",
            "com.google.android.apps.messaging"
        );

        assertEquals(SpendNotificationClassifier.Type.FAILED_OR_PENDING, result.type);
        assertFalse(result.shouldPrompt());
    }

    @Test
    public void ignoresBalanceOnlyMessage() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Available balance in A/c XX1234 is Rs. 5300. Statement generated successfully.",
            "com.google.android.apps.messaging"
        );

        assertEquals(SpendNotificationClassifier.Type.BALANCE_OR_STATEMENT, result.type);
        assertFalse(result.shouldPrompt());
    }

    @Test
    public void ignoresPaymentAppNotificationsEvenWithCurrency() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs. 250 debited from wallet for order payment.",
            "com.phonepe.app"
        );

        assertEquals(SpendNotificationClassifier.Type.UNKNOWN, result.type);
        assertFalse(result.shouldPrompt());
    }

    @Test
    public void requiresSelectedCurrencyMarker() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs. 250 debited from HDFC Bank A/c XX1234 via UPI.",
            "com.google.android.apps.messaging",
            "USD"
        );

        assertEquals(SpendNotificationClassifier.Type.UNKNOWN, result.type);
        assertFalse(result.shouldPrompt());
    }

    @Test
    public void classifiesUsdSmsWhenUsdIsSelected() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "USD 12.50 charged to card ending 1234 at Cafe.",
            "com.google.android.apps.messaging",
            "USD"
        );

        assertEquals(SpendNotificationClassifier.Type.EXPENSE_TRANSACTION, result.type);
        assertTrue(result.shouldPrompt());
        assertEquals(12.50, result.amount, 0.001);
    }

    @Test
    public void ignoresBareAmountWithoutCurrencyMarker() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "250 debited from HDFC Bank A/c XX1234 via UPI.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.UNKNOWN, result.type);
        assertFalse(result.shouldPrompt());
    }
}
