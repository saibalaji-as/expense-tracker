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

    // ----- Glass: frosted translucent white panel over the wallpaper (reference:
    // white frosted card, subtle sheen, bright hairline; wallpaper bleeds through) -----
    private static void drawGlass(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        float radius = 24 * d;
        float inset = 3 * d;
        RectF panel = new RectF(inset, inset, w - inset, h - inset);

        int base = dark ? 0xFF1E2436 : 0xFFFFFFFF;
        // Very soft palette glow behind the panel edges.
        Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        glowPaint.setColor(withAlpha(primary, dark ? 55 : 40));
        glowPaint.setMaskFilter(new BlurMaskFilter(16 * d, BlurMaskFilter.Blur.NORMAL));
        c.drawRoundRect(panel, radius, radius, glowPaint);

        // Frosted white fill: mostly-white translucency, only a whisper of palette
        // tint — kept translucent enough that the wallpaper clearly bleeds through.
        int topColor = withAlpha(base, dark ? 188 : 176);
        int bottomColor = withAlpha(blend(base, primary, dark ? 0.12f : 0.05f), dark ? 174 : 150);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(0, panel.top, 0, panel.bottom,
            topColor, bottomColor, Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, fill);

        // Top sheen highlight.
        Paint sheen = new Paint(Paint.ANTI_ALIAS_FLAG);
        sheen.setShader(new LinearGradient(0, panel.top, 0, panel.top + h * 0.45f,
            withAlpha(0xFFFFFFFF, dark ? 30 : 105), withAlpha(0xFFFFFFFF, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, sheen);

        // Bright white hairline border (the frosted-edge look).
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(Math.max(1f, 1.2f * d));
        border.setColor(withAlpha(0xFFFFFFFF, dark ? 70 : 215));
        c.drawRoundRect(panel, radius, radius, border);
    }

    // ----- Neumorphism: panel extruded from a single same-colored surface (reference:
    // card color == background color; only the dual soft shadows separate them) -----
    private static void drawNeumorphism(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        int base = blend(dark ? 0xFF2A3142 : 0xFFECEFF5, primary, 0.04f);
        float radius = 24 * d;
        // Rounded surface fill (covers full bounds; keeps outer corners rounded on all APIs).
        Paint surface = new Paint(Paint.ANTI_ALIAS_FLAG);
        surface.setColor(base);
        c.drawRoundRect(new RectF(0, 0, w, h), radius, radius, surface);

        float inset = 12 * d;
        RectF panel = new RectF(inset, inset, w - inset, h - inset);
        float off = 6 * d;

        // Dark shadow bottom-right.
        Paint dShadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        dShadow.setColor(dark ? withAlpha(0xFF000000, 130) : withAlpha(blend(0xFF9BA6C0, primary, 0.15f), 165));
        dShadow.setMaskFilter(new BlurMaskFilter(12 * d, BlurMaskFilter.Blur.NORMAL));
        RectF dr = new RectF(panel);
        dr.offset(off, off);
        c.drawRoundRect(dr, radius, radius, dShadow);

        // Light highlight top-left.
        Paint lShadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        lShadow.setColor(withAlpha(0xFFFFFFFF, dark ? 20 : 235));
        lShadow.setMaskFilter(new BlurMaskFilter(12 * d, BlurMaskFilter.Blur.NORMAL));
        RectF lr = new RectF(panel);
        lr.offset(-off, -off);
        c.drawRoundRect(lr, radius, radius, lShadow);

        // The raised panel: the SAME base color as the surface (that's what makes
        // it read as extruded), with only a barely-there light-source gradient.
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new LinearGradient(panel.left, panel.top, panel.right, panel.bottom,
            blend(base, 0xFFFFFFFF, dark ? 0.03f : 0.07f), base, Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, fill);
    }

    // ----- Claymorphism: puffy pastel card with a soft drop shadow and inner top lip -----
    private static void drawClay(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        // Reference: near-white pillowy card, big radius, one soft drop shadow below,
        // faint inner top lip; pastel color lives in the chips, not the card.
        int base = dark ? blend(0xFF2A3040, primary, 0.04f) : blend(0xFFFFFFFF, primary, 0.025f);
        float radius = 28 * d;
        float inset = 8 * d;
        RectF panel = new RectF(inset, inset, w - inset, h - inset);

        // Soft drop shadow below.
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(dark ? withAlpha(0xFF000000, 115) : withAlpha(blend(0xFF3A3452, primary, 0.3f), 55));
        shadow.setMaskFilter(new BlurMaskFilter(18 * d, BlurMaskFilter.Blur.NORMAL));
        RectF sr = new RectF(panel);
        sr.offset(0, 9 * d);
        c.drawRoundRect(sr, radius, radius, shadow);

        // Base fill.
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(base);
        c.drawRoundRect(panel, radius, radius, fill);

        // Whisper of pastel wash in the top corners (kept subtle per the reference).
        Paint wash1 = new Paint(Paint.ANTI_ALIAS_FLAG);
        wash1.setShader(new RadialGradient(panel.left + w * 0.1f, panel.top, w * 0.55f,
            withAlpha(primary, dark ? 40 : 26), withAlpha(primary, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, wash1);
        Paint wash2 = new Paint(Paint.ANTI_ALIAS_FLAG);
        wash2.setShader(new RadialGradient(panel.right - w * 0.08f, panel.top + h * 0.12f, w * 0.5f,
            withAlpha(glow, dark ? 34 : 20), withAlpha(glow, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, wash2);

        // Inner top highlight lip.
        Paint lip = new Paint(Paint.ANTI_ALIAS_FLAG);
        lip.setShader(new LinearGradient(0, panel.top, 0, panel.top + h * 0.4f,
            withAlpha(0xFFFFFFFF, dark ? 26 : 125), withAlpha(0xFFFFFFFF, 0), Shader.TileMode.CLAMP));
        c.drawRoundRect(panel, radius, radius, lip);
    }

    // ----- NeoBrutalism: cream rounded card, thick ink border, hard un-blurred
    // offset shadow (reference: no accent bar, corners gently rounded) -----
    private static void drawNeobrutalism(Canvas c, int primary, int glow, boolean dark, int w, int h, float d) {
        int ink = 0xFF111420;
        int base = dark ? blend(0xFF232A3A, primary, 0.04f) : blend(0xFFFDF6EA, primary, 0.02f);
        float off = 6 * d;
        float bw = 3 * d;
        float radius = 14 * d;

        RectF panel = new RectF(bw, bw, w - off - bw, h - off - bw);

        // Hard offset shadow (no blur).
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(dark ? withAlpha(0xFF000000, 190) : ink);
        RectF sr = new RectF(panel);
        sr.offset(off, off);
        c.drawRoundRect(sr, radius, radius, shadow);

        // Card fill.
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(base);
        c.drawRoundRect(panel, radius, radius, fill);

        // Thick ink border (light ink in dark mode for contrast).
        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(bw);
        border.setColor(dark ? 0xFFE8EDF5 : ink);
        c.drawRoundRect(panel, radius, radius, border);
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
