package com.spenza.app;

import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;

/**
 * WidgetSurface renders the Spenza widget body as a Bitmap, reproducing the app's four design
 * styles (glass / neumorphism / claymorphism / neobrutalism) in the user's selected palette and
 * the active light/dark theme. RemoteViews cannot apply blur or per-palette gradients through
 * static XML drawables, so the body is drawn on a software Canvas and pushed via
 * {@code setImageViewBitmap}.
 */
final class WidgetSurface {
    static final int GLASS = 0;
    static final int NEOBRUTALISM = 1;
    static final int NEUMORPHISM = 2;
    static final int CLAYMORPHISM = 3;

    private WidgetSurface() {}

    static Bitmap render(int style, int primary, int glow, boolean dark, int w, int h, float density) {
        if (w <= 0 || h <= 0) return null;
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        switch (style) {
            case NEOBRUTALISM:
                drawNeobrutalism(canvas, primary, glow, dark, w, h, density);
                break;
            case NEUMORPHISM:
                drawNeumorphism(canvas, primary, glow, dark, w, h, density);
                break;
            case CLAYMORPHISM:
                drawClay(canvas, primary, glow, dark, w, h, density);
                break;
            case GLASS:
            default:
                drawGlass(canvas, primary, glow, dark, w, h, density);
                break;
        }
        return bitmap;
    }

    // ----- Glass: translucent frosted panel that lets the wallpaper bleed through -----
    private static void drawGlass(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        float radius = 22 * d;
        float inset = 3 * d;
        RectF panel = new RectF(inset, inset, w - inset, h - inset);

        int base = dark ? 0xFF1E2436 : 0xFFFFFFFF;
        // Soft palette glow behind the panel.
        Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        glowPaint.setColor(withAlpha(primary, dark ? 70 : 55));
        glowPaint.setMaskFilter(new BlurMaskFilter(14 * d, BlurMaskFilter.Blur.NORMAL));
        c.drawRoundRect(panel, radius, radius, glowPaint);

        // Translucent gradient fill (alpha so the launcher wallpaper shows through).
        int alpha = dark ? 205 : 200;
        int topColor = withAlpha(blend(base, primary, dark ? 0.22f : 0.12f), alpha);
        int bottomColor = withAlpha(blend(base, glow, dark ? 0.16f : 0.08f), alpha);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(panel.left, panel.top, panel.right, panel.bottom,
            topColor, bottomColor, Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, fill);

        // Top sheen highlight.
        Paint sheen = new Paint(Paint.ANTI_ALIAS_FLAG);
        sheen.setShader(new LinearGradient(0, panel.top, 0, panel.top + h * 0.5f,
            withAlpha(0xFFFFFFFF, dark ? 36 : 120), withAlpha(0xFFFFFFFF, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, sheen);

        // Hairline border.
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, 1 * d));
        border.setColor(withAlpha(dark ? 0xFFFFFFFF : primary, dark ? 60 : 70));
        c.drawRoundRect(panel, radius, radius, border);
    }

    // ----- Neumorphism: soft extruded panel with dual light/dark shadows -----
    private static void drawNeumorphism(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        int base = blend(dark ? 0xFF2A3142 : 0xFFECEFF5, primary, 0.06f);
        float radius = 22 * d;
        // Rounded surface fill (covers full bounds; keeps outer corners rounded on all APIs).
        Paint surface = new Paint(Paint.ANTI_ALIAS_FLAG);
        surface.setColor(base);
        c.drawRoundRect(new RectF(0, 0, w, h), radius, radius, surface);

        float inset = 11 * d;
        RectF panel = new RectF(inset, inset, w - inset, h - inset);
        float off = 5 * d;

        // Dark shadow bottom-right.
        Paint dShadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        dShadow.setColor(dark ? withAlpha(0xFF000000, 120) : withAlpha(blend(0xFF2A2F45, primary, 0.2f), 90));
        dShadow.setMaskFilter(new BlurMaskFilter(9 * d, BlurMaskFilter.Blur.NORMAL));
        RectF dr = new RectF(panel);
        dr.offset(off, off);
        c.drawRoundRect(dr, radius, radius, dShadow);

        // Light highlight top-left.
        Paint lShadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        lShadow.setColor(withAlpha(0xFFFFFFFF, dark ? 18 : 215));
        lShadow.setMaskFilter(new BlurMaskFilter(9 * d, BlurMaskFilter.Blur.NORMAL));
        RectF lr = new RectF(panel);
        lr.offset(-off, -off);
        c.drawRoundRect(lr, radius, radius, lShadow);

        // The raised panel itself (same family as the base, faint palette tint).
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(panel.left, panel.top, panel.right, panel.bottom,
            blend(base, 0xFFFFFFFF, dark ? 0.04f : 0.5f), blend(base, primary, 0.05f), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, fill);
    }

    // ----- Claymorphism: puffy pastel card with a soft drop shadow and inner top lip -----
    private static void drawClay(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        int base = dark ? blend(0xFF2A3040, primary, 0.05f) : blend(0xFFFFFFFF, primary, 0.05f);
        float radius = 26 * d;
        float inset = 8 * d;
        RectF panel = new RectF(inset, inset, w - inset, h - inset);

        // Soft drop shadow below.
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(dark ? withAlpha(0xFF000000, 110) : withAlpha(blend(0xFF2A2438, primary, 0.3f), 60));
        shadow.setMaskFilter(new BlurMaskFilter(14 * d, BlurMaskFilter.Blur.NORMAL));
        RectF sr = new RectF(panel);
        sr.offset(0, 8 * d);
        c.drawRoundRect(sr, radius, radius, shadow);

        // Base fill.
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(base);
        c.drawRoundRect(panel, radius, radius, fill);

        // Pastel candy wash (radial gradients in the top corners).
        Paint wash1 = new Paint(Paint.ANTI_ALIAS_FLAG);
        wash1.setShader(new RadialGradient(panel.left + w * 0.1f, panel.top, w * 0.55f,
            withAlpha(primary, dark ? 60 : 64), withAlpha(primary, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, wash1);
        Paint wash2 = new Paint(Paint.ANTI_ALIAS_FLAG);
        wash2.setShader(new RadialGradient(panel.right - w * 0.08f, panel.top + h * 0.12f, w * 0.5f,
            withAlpha(glow, dark ? 50 : 54), withAlpha(glow, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, wash2);

        // Inner top highlight lip.
        Paint lip = new Paint(Paint.ANTI_ALIAS_FLAG);
        lip.setShader(new LinearGradient(0, panel.top, 0, panel.top + h * 0.4f,
            withAlpha(0xFFFFFFFF, dark ? 28 : 150), withAlpha(0xFFFFFFFF, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, lip);
    }

    // ----- NeoBrutalism: flat card, thick ink border, hard offset shadow, palette top bar -----
    private static void drawNeobrutalism(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        int ink = dark ? 0xFF000000 : 0xFF1A1F2B;
        int base = dark ? blend(0xFF232A3A, primary, 0.05f) : 0xFFFFFFFF;
        float off = 6 * d;
        float bw = 3 * d;

        RectF panel = new RectF(bw, bw, w - off - bw, h - off - bw);

        // Hard offset shadow (no blur).
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(dark ? withAlpha(0xFF000000, 150) : ink);
        RectF sr = new RectF(panel);
        sr.offset(off, off);
        c.drawRect(sr, shadow);

        // Card fill.
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(base);
        c.drawRect(panel, fill);

        // Palette top bar (bold block accent).
        Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
        bar.setShader(new LinearGradient(panel.left, 0, panel.right, 0, primary, glow, Shader.TileMode.CLAMP));
        c.drawRect(panel.left, panel.top, panel.right, panel.top + 7 * d, bar);

        // Thick ink border.
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(bw);
        border.setColor(dark ? withAlpha(0xFFFFFFFF, 220) : ink);
        c.drawRect(panel, border);
    }

    // ----- helpers -----
    private static int blend(int c1, int c2, float t) {
        t = Math.max(0f, Math.min(1f, t));
        int a = Math.round(Color.alpha(c1) + (Color.alpha(c2) - Color.alpha(c1)) * t);
        int r = Math.round(Color.red(c1) + (Color.red(c2) - Color.red(c1)) * t);
        int g = Math.round(Color.green(c1) + (Color.green(c2) - Color.green(c1)) * t);
        int b = Math.round(Color.blue(c1) + (Color.blue(c2) - Color.blue(c1)) * t);
        return Color.argb(a, r, g, b);
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(Math.max(0, Math.min(255, alpha)), Color.red(color), Color.green(color), Color.blue(color));
    }
}
