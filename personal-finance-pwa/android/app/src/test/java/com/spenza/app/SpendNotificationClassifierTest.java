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
    public void classifiesSalaryCreditBeforeNearbyBalanceAsPromptableIncome() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Salary Credited!\n"
                + "INR 82,566.00 to HDFC Bank A/c XX5655\n"
                + "Bal: INR 1,90,254.52\n"
                + "Get statement and more on WhatsApp: https://1.hdfc.bank.in/HDFCBK/s/a/o7kMxp7q",
            "com.google.android.apps.messaging"
        );

        assertEquals(SpendNotificationClassifier.Type.INCOME_OR_REFUND, result.type);
        assertTrue(result.shouldPrompt());
        assertEquals(82566.0, result.amount, 0.001);
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

    @Test
    public void extractsCardLast4FromEndingPhrase() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs. 1,499 spent on HDFC Credit Card ending 4321 at Amazon.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.EXPENSE_TRANSACTION, result.type);
        assertTrue(result.isCreditCard);
        assertEquals("4321", result.cardLast4);
    }

    @Test
    public void extractsCardLast4FromMaskedNumber() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "INR 899 charged on ICICI credit card XX7788 at BigBasket.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.EXPENSE_TRANSACTION, result.type);
        assertTrue(result.isCreditCard);
        assertEquals("7788", result.cardLast4);
    }

    @Test
    public void classifiesBankSideCcBillPayment() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs 9,000 debited from HDFC Bank A/c XX1234 towards your HDFC Credit Card XX7788.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.CREDIT_CARD_PAYMENT, result.type);
        assertTrue(result.shouldPrompt());
        assertEquals(9000.0, result.amount, 0.001);
        // Must pick the CARD's digits (after the "credit card" mention), not the bank a/c.
        assertEquals("7788", result.cardLast4);
    }

    @Test
    public void classifiesCardSidePaymentReceivedAsCcPaymentNotIncome() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Payment of Rs 9,000 received on your ICICI Credit Card ending 7788. Available limit INR 45,000.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.CREDIT_CARD_PAYMENT, result.type);
        assertEquals("7788", result.cardLast4);
    }

    @Test
    public void creditCardPurchaseIsNotClassifiedAsBillPayment() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs. 1,499 spent on HDFC Credit Card ending 4321 at Amazon.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.EXPENSE_TRANSACTION, result.type);
    }

    @Test
    public void flagsSalaryCredit() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Salary of Rs 50,000 credited to HDFC Bank A/c XX1234 on 01-Jul-26.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.INCOME_OR_REFUND, result.type);
        assertTrue(result.isSalary);
    }

    @Test
    public void nonSalaryCreditIsNotFlaggedAsSalary() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs 500 cashback credited to your Paytm wallet.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.INCOME_OR_REFUND, result.type);
        assertFalse(result.isSalary);
    }

    @Test
    public void cardLast4IsNullForNonCreditCardSpends() {
        SpendNotificationClassifier.Classification result = SpendNotificationClassifier.classify(
            "Rs. 250 debited from HDFC Bank A/c XX1234 via UPI.",
            "com.google.android.apps.messaging",
            "INR"
        );

        assertEquals(SpendNotificationClassifier.Type.EXPENSE_TRANSACTION, result.type);
        assertFalse(result.isCreditCard);
        assertEquals(null, result.cardLast4);
    }
}
