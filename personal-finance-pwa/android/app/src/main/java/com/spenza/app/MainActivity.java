package com.spenza.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required marker method for @capgo/capacitor-social-login scopes support
    }
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Optimize WebView performance
        optimizeWebView();
        
        // NOTE: Permission requests (battery optimization, exact alarms) are now handled
        // by the LocalNotificationService when the user enables notifications in Settings.
        // This prevents blocking the app startup with permission dialogs.
    }
    
    private void optimizeWebView() {
        try {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            
            // Enable hardware acceleration
            webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
            
            // Enable caching for better performance
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            
            // Improve rendering performance
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
            
            // Enable smooth scrolling
            webView.setScrollBarStyle(WebView.SCROLLBARS_OUTSIDE_OVERLAY);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Error optimizing WebView", e);
        }
    }
}
