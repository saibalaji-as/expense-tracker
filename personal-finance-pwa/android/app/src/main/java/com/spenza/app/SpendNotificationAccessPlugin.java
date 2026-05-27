package com.spenza.app;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SpendNotificationAccess")
public class SpendNotificationAccessPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("permissionGranted", isNotificationListenerEnabled());
        result.put(
            "promptEnabled",
            WidgetExpenseQueue.prefs(getContext())
                .getBoolean(WidgetExpenseConstants.SPEND_NOTIFICATION_PROMPTS_ENABLED_KEY, false)
        );
        call.resolve(result);
    }

    @PluginMethod
    public void setPromptEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        WidgetExpenseQueue.prefs(getContext())
            .edit()
            .putBoolean(WidgetExpenseConstants.SPEND_NOTIFICATION_PROMPTS_ENABLED_KEY, enabled)
            .apply();
        getStatus(call);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private boolean isNotificationListenerEnabled() {
        String enabledListeners = Settings.Secure.getString(
            getContext().getContentResolver(),
            "enabled_notification_listeners"
        );
        if (TextUtils.isEmpty(enabledListeners)) return false;
        ComponentName expected = new ComponentName(getContext(), SpendNotificationListenerService.class);
        String expectedLong = expected.flattenToString();
        String expectedShort = expected.flattenToShortString();
        String[] entries = enabledListeners.split(":");
        for (String entry : entries) {
            if (expectedLong.equalsIgnoreCase(entry) || expectedShort.equalsIgnoreCase(entry)) return true;
            ComponentName enabled = ComponentName.unflattenFromString(entry);
            if (enabled != null
                && expected.getPackageName().equals(enabled.getPackageName())
                && expected.getClassName().equals(enabled.getClassName())) {
                return true;
            }
        }
        return false;
    }
}
