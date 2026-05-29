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
        String token = validAccessToken(prefs);
        if (token == null) {
            Log.w(TAG, "No valid cached token; keeping widget expenses queued.");
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
            List<JSONObject> remaining = new ArrayList<>();
            int syncedCount = 0;
            for (JSONObject queuedItem : queuedEntries) {
                String queuedEmail = queuedItem.optString("userEmail", null);
                if ((activeEmail != null || queuedEmail != null) && !String.valueOf(activeEmail).equals(String.valueOf(queuedEmail))) {
                    remaining.add(queuedItem);
                    continue;
                }

                String kind = queuedItem.optString("kind", "expense");
                if ("adjustment".equals(kind)) {
                    JSONObject adjustment = queuedItem.optJSONObject("adjustment");
                    if (adjustment == null) {
                        syncedCount++;
                        continue;
                    }
                    String id = adjustment.optString("id", "");
                    if (!id.isEmpty() && !existingAdjustmentIds.contains(id)) {
                        if (!applyAccountAdjustment(accounts, adjustment)) {
                            remaining.add(queuedItem);
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
                        mergedExpenses.put(entry);
                        existingIds.add(id);
                    }
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
            doc.put("lastUpdated", WidgetExpenseUtils.isoNow());
            String modifiedTime = writeBackupFile(fileId, token, doc);
            writeLocalBackupSnapshot(prefs, fileId, modifiedTime, doc);
            WidgetExpenseQueue.replaceQueue(context, remaining);
            Log.d(TAG, "Synced " + syncedCount + " widget expenses to Drive.");
            return Result.success();
        } catch (UnauthorizedException error) {
            Log.w(TAG, "Cached token rejected by Drive; keeping queue.", error);
            return Result.retry();
        } catch (Exception error) {
            Log.e(TAG, "Widget expense sync failed.", error);
            return Result.retry();
        }
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
            return sharedFileId == null || sharedFileId.trim().isEmpty() ? null : sharedFileId;
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
