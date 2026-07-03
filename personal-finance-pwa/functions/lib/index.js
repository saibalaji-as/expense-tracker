"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleAccessToken = exports.exchangeGoogleAuthCode = exports.syncWidgetExpenseToFamily = exports.leaveFamily = exports.dissolveFamily = exports.redeemFamilyInvite = exports.createFamilyInvite = exports.createFamily = exports.parseVoiceReminder = exports.parseVoiceExpense = exports.generateInsights = exports.extractReceipt = exports.unregisterToken = exports.registerToken = exports.sendDueReminders = exports.sendReminders = exports.redeemSubscriptionHandoff = exports.createSubscriptionHandoff = exports.webhookHealthCheck = exports.razorpayWebhook = exports.cancelRazorpaySubscription = exports.restoreRazorpaySubscription = exports.verifyRazorpayPayment = exports.createRazorpaySubscription = void 0;
const admin = __importStar(require("firebase-admin"));
const razorpay_1 = require("./razorpay");
Object.defineProperty(exports, "createRazorpaySubscription", { enumerable: true, get: function () { return razorpay_1.createRazorpaySubscription; } });
Object.defineProperty(exports, "verifyRazorpayPayment", { enumerable: true, get: function () { return razorpay_1.verifyRazorpayPayment; } });
Object.defineProperty(exports, "restoreRazorpaySubscription", { enumerable: true, get: function () { return razorpay_1.restoreRazorpaySubscription; } });
Object.defineProperty(exports, "cancelRazorpaySubscription", { enumerable: true, get: function () { return razorpay_1.cancelRazorpaySubscription; } });
const razorpay_webhook_1 = require("./razorpay-webhook");
Object.defineProperty(exports, "razorpayWebhook", { enumerable: true, get: function () { return razorpay_webhook_1.razorpayWebhook; } });
Object.defineProperty(exports, "webhookHealthCheck", { enumerable: true, get: function () { return razorpay_webhook_1.webhookHealthCheck; } });
const subscription_handoff_1 = require("./subscription-handoff");
Object.defineProperty(exports, "createSubscriptionHandoff", { enumerable: true, get: function () { return subscription_handoff_1.createSubscriptionHandoff; } });
Object.defineProperty(exports, "redeemSubscriptionHandoff", { enumerable: true, get: function () { return subscription_handoff_1.redeemSubscriptionHandoff; } });
const send_reminders_1 = require("./send-reminders");
Object.defineProperty(exports, "sendReminders", { enumerable: true, get: function () { return send_reminders_1.sendReminders; } });
const send_due_reminders_1 = require("./send-due-reminders");
Object.defineProperty(exports, "sendDueReminders", { enumerable: true, get: function () { return send_due_reminders_1.sendDueReminders; } });
const fcm_1 = require("./fcm");
Object.defineProperty(exports, "registerToken", { enumerable: true, get: function () { return fcm_1.registerToken; } });
Object.defineProperty(exports, "unregisterToken", { enumerable: true, get: function () { return fcm_1.unregisterToken; } });
const ai_receipt_1 = require("./ai-receipt");
Object.defineProperty(exports, "extractReceipt", { enumerable: true, get: function () { return ai_receipt_1.extractReceipt; } });
const ai_insights_1 = require("./ai-insights");
Object.defineProperty(exports, "generateInsights", { enumerable: true, get: function () { return ai_insights_1.generateInsights; } });
const ai_voice_1 = require("./ai-voice");
Object.defineProperty(exports, "parseVoiceExpense", { enumerable: true, get: function () { return ai_voice_1.parseVoiceExpense; } });
const ai_reminder_1 = require("./ai-reminder");
Object.defineProperty(exports, "parseVoiceReminder", { enumerable: true, get: function () { return ai_reminder_1.parseVoiceReminder; } });
// SECURITY: testNotification is intentionally NOT deployed to production.
// It allowed unauthenticated callers to push notifications to every user.
// Re-import locally only when testing with the Firebase emulator.
const family_1 = require("./family");
Object.defineProperty(exports, "createFamily", { enumerable: true, get: function () { return family_1.createFamily; } });
Object.defineProperty(exports, "createFamilyInvite", { enumerable: true, get: function () { return family_1.createFamilyInvite; } });
Object.defineProperty(exports, "redeemFamilyInvite", { enumerable: true, get: function () { return family_1.redeemFamilyInvite; } });
Object.defineProperty(exports, "dissolveFamily", { enumerable: true, get: function () { return family_1.dissolveFamily; } });
Object.defineProperty(exports, "leaveFamily", { enumerable: true, get: function () { return family_1.leaveFamily; } });
const widget_sync_1 = require("./widget-sync");
Object.defineProperty(exports, "syncWidgetExpenseToFamily", { enumerable: true, get: function () { return widget_sync_1.syncWidgetExpenseToFamily; } });
const google_tokens_1 = require("./google-tokens");
Object.defineProperty(exports, "exchangeGoogleAuthCode", { enumerable: true, get: function () { return google_tokens_1.exchangeGoogleAuthCode; } });
Object.defineProperty(exports, "getGoogleAccessToken", { enumerable: true, get: function () { return google_tokens_1.getGoogleAccessToken; } });
admin.initializeApp();
//# sourceMappingURL=index.js.map