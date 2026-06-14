package com.spenza.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * StreakWidgetPlugin lets the Angular app refresh and pin the Spenza Daily Streak widget,
 * mirroring {@link ExpenseWidgetPlugin}. The app should call refresh() after writing the
 * local backup snapshot so the streak reflects newly added expenses.
 */
@CapacitorPlugin(name = "StreakWidget")
public class StreakWidgetPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        StreakWidgetProvider.updateAll(getContext());
        call.resolve();
    }

    /** Returns whether the user has already added the streak widget to their home screen. */
    @PluginMethod
    public void isAdded(PluginCall call) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
        ComponentName provider = new ComponentName(getContext(), StreakWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(provider);
        JSObject result = new JSObject();
        result.put("added", ids != null && ids.length > 0);
        call.resolve(result);
    }

    /** Returns whether the launcher supports the pin-widget request dialog. */
    @PluginMethod
    public void isSupported(PluginCall call) {
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
            supported = mgr.isRequestPinAppWidgetSupported();
        }
        JSObject result = new JSObject();
        result.put("supported", supported);
        call.resolve(result);
    }

    /**
     * Asks the launcher to pin the streak widget to the home screen.
     * Shows a system dialog; user must confirm. Returns { supported: boolean }.
     */
    @PluginMethod
    public void requestPin(PluginCall call) {
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
            if (mgr.isRequestPinAppWidgetSupported()) {
                ComponentName provider = new ComponentName(getContext(), StreakWidgetProvider.class);
                mgr.requestPinAppWidget(provider, null, null);
                supported = true;
            }
        }
        JSObject result = new JSObject();
        result.put("supported", supported);
        call.resolve(result);
    }
}
