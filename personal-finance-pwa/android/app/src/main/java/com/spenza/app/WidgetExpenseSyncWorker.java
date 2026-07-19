package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class WidgetExpenseSyncWorker extends Worker {
    private static final String TAG = "WidgetExpenseSync";

    public WidgetExpenseSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetExpenseSyncWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context)
            .enqueueUniqueWork(WidgetExpenseConstants.SYNC_WORK_NAME, ExistingWorkPolicy.KEEP, request);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        JSONArray queue = WidgetExpenseQueue.readQueue(context);
        List<JSONObject> queuedEntries = WidgetExpenseQueue.toList(queue);
        if (queuedEntries.isEmpty()) return Result.success();

        SharedPreferences prefs = WidgetExpenseQueue.prefs(context);

        // ── Family (Firestore) instant sync — runs FIRST, independent of the Google Drive
        // access token. This is how the partner receives the expense, and it must work even
        // when the app has been killed for hours and the cached Drive token is expired (it
        // uses the long-lived Firebase refresh token instead). Idempotent on the backend
        // (dedupes by id), so re-running on later Drive retries is harmless.
        //
        // SYNC TAG: each queue item that reached the family state doc is tagged
        // `familySynced=true` (wrapper-level, never leaks into the backup schema — the
        // Angular flush consumes only `entry`/`adjustment`). Untagged family-eligible
        // items are NEVER dropped by the Drive leg below, and their presence forces
        // Result.retry() — a failed family push can no longer be silently lost.
        boolean familyPushPending = false;
        boolean firestoreFamily = isFirestoreFamily(prefs);
        if (firestoreFamily) {
            JSONArray familyExpenses = new JSONArray();
            JSONArray familyAdjustments = new JSONArray();
            List<JSONObject> pushedItems = new ArrayList<>();
            for (JSONObject queuedItem : queuedEntries) {
                if (!requiresFamilyPush(prefs, queuedItem)) continue;
                String familyKind = queuedItem.optString("kind", "expense");
                if ("adjustment".equals(familyKind)) {
                    JSONObject adjustment = queuedItem.optJSONObject("adjustment");
                    if (adjustment != null) familyAdjustments.put(adjustment);
                } else {
                    JSONObject entry = queuedItem.optJSONObject("entry");
                    if (entry == null) entry = queuedItem;
                    familyExpenses.put(entry);
                }
                pushedItems.add(queuedItem);
            }
            if (familyExpenses.length() > 0 || familyAdjustments.length() > 0) {
                boolean pushed = pushFamilyWidgetExpenses(prefs, familyExpenses, familyAdjustments);
                Log.d(TAG, "Family Firestore push (pre-Drive) result=" + pushed
                    + " expenses=" + familyExpenses.length() + " adjustments=" + familyAdjustments.length());
                if (pushed) {
                    // Tag + persist immediately so a later crash/Drive retry doesn't
                    // treat these as unpushed. Re-reads the queue by id, so entries
                    // enqueued concurrently by the widget are never clobbered.
                    Set<String> pushedIds = new HashSet<>();
                    for (JSONObject item : pushedItems) {
                        try {
                            item.put("familySynced", true);
                        } catch (JSONException ignored) {
                            // In-memory tag only; the persisted tag below is authoritative.
                        }
                        String id = queueItemId(item);
                        if (id != null) pushedIds.add(id);
                    }
                    WidgetExpenseQueue.markFamilySynced(context, pushedIds);
                } else {
                    familyPushPending = true;
                }
            }
        }

        // ── Family Ledger mode: Firestore IS the delivery + durability channel.
        // Once the CF push is acked (familySynced tag), the records are safe
        // server-side and the partner has them; the Drive backup is written by
        // the app on next open when it consumes the queue. The old Java
        // Drive-merge leg is deleted for this mode (Phase 2 cleanup,
        // docs/family-sync-centralization-plan.md §3) — it duplicated the merge
        // logic in a third language and double-counted untagged items in the
        // widget insight (snapshot + queue).
        if (firestoreFamily) {
            Log.d(TAG, familyPushPending
                ? "Family ledger push pending — WorkManager will retry."
                : "Family ledger push complete; queue awaits app-side consumption.");
            return familyPushPending ? Result.retry() : Result.success();
        }

        String token = validAccessToken(prefs);
        if (token == null) {
            Log.w(TAG, "No valid cached token; Drive write deferred, keeping widget expenses queued.");
            return Result.retry();
        }

        try {
            String fileId = resolveBackupFileId(prefs, token);
            if (fileId == null) {
                Log.w(TAG, "No configured Drive backup file; keeping widget expenses queued.");
                return Result.retry();
            }

            JSONObject doc = readBackupFile(fileId, token);
            JSONArray expenses = doc.optJSONArray("expenses");
            if (expenses == null) {
                expenses = new JSONArray();
                doc.put("expenses", expenses);
            }
            JSONArray accounts = doc.optJSONArray("accounts");
            if (accounts == null) {
                accounts = new JSONArray();
                doc.put("accounts", accounts);
            }
            JSONArray accountAdjustments = doc.optJSONArray("accountAdjustments");
            if (accountAdjustments == null) {
                accountAdjustments = new JSONArray();
                doc.put("accountAdjustments", accountAdjustments);
            }
            JSONArray debts = doc.optJSONArray("debts");
            if (debts == null) {
                debts = new JSONArray();
                doc.put("debts", debts);
            }

            Set<String> existingIds = new HashSet<>();
            for (int i = 0; i < expenses.length(); i++) {
                JSONObject expense = expenses.optJSONObject(i);
                String id = expense == null ? null : expense.optString("id", null);
                if (id != null) existingIds.add(id);
            }
            Set<String> existingAdjustmentIds = new HashSet<>();
            for (int i = 0; i < accountAdjustments.length(); i++) {
                JSONObject adjustment = accountAdjustments.optJSONObject(i);
                String id = adjustment == null ? null : adjustment.optString("id", null);
                if (id != null) existingAdjustmentIds.add(id);
            }

            JSONArray mergedExpenses = new JSONArray();
            JSONArray mergedAdjustments = new JSONArray();
            String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
            // Ids of queue items fully consumed by this run (Drive-merged or duplicate),
            // removed from the queue BY ID afterwards so concurrent widget enqueues
            // during this network round-trip are never clobbered.
            Set<String> consumedIds = new HashSet<>();
            int syncedCount = 0;
            for (JSONObject queuedItem : queuedEntries) {
                String queuedEmail = queuedItem.optString("userEmail", null);
                if ((activeEmail != null || queuedEmail != null) && !String.valueOf(activeEmail).equals(String.valueOf(queuedEmail))) {
                    continue; // other account's item — leave queued
                }
                String kind = queuedItem.optString("kind", "expense");
                if ("cc-payment".equals(kind)) {
                    // Must go through ExpenseStore.recordDebtPayment in the app —
                    // syncing here would break account/card/audit atomicity.
                    continue;
                }
                if ("circle-expense".equals(kind)) {
                    // Circle Splits group expenses live in Firestore, not the
                    // Drive backup — only the app (CircleSyncService) can push
                    // them. Keep queued until the app flushes.
                    continue;
                }
                if ("adjustment".equals(kind)) {
                    JSONObject adjustment = queuedItem.optJSONObject("adjustment");
                    if (adjustment == null) {
                        // Malformed (no payload, no id) — removeConsumed drops id-less
                        // items for the active user, so it won't be stuck forever.
                        syncedCount++;
                        continue;
                    }
                    String id = adjustment.optString("id", "");
                    if (!id.isEmpty() && !existingAdjustmentIds.contains(id)) {
                        if (!applyAccountAdjustment(accounts, adjustment)) {
                            continue;
                        }
                        mergedAdjustments.put(adjustment);
                        existingAdjustmentIds.add(id);
                    }
                } else {
                    JSONObject entry = queuedItem.optJSONObject("entry");
                    if (entry == null) entry = queuedItem;
                    String id = entry.optString("id", "");
                    if (!id.isEmpty() && !existingIds.contains(id)) {
                        // Legacy CC-detected entries without an explicit card need the
                        // app's picker (single-card auto-assign / multi-card dialog).
                        // Syncing them here would silently deduct the wrong ledger.
                        if (entry.optBoolean("isCreditCard", false) && !entry.has("debtId")) {
                            continue;
                        }
                        if (entry.has("debtId")) {
                            if (!applyCreditCardCharge(debts, entry)) {
                                continue;
                            }
                        } else if (!applyLinkedExpense(accounts, entry)) {
                            continue;
                        }
                        mergedExpenses.put(entry);
                        existingIds.add(id);
                    }
                }
                // A family-eligible item that hasn't reached the partner yet stays
                // queued even after its Drive merge succeeds (Drive dedupes by id, so
                // keeping it is harmless; consuming it would silently lose the partner
                // sync — the exact "partner never knew" bug).
                if (!requiresFamilyPush(prefs, queuedItem)) {
                    String consumedId = queueItemId(queuedItem);
                    if (consumedId != null) consumedIds.add(consumedId);
                }
                syncedCount++;
            }
            for (int i = 0; i < expenses.length(); i++) {
                mergedExpenses.put(expenses.get(i));
            }
            for (int i = 0; i < accountAdjustments.length(); i++) {
                mergedAdjustments.put(accountAdjustments.get(i));
            }

            doc.put("expenses", mergedExpenses);
            doc.put("accounts", accounts);
            doc.put("accountAdjustments", mergedAdjustments);
            doc.put("debts", debts);
            doc.put("lastUpdated", WidgetExpenseUtils.isoNow());
            if (mergedExpenses.length() > expenses.length() || mergedAdjustments.length() > accountAdjustments.length()) {
                String modifiedTime = writeBackupFile(fileId, token, doc);
                writeLocalBackupSnapshot(prefs, fileId, modifiedTime, doc);
            }
            // (Family Firestore push already happened up-front, independent of this token.)
            WidgetExpenseQueue.removeConsumed(context, activeEmail, consumedIds);
            Log.d(TAG, "Synced " + syncedCount + " widget expenses to Drive."
                + (familyPushPending ? " Family push still pending — will retry." : ""));
            // Items that reached Drive but not the family state doc stay queued and
            // force a WorkManager retry (with backoff) until the partner has them.
            return familyPushPending ? Result.retry() : Result.success();
        } catch (UnauthorizedException error) {
            Log.w(TAG, "Cached token rejected by Drive; keeping queue.", error);
            return Result.retry();
        } catch (Exception error) {
            Log.e(TAG, "Widget expense sync failed.", error);
            return Result.retry();
        }
    }

    /** Charge a credit-card purchase against the linked debt account's balance. */
    private static boolean applyCreditCardCharge(JSONArray debts, JSONObject entry) throws JSONException {
        String debtId = entry.optString("debtId", "");
        if (debtId.isEmpty()) return true;

        double amount = WidgetExpenseUtils.roundMoney(entry.optDouble("amount", 0));
        if (amount <= 0) return false;

        for (int i = 0; i < debts.length(); i++) {
            JSONObject debt = debts.optJSONObject(i);
            if (debt == null || !debtId.equals(debt.optString("id", ""))) continue;
            if (!"credit-card".equals(debt.optString("type", "")) || !"active".equals(debt.optString("status", "active"))) {
                // Card archived/deleted since the widget save — keep the expense
                // but drop the link so no balance is silently affected.
                entry.remove("debtId");
                return true;
            }
            debt.put("remainingBalance", WidgetExpenseUtils.roundMoney(debt.optDouble("remainingBalance", 0) + amount));
            debt.put("updatedAt", WidgetExpenseUtils.isoNow());
            if (entry.has("createdByEmail")) debt.put("updatedByEmail", entry.optString("createdByEmail"));
            if (entry.has("createdByRole")) debt.put("updatedByRole", entry.optString("createdByRole"));
            return true;
        }
        // Card not found in the remote doc — same fallback as above.
        entry.remove("debtId");
        return true;
    }

    private static boolean applyLinkedExpense(JSONArray accounts, JSONObject entry) throws JSONException {
        String accountId = entry.optString("accountId", "");
        if (accountId.isEmpty()) return true;

        double amount = WidgetExpenseUtils.roundMoney(entry.optDouble("amount", 0));
        if (amount <= 0) return false;

        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.optJSONObject(i);
            if (account == null || !accountId.equals(account.optString("id", "")) || account.optBoolean("archived", false)) {
                continue;
            }
            double nextBalance = WidgetExpenseUtils.roundMoney(account.optDouble("balance", 0) - amount);
            if (!account.optBoolean("allowOverdraft", false) && nextBalance < 0) return false;

            account.put("balance", nextBalance);
            account.put("updatedAt", WidgetExpenseUtils.isoNow());
            if (entry.has("createdByEmail")) account.put("updatedByEmail", entry.optString("createdByEmail"));
            if (entry.has("createdByRole")) account.put("updatedByRole", entry.optString("createdByRole"));
            return true;
        }
        return false;
    }

    private static boolean applyAccountAdjustment(JSONArray accounts, JSONObject adjustment) throws JSONException {
        String accountId = adjustment.optString("accountId", "");
        double amount = WidgetExpenseUtils.roundMoney(adjustment.optDouble("amount", 0));
        if (accountId.isEmpty() || amount <= 0) return false;

        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.optJSONObject(i);
            if (account == null || !accountId.equals(account.optString("id", "")) || account.optBoolean("archived", false)) {
                continue;
            }
            double nextBalance = WidgetExpenseUtils.roundMoney(account.optDouble("balance", 0) + amount);
            account.put("balance", nextBalance);
            account.put("updatedAt", WidgetExpenseUtils.isoNow());
            if (adjustment.has("createdByEmail")) account.put("updatedByEmail", adjustment.optString("createdByEmail"));
            if (adjustment.has("createdByRole")) account.put("updatedByRole", adjustment.optString("createdByRole"));
            return true;
        }
        return false;
    }

    /**
     * True when this queue item still owes a push to the family Firestore state doc:
     * Firestore-family mode, belongs to the active user, is a family-synced kind
     * (cc-payments resolve app-side only), and hasn't been tagged `familySynced` yet.
     */
    static boolean requiresFamilyPush(SharedPreferences prefs, JSONObject queuedItem) {
        if (!isFirestoreFamily(prefs)) return false;
        if (queuedItem.optBoolean("familySynced", false)) return false;
        if ("cc-payment".equals(queuedItem.optString("kind", "expense"))) return false;
        String activeEmail = prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null);
        String queuedEmail = queuedItem.optString("userEmail", null);
        if ((activeEmail != null || queuedEmail != null)
            && !String.valueOf(activeEmail).equals(String.valueOf(queuedEmail))) {
            return false;
        }
        return true;
    }

    /** Stable id of a queue item's payload (entry/adjustment/payment), or null if malformed. */
    static String queueItemId(JSONObject queuedItem) {
        if (queuedItem == null) return null;
        String kind = queuedItem.optString("kind", "expense");
        JSONObject payload;
        if ("adjustment".equals(kind)) {
            payload = queuedItem.optJSONObject("adjustment");
        } else if ("cc-payment".equals(kind)) {
            payload = queuedItem.optJSONObject("payment");
        } else {
            payload = queuedItem.optJSONObject("entry");
            if (payload == null) payload = queuedItem; // legacy bare-entry item
        }
        if (payload == null) return null;
        String id = payload.optString("id", "");
        return id.isEmpty() ? null : id;
    }

    /** True only for the modern Firestore-based family mode (family mode with no shared Drive file). */
    private static boolean isFirestoreFamily(SharedPreferences prefs) {
        String mode = prefs.getString(WidgetExpenseConstants.BACKUP_MODE_KEY, null);
        if (!"family".equals(mode)) return false;
        String shared = prefs.getString(WidgetExpenseConstants.SHARED_FILE_ID_KEY, null);
        if (shared != null && !shared.trim().isEmpty()) return false; // legacy Drive-based family
        String familyId = prefs.getString(WidgetExpenseConstants.FIRESTORE_FAMILY_ID_KEY, null);
        return familyId != null && !familyId.trim().isEmpty();
    }

    /**
     * Pushes new widget items to the family's shared Firestore state via the
     * syncWidgetExpenseToFamily Cloud Function. Mints a fresh Firebase ID token from
     * the persisted refresh token so it works even hours after the app was last open.
     * Returns true only on a 2xx response; any failure (incl. 409 "state not ready")
     * returns false so the caller keeps the items queued for retry.
     */
    private static boolean pushFamilyWidgetExpenses(SharedPreferences prefs, JSONArray expenses, JSONArray adjustments) {
        try {
            String refreshToken = prefs.getString(WidgetExpenseConstants.FIREBASE_REFRESH_TOKEN_KEY, null);
            if (refreshToken == null || refreshToken.trim().isEmpty()) {
                Log.w(TAG, "No Firebase refresh token; cannot push family widget expenses.");
                return false;
            }
            String familyId = prefs.getString(WidgetExpenseConstants.FIRESTORE_FAMILY_ID_KEY, null);
            if (familyId == null || familyId.trim().isEmpty()) return false;

            String idToken = exchangeRefreshToken(refreshToken);
            if (idToken == null) return false;

            JSONObject body = new JSONObject();
            body.put("familyId", familyId);
            body.put("expenses", expenses);
            body.put("adjustments", adjustments);

            HttpURLConnection connection = (HttpURLConnection) new URL(WidgetExpenseConstants.FAMILY_WIDGET_SYNC_URL).openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Bearer " + idToken);
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            String response = readResponse(connection);
            if (code >= 200 && code < 300) {
                Log.d(TAG, "Family Firestore push ok: " + response);
                return true;
            }
            Log.w(TAG, "Family Firestore push HTTP " + code + ": " + response);
            return false;
        } catch (Exception error) {
            Log.e(TAG, "Family Firestore push error.", error);
            return false;
        }
    }

    /** Exchanges a Firebase refresh token for a fresh ID token via the securetoken API. */
    private static String exchangeRefreshToken(String refreshToken) {
        try {
            String form = "grant_type=refresh_token&refresh_token="
                + URLEncoder.encode(refreshToken, "UTF-8");
            HttpURLConnection connection = (HttpURLConnection) new URL(WidgetExpenseConstants.SECURETOKEN_URL).openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(form.getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            String response = readResponse(connection);
            if (code < 200 || code >= 300) {
                Log.w(TAG, "securetoken HTTP " + code + ": " + response);
                return null;
            }
            String idToken = new JSONObject(response).optString("id_token", null);
            return idToken != null && !idToken.isEmpty() ? idToken : null;
        } catch (Exception error) {
            Log.e(TAG, "securetoken exchange error.", error);
            return null;
        }
    }

    private static String validAccessToken(SharedPreferences prefs) {
        if (!"1".equals(prefs.getString(WidgetExpenseConstants.AUTH_STATE_KEY, null))) return null;
        String token = prefs.getString(WidgetExpenseConstants.ACCESS_TOKEN_KEY, null);
        if (token == null || token.trim().isEmpty()) return null;
        String expiresAtRaw = prefs.getString(WidgetExpenseConstants.ACCESS_TOKEN_EXPIRES_AT_KEY, null);
        if (expiresAtRaw != null) {
            try {
                long expiresAt = Long.parseLong(expiresAtRaw);
                if (expiresAt > 0 && System.currentTimeMillis() > expiresAt - 60_000L) return null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return token;
    }

    private static String resolveBackupFileId(SharedPreferences prefs, String token) throws IOException, JSONException, UnauthorizedException {
        String mode = prefs.getString(WidgetExpenseConstants.BACKUP_MODE_KEY, null);
        if ("family".equals(mode)) {
            String sharedFileId = prefs.getString(WidgetExpenseConstants.SHARED_FILE_ID_KEY, null);
            if (sharedFileId != null && !sharedFileId.trim().isEmpty()) {
                return sharedFileId; // legacy Drive-based family: single shared file
            }
            // Firestore-based family: no shared Drive file. Each user keeps their own
            // personal backup (resolved below) and the partner is reached via Firestore.
        }

        String snapshotRaw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
        if (snapshotRaw != null) {
            try {
                JSONObject snapshot = new JSONObject(snapshotRaw);
                String fileId = snapshot.optString("fileId", "");
                if (!fileId.isEmpty()) return fileId;
            } catch (JSONException ignored) {
                // Fall through to Drive discovery.
            }
        }

        return findSingleBackupFile(token);
    }

    private static String findSingleBackupFile(String token) throws IOException, JSONException, UnauthorizedException {
        String url = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'spenza-backup.json'&fields=files(id)&_=" + System.currentTimeMillis();
        HttpURLConnection connection = open(url, "GET", token);
        String body = readResponse(connection);
        if (connection.getResponseCode() == 401 || connection.getResponseCode() == 403) throw new UnauthorizedException();
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            throw new IOException("findBackupFile failed: " + connection.getResponseCode() + " " + body);
        }
        JSONArray files = new JSONObject(body).optJSONArray("files");
        JSONObject first = files != null && files.length() > 0 ? files.optJSONObject(0) : null;
        return first == null ? null : first.optString("id", null);
    }

    private static JSONObject readBackupFile(String fileId, String token) throws IOException, JSONException, UnauthorizedException {
        String url = "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&_=" + System.currentTimeMillis();
        HttpURLConnection connection = open(url, "GET", token);
        String body = readResponse(connection);
        if (connection.getResponseCode() == 401 || connection.getResponseCode() == 403) throw new UnauthorizedException();
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            throw new IOException("readBackupFile failed: " + connection.getResponseCode() + " " + body);
        }
        return new JSONObject(body);
    }

    private static String writeBackupFile(String fileId, String token, JSONObject doc) throws IOException, JSONException, UnauthorizedException {
        String url = "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media&fields=modifiedTime";
        HttpURLConnection connection = open(url, "PATCH", token);
        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        connection.setDoOutput(true);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(doc.toString().getBytes(StandardCharsets.UTF_8));
        }
        String body = readResponse(connection);
        if (connection.getResponseCode() == 401 || connection.getResponseCode() == 403) throw new UnauthorizedException();
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            throw new IOException("writeBackupFile failed: " + connection.getResponseCode() + " " + body);
        }
        return new JSONObject(body).optString("modifiedTime", null);
    }

    private static void writeLocalBackupSnapshot(SharedPreferences prefs, String fileId, String modifiedTime, JSONObject doc) throws JSONException {
        JSONObject snapshot = new JSONObject();
        String mode = prefs.getString(WidgetExpenseConstants.BACKUP_MODE_KEY, "single");
        snapshot.put("version", "1");
        snapshot.put("userEmail", prefs.getString(WidgetExpenseConstants.USER_EMAIL_KEY, null));
        snapshot.put("fileId", fileId);
        snapshot.put("mode", "family".equals(mode) ? "family" : "single");
        snapshot.put("sharedFileId", "family".equals(mode) ? prefs.getString(WidgetExpenseConstants.SHARED_FILE_ID_KEY, null) : JSONObject.NULL);
        snapshot.put("modifiedTime", modifiedTime == null ? JSONObject.NULL : modifiedTime);
        snapshot.put("dirty", false);
        snapshot.put("savedAt", WidgetExpenseUtils.isoNow());
        snapshot.put("doc", doc);
        prefs.edit().putString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, snapshot.toString()).apply();
    }

    private static HttpURLConnection open(String url, String method, String token) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(20_000);
        return connection;
    }

    private static String readResponse(HttpURLConnection connection) throws IOException {
        InputStream stream = connection.getResponseCode() >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
            return builder.toString();
        }
    }

    private static final class UnauthorizedException extends Exception {}
}
