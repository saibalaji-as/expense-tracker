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
        SharedPreferences prefs = prefs(context);
        JSONArray queue = readQueue(context);
        JSONObject queued = new JSONObject();
        queued.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
        queued.put("entry", entry);
        queue.put(queued);
        prefs.edit().putString(WidgetExpenseConstants.QUEUE_KEY, queue.toString()).apply();
        WidgetExpenseSyncWorker.schedule(context);
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
