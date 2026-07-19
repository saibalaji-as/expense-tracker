package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class WidgetExpenseQueue {
    private WidgetExpenseQueue() {}

    static synchronized void enqueue(Context context, JSONObject entry) throws JSONException {
        enqueueExpense(context, entry);
    }

    static synchronized void enqueueExpense(Context context, JSONObject entry) throws JSONException {
        SharedPreferences prefs = prefs(context);
        JSONArray queue = readQueue(context);
        JSONObject queued = new JSONObject();
        queued.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
        queued.put("kind", "expense");
        queued.put("entry", entry);
        queue.put(queued);
        prefs.edit().putString(WidgetExpenseConstants.QUEUE_KEY, queue.toString()).apply();
        WidgetExpenseSyncWorker.schedule(context);
        ExpenseWidgetPlugin.notifyExpenseQueued();
    }

    static synchronized void enqueueCcPayment(Context context, JSONObject payment) throws JSONException {
        SharedPreferences prefs = prefs(context);
        JSONArray queue = readQueue(context);
        JSONObject queued = new JSONObject();
        queued.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
        queued.put("kind", "cc-payment");
        queued.put("payment", payment);
        queue.put(queued);
        prefs.edit().putString(WidgetExpenseConstants.QUEUE_KEY, queue.toString()).apply();
        // No WorkManager schedule: debt payments mutate four linked pieces of
        // state and must go through ExpenseStore.recordDebtPayment in the app.
        ExpenseWidgetPlugin.notifyExpenseQueued();
    }

    static synchronized void enqueueCircleExpense(Context context, JSONObject circleExpense) throws JSONException {
        SharedPreferences prefs = prefs(context);
        JSONArray queue = readQueue(context);
        JSONObject queued = new JSONObject();
        queued.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
        queued.put("kind", "circle-expense");
        queued.put("circleExpense", circleExpense);
        queue.put(queued);
        prefs.edit().putString(WidgetExpenseConstants.QUEUE_KEY, queue.toString()).apply();
        // No WorkManager schedule: circle expenses live in Firestore, which only
        // the app (CircleSyncService) can reach — the worker deliberately skips them.
        ExpenseWidgetPlugin.notifyExpenseQueued();
    }

    static synchronized void enqueueAdjustment(Context context, JSONObject adjustment) throws JSONException {
        SharedPreferences prefs = prefs(context);
        JSONArray queue = readQueue(context);
        JSONObject queued = new JSONObject();
        queued.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
        queued.put("kind", "adjustment");
        queued.put("adjustment", adjustment);
        queue.put(queued);
        prefs.edit().putString(WidgetExpenseConstants.QUEUE_KEY, queue.toString()).apply();
        WidgetExpenseSyncWorker.schedule(context);
        ExpenseWidgetPlugin.notifyExpenseQueued();
    }

    static synchronized JSONArray readQueue(Context context) {
        String raw = prefs(context).getString(WidgetExpenseConstants.QUEUE_KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    static synchronized void replaceQueue(Context context, List<JSONObject> remaining) {
        JSONArray next = new JSONArray();
        for (JSONObject item : remaining) {
            next.put(item);
        }
        prefs(context).edit().putString(WidgetExpenseConstants.QUEUE_KEY, next.toString()).apply();
    }

    /**
     * Sync-tag write-back: re-reads the queue and sets `familySynced=true` on the
     * wrapper of every item whose payload id is in {@code ids}. Read-merge-write by id
     * (instead of replacing the worker's stale snapshot) so a widget save that raced
     * the sync worker's network round-trip is never clobbered.
     */
    static synchronized void markFamilySynced(Context context, java.util.Set<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        JSONArray queue = readQueue(context);
        boolean changed = false;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item == null) continue;
            String id = WidgetExpenseSyncWorker.queueItemId(item);
            if (id == null || !ids.contains(id) || item.optBoolean("familySynced", false)) continue;
            try {
                item.put("familySynced", true);
                changed = true;
            } catch (JSONException ignored) {
                // Leave untagged — worst case is one redundant (idempotent) re-push.
            }
        }
        if (changed) {
            prefs(context).edit().putString(WidgetExpenseConstants.QUEUE_KEY, queue.toString()).apply();
        }
    }

    /**
     * Removes fully-consumed items from the queue BY ID (re-reading current state, so
     * items enqueued while the sync worker was mid-flight survive). Also drops the
     * active user's malformed id-less items — except cc-payments, which are consumed
     * only by the in-app flush — since they can never sync and would loop forever.
     */
    static synchronized void removeConsumed(Context context, String activeEmail, java.util.Set<String> consumedIds) {
        JSONArray queue = readQueue(context);
        JSONArray next = new JSONArray();
        boolean changed = false;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item == null) {
                changed = true;
                continue;
            }
            String id = WidgetExpenseSyncWorker.queueItemId(item);
            if (id != null && consumedIds != null && consumedIds.contains(id)) {
                changed = true;
                continue;
            }
            if (id == null && !"cc-payment".equals(item.optString("kind", "expense"))) {
                String queuedEmail = item.optString("userEmail", null);
                boolean activeUsers = (activeEmail == null && queuedEmail == null)
                    || String.valueOf(activeEmail).equals(String.valueOf(queuedEmail));
                if (activeUsers) {
                    changed = true;
                    continue;
                }
            }
            next.put(item);
        }
        if (changed) {
            prefs(context).edit().putString(WidgetExpenseConstants.QUEUE_KEY, next.toString()).apply();
        }
    }

    static List<JSONObject> toList(JSONArray queue) {
        List<JSONObject> items = new ArrayList<>();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item != null) items.add(item);
        }
        return items;
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(WidgetExpenseConstants.PREFS_NAME, Context.MODE_PRIVATE);
    }
}
