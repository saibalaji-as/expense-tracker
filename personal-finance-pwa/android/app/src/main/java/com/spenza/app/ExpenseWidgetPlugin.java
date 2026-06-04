package com.spenza.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExpenseWidget")
public class ExpenseWidgetPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        ExpenseWidgetProvider.updateAll(getContext());
        call.resolve();
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
     * Asks the launcher to pin the Spenza widget to the home screen.
     * Shows a system dialog; user must confirm. Returns { supported: boolean }.
     */
    @PluginMethod
    public void requestPin(PluginCall call) {
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
            if (mgr.isRequestPinAppWidgetSupported()) {
                ComponentName provider = new ComponentName(getContext(), ExpenseWidgetProvider.class);
                mgr.requestPinAppWidget(provider, null, null);
                supported = true;
            }
        }
        JSObject result = new JSObject();
        result.put("supported", supported);
        call.resolve(result);
    }
}
