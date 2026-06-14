package com.spenza.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

/**
 * WidgetTheme bridges the app's selected theme (ThemeService `pf-palette` + `pf-style`, persisted
 * in CapacitorStorage) into the native home-screen widgets, so the widget body matches the app's
 * glass / neumorphism / claymorphism / neobrutalism surface and palette color in light or dark.
 */
final class WidgetTheme {
    private static final String PALETTE_KEY = "pf-palette";
    private static final String STYLE_KEY = "pf-style";
    private static final int MAX_BITMAP_SIDE_PX = 400;

    private final int style;
    private final int primary;
    private final int glow;
    private final boolean dark;
    private final int ctaDrawableRes;

    private WidgetTheme(int style, int primary, int glow, boolean dark, int ctaDrawableRes) {
        this.style = style;
        this.primary = primary;
        this.glow = glow;
        this.dark = dark;
        this.ctaDrawableRes = ctaDrawableRes;
    }

    static WidgetTheme from(Context context) {
        SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
        String palette = prefs.getString(PALETTE_KEY, "violet");
        String styleName = prefs.getString(STYLE_KEY, "glass");

        int primaryRes;
        int glowRes;
        int ctaRes;
        switch (palette == null ? "violet" : palette) {
            case "rose":
                primaryRes = R.color.widget_pal_rose_primary;
                glowRes = R.color.widget_pal_rose_glow;
                ctaRes = R.drawable.widget_primary_grad_rose;
                break;
            case "azure":
                primaryRes = R.color.widget_pal_azure_primary;
                glowRes = R.color.widget_pal_azure_glow;
                ctaRes = R.drawable.widget_primary_grad_azure;
                break;
            case "emerald":
                primaryRes = R.color.widget_pal_emerald_primary;
                glowRes = R.color.widget_pal_emerald_glow;
                ctaRes = R.drawable.widget_primary_grad_emerald;
                break;
            case "amber":
                primaryRes = R.color.widget_pal_amber_primary;
                glowRes = R.color.widget_pal_amber_glow;
                ctaRes = R.drawable.widget_primary_grad_amber;
                break;
            case "violet":
            default:
                primaryRes = R.color.widget_pal_violet_primary;
                glowRes = R.color.widget_pal_violet_glow;
                ctaRes = R.drawable.widget_primary_grad_violet;
                break;
        }

        int styleId;
        switch (styleName == null ? "glass" : styleName) {
            case "neobrutalism":
                styleId = WidgetSurface.NEOBRUTALISM;
                break;
            case "neumorphism":
                styleId = WidgetSurface.NEUMORPHISM;
                break;
            case "claymorphism":
                styleId = WidgetSurface.CLAYMORPHISM;
                break;
            case "glass":
            default:
                styleId = WidgetSurface.GLASS;
                break;
        }

        boolean dark = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;

        return new WidgetTheme(
            styleId,
            ContextCompat.getColor(context, primaryRes),
            ContextCompat.getColor(context, glowRes),
            dark,
            ctaRes
        );
    }

    /** Renders the themed body bitmap into the given ImageView. Falls back silently to the
     *  layout's static background drawable if rendering fails. */
    void applySurface(Context context, RemoteViews views, int imageViewId, Bundle options) {
        try {
            DisplayMetrics metrics = context.getResources().getDisplayMetrics();
            float density = metrics.density <= 0 ? 1f : metrics.density;

            int widthDp = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int heightDp = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (widthDp <= 0) widthDp = 300;
            if (heightDp <= 0) heightDp = 180;

            int widthPx = Math.round(widthDp * density);
            int heightPx = Math.round(heightDp * density);
            float clamp = Math.min(1f, MAX_BITMAP_SIDE_PX / (float) Math.max(widthPx, heightPx));
            widthPx = Math.max(1, Math.round(widthPx * clamp));
            heightPx = Math.max(1, Math.round(heightPx * clamp));
            float renderDensity = density * clamp;

            Bitmap bitmap = WidgetSurface.render(style, primary, glow, dark, widthPx, heightPx, renderDensity);
            if (bitmap != null) {
                views.setImageViewBitmap(imageViewId, bitmap);
            }
        } catch (Throwable ignored) {
            // Keep the static fallback background already set on the layout root.
        }
    }

    int primaryColor() {
        return primary;
    }

    int ctaDrawable() {
        return ctaDrawableRes;
    }
}
