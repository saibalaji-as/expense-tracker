package com.spenza.app;

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
}
