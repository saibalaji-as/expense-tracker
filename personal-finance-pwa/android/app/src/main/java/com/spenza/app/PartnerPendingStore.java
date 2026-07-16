package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Device-local, DISPLAY-ONLY overlay of partner ledger records delivered by
 * FCM while the app is closed (docs/family-sync-centralization-plan.md §8).
 *
 * The home-screen widget renders: snapshot expenses + this device's queue +
 * this overlay. The overlay NEVER touches the queue, the snapshot document, or
 * any authoritative state — real sync happens exclusively through the app's
 * ledger listener. When the app next opens it applies the same records from
 * the ledger and rewrites the snapshot; overlay records received BEFORE the
 * snapshot's savedAt are superseded and pruned at read time.
 */
final class PartnerPendingStore {
    private static final String TAG = "PartnerPending";
    private static final int MAX_RECORDS = 100;
    private static final long MAX_AGE_MS = 14L * 24 * 60 * 60 * 1000;

    private PartnerPendingStore() {}

    /** Upserts one FCM-delivered record: {id, deleted, entry, updatedByEmail}. */
    static void upsert(Context context, JSONObject record, String activeEmail) {
        if (record == null || activeEmail == null) return;
        String id = record.optString("id", "");
        if (id.isEmpty()) return;
        SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
        synchronized (PartnerPendingStore.class) {
            try {
                JSONObject store = readStore(prefs);
                // The overlay belongs to the signed-in account; a stale store
                // from a previous account must not leak into this one's widget.
                if (!activeEmail.equals(store.optString("userEmail", null))) {
                    store = new JSONObject();
                    store.put("userEmail", activeEmail);
                    store.put("records", new JSONObject());
                }
                JSONObject records = store.optJSONObject("records");
                if (records == null) {
                    records = new JSONObject();
                    store.put("records", records);
                }
                JSONObject item = new JSONObject();
                item.put("deleted", record.optBoolean("deleted", false));
                item.put("receivedAt", System.currentTimeMillis());
                JSONObject entry = record.optJSONObject("entry");
                if (entry != null) item.put("entry", entry);
                records.put(id, item);
                prune(records);
                prefs.edit().putString(WidgetExpenseConstants.PARTNER_PENDING_KEY, store.toString()).apply();
            } catch (JSONException error) {
                Log.w(TAG, "Failed to upsert partner pending record.", error);
            }
        }
    }

    /**
     * Merges the overlay into the snapshot's expense array for widget display.
     * Rules: overlay records received at/before the snapshot's savedAt are
     * superseded (the app already applied them from the ledger). A live overlay
     * record replaces the snapshot copy with the same id (partner edit); a
     * tombstoned one removes it (partner delete). Never mutates storage state
     * beyond pruning superseded/old overlay records.
     */
    static JSONArray overlayExpenses(
        Context context,
        JSONArray snapshotExpenses,
        String activeEmail,
        long snapshotSavedAtMillis
    ) {
        SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
        JSONObject store = readStore(prefs);
        JSONObject records = store.optJSONObject("records");
        if (records == null || records.length() == 0 || activeEmail == null
            || !activeEmail.equals(store.optString("userEmail", null))) {
            return snapshotExpenses;
        }

        // Live (non-superseded) overlay records only.
        JSONObject active = new JSONObject();
        boolean pruned = false;
        Iterator<String> keys = records.keys();
        List<String> staleKeys = new ArrayList<>();
        while (keys.hasNext()) {
            String id = keys.next();
            JSONObject item = records.optJSONObject(id);
            long receivedAt = item == null ? 0 : item.optLong("receivedAt", 0);
            if (item == null || receivedAt <= snapshotSavedAtMillis
                || receivedAt < System.currentTimeMillis() - MAX_AGE_MS) {
                staleKeys.add(id);
                continue;
            }
            try {
                active.put(id, item);
            } catch (JSONException ignored) {
                staleKeys.add(id);
            }
        }
        for (String id : staleKeys) {
            records.remove(id);
            pruned = true;
        }
        if (pruned) {
            prefs.edit().putString(WidgetExpenseConstants.PARTNER_PENDING_KEY, store.toString()).apply();
        }
        if (active.length() == 0) return snapshotExpenses;

        JSONArray merged = new JSONArray();
        if (snapshotExpenses != null) {
            for (int i = 0; i < snapshotExpenses.length(); i++) {
                JSONObject entry = snapshotExpenses.optJSONObject(i);
                String id = entry == null ? "" : entry.optString("id", "");
                if (!id.isEmpty() && active.has(id)) continue; // overridden or deleted by overlay
                merged.put(entry);
            }
        }
        Iterator<String> activeKeys = active.keys();
        while (activeKeys.hasNext()) {
            JSONObject item = active.optJSONObject(activeKeys.next());
            if (item == null || item.optBoolean("deleted", false)) continue;
            JSONObject entry = item.optJSONObject("entry");
            if (entry != null) merged.put(entry);
        }
        return merged;
    }

    private static JSONObject readStore(SharedPreferences prefs) {
        String raw = prefs.getString(WidgetExpenseConstants.PARTNER_PENDING_KEY, null);
        if (raw == null) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    /** Caps the store: newest MAX_RECORDS by receivedAt, drops anything older than MAX_AGE_MS. */
    private static void prune(JSONObject records) {
        long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
        List<String> ids = new ArrayList<>();
        Iterator<String> keys = records.keys();
        while (keys.hasNext()) ids.add(keys.next());
        for (String id : ids) {
            JSONObject item = records.optJSONObject(id);
            if (item == null || item.optLong("receivedAt", 0) < cutoff) records.remove(id);
        }
        while (records.length() > MAX_RECORDS) {
            String oldestId = null;
            long oldest = Long.MAX_VALUE;
            Iterator<String> remaining = records.keys();
            while (remaining.hasNext()) {
                String id = remaining.next();
                JSONObject item = records.optJSONObject(id);
                long receivedAt = item == null ? 0 : item.optLong("receivedAt", 0);
                if (receivedAt < oldest) {
                    oldest = receivedAt;
                    oldestId = id;
                }
            }
            if (oldestId == null) break;
            records.remove(oldestId);
        }
    }
}
