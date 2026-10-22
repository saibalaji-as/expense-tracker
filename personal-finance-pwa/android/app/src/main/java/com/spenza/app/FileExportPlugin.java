package com.spenza.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * FileExportPlugin — gives exported files (CSV statements, JSON backups, bill images)
 * a real place on the phone.
 *
 * WHY: the Android WebView silently ignores `<a download>` on blob/data URLs and has no
 * file-capable navigator.share, so the web download path "succeeded" without writing
 * anything. This plugin writes the bytes natively:
 *  - saveToDownloads(): public Downloads/Spenza via MediaStore (Android 10+, no permission).
 *  - share():           app cache + FileProvider + system share sheet (any Android version;
 *                       used as the fallback on Android 7–9 or if MediaStore fails).
 */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    private static final String DOWNLOADS_SUBFOLDER = "Spenza";

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        byte[] bytes;
        try {
            bytes = decode(call);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid file content", e);
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.unavailable("Saving to Downloads needs Android 10 or newer");
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOADS_SUBFOLDER);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("MediaStore insert returned null");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Could not open output stream");
                out.write(bytes);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("fileName", fileName);
            result.put("folder", Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOADS_SUBFOLDER);
            call.resolve(result);
        } catch (Exception e) {
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (Exception ignored) { }
            }
            call.reject("Could not save the file to Downloads", e);
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        try {
            byte[] bytes = decode(call);
            File dir = new File(getContext().getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create export folder");
            File file = new File(dir, fileName);
            try (FileOutputStream out = new FileOutputStream(file, false)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", file);

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, fileName);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, fileName);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not share the file", e);
        }
    }

    private static byte[] decode(PluginCall call) {
        String content = call.getString("content", "");
        String encoding = call.getString("encoding", "utf8");
        if ("base64".equals(encoding)) return Base64.decode(content, Base64.DEFAULT);
        return content.getBytes(StandardCharsets.UTF_8);
    }

    /** Keeps the name to one path segment so a crafted name can't escape the target folder. */
    private static String safeFileName(String raw) {
        String name = raw == null ? "" : raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.isEmpty()) name = "spenza-export";
        return name.length() > 120 ? name.substring(0, 120) : name;
    }
}
