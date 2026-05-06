# Spenza Logo Usage Guide

## Logo Files

### Source Logo
- **Location**: `src/assets/logo/spenza-logo.svg`
- **Format**: SVG (Scalable Vector Graphics)
- **Dimensions**: 512x512 viewBox
- **Usage**: Source file for all icon generation

### Public Logo
- **Location**: `public/spenza-logo.svg`
- **URL**: `/spenza-logo.svg` (served at root)
- **Usage**: Used in app headers (desktop and mobile)

## Generated Icons

### PWA Icons (PNG)
All icons are generated from the source SVG and located in `public/icons/`:

| Size | File | Usage |
|------|------|-------|
| 72x72 | `icon-72x72.png` | Small devices, notifications |
| 96x96 | `icon-96x96.png` | Standard mobile |
| 128x128 | `icon-128x128.png` | High-res mobile |
| 144x144 | `icon-144x144.png` | Windows tiles |
| 152x152 | `icon-152x152.png` | iPad |
| 192x192 | `icon-192x192.png` | Android home screen |
| 384x384 | `icon-384x384.png` | High-res Android |
| 512x512 | `icon-512x512.png` | Splash screens, high-res displays |

### Special Icons
- **Favicon**: `public/favicon.ico` (32x32) - Browser tab icon
- **Apple Touch Icon**: `public/apple-touch-icon.png` (180x180) - iOS home screen

## Logo Display in Application

### 1. Desktop Header
```html
<img src="/spenza-logo.svg" alt="Spenza Logo" class="h-9 w-9 object-contain" />
```
- Size: 36x36 pixels (h-9 w-9)
- Location: Top navigation bar, left side
- Accompanies text: "Spenza"
- Path: `/spenza-logo.svg` (served from public directory)

### 2. Mobile Header
```html
<img src="/spenza-logo.svg" alt="Spenza Logo" class="h-8 w-8 object-contain" />
```
- Size: 32x32 pixels (h-8 w-8)
- Location: Top bar, left side
- Accompanies text: "Spenza"
- Path: `/spenza-logo.svg` (served from public directory)

### 3. Browser Tab
- Uses: `favicon.ico`
- Automatically loaded by browsers
- Size: 32x32 pixels

### 4. PWA Installation
- Uses: Icons from `manifest.webmanifest`
- Sizes: 72x72 to 512x512 (responsive)
- Purpose: Home screen icon, splash screen

### 5. iOS Devices
- Uses: `apple-touch-icon.png`
- Size: 180x180 pixels
- Purpose: iOS home screen icon

## Logo Design Specifications

### Colors
```css
/* Primary Gradient */
--gradient-start: #6d28d9;  /* Purple 700 */
--gradient-mid: #7c3aed;    /* Purple 600 */
--gradient-end: #0ea5e9;    /* Sky 500 */

/* Accent Colors */
--accent-purple: #a78bfa;   /* Purple 400 */
--accent-cyan: #38bdf8;     /* Sky 400 */
--accent-light: #7dd3fc;    /* Sky 300 */
```

### Design Elements
1. **Squircle Background**: Rounded rectangle (rx=110, ry=110) with gradient
2. **Rupee Symbol (₹)**: Central element in Georgia serif font
3. **Trend Line**: Upward-moving polyline representing growth
4. **Glow Effects**: Multiple bloom filters for depth
5. **Rim**: Subtle gradient border for definition

### Typography
- **Font**: Georgia, serif (for ₹ symbol)
- **Weight**: 900 (Black)
- **Size**: 232px (scaled to viewBox)

## Regenerating Icons

If you need to update the logo and regenerate all icons:

### Step 1: Update Source Logo
Edit `src/assets/logo/spenza-logo.svg` with your changes.

### Step 2: Run Icon Generator
```bash
cd personal-finance-pwa
npm run generate-icons
```

### Step 3: Verify Output
Check that all icons in `public/icons/` and `public/` are updated:
- favicon.ico
- apple-touch-icon.png
- icon-*.png files

### Step 4: Test Build
```bash
npm run build
```

Verify icons appear in `dist/personal-finance-pwa/browser/`.

## Best Practices

### Logo Usage
- ✅ Always use SVG for in-app display (scalable, crisp)
- ✅ Use PNG icons for PWA manifest (browser compatibility)
- ✅ Maintain aspect ratio (1:1 square)
- ✅ Use `object-contain` for proper scaling

### Accessibility
- ✅ Always include descriptive `alt` text
- ✅ Use semantic HTML (`<img>` with proper attributes)
- ✅ Ensure sufficient contrast in all themes

### Performance
- ✅ SVG is optimized (4.4 KB)
- ✅ PNG icons use appropriate compression
- ✅ Icons are cached by service worker (PWA)

## Troubleshooting

### Logo Not Displaying
1. **Clear browser cache**: Hard refresh with Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
2. **Restart dev server**: Stop and restart `npm start`
3. **Check file exists**: Verify `public/spenza-logo.svg` exists
4. **Check path**: Logo should be referenced as `/spenza-logo.svg` (with leading slash)
5. **Check console**: Open browser DevTools and look for 404 errors

### Icons Not Updating
1. Run `npm run generate-icons` after logo changes
2. Clear service worker cache
3. Rebuild application: `npm run build`

### PWA Icon Issues
1. Verify `manifest.webmanifest` references correct icon paths
2. Check that all icon sizes are generated
3. Test PWA installation on actual device

## File Locations Summary

```
personal-finance-pwa/
├── src/
│   └── assets/
│       └── logo/
│           └── spenza-logo.svg          # Source logo
├── public/
│   ├── logo/
│   │   └── spenza-logo.svg              # Public logo copy
│   ├── icons/
│   │   ├── icon-72x72.png
│   │   ├── icon-96x96.png
│   │   ├── icon-128x128.png
│   │   ├── icon-144x144.png
│   │   ├── icon-152x152.png
│   │   ├── icon-192x192.png
│   │   ├── icon-384x384.png
│   │   └── icon-512x512.png
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   └── manifest.webmanifest
└── generate-icons.js                    # Icon generator script
```
