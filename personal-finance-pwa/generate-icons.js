#!/usr/bin/env node

/**
 * Icon Generator for Spenza PWA
 * 
 * This script generates PWA and Android launcher icons from the Spenza logo SVG.
 * 
 * Prerequisites:
 * npm install sharp --save-dev
 * 
 * Usage:
 * node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is installed
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('❌ Error: sharp is not installed.');
  console.error('Please install it by running: npm install sharp --save-dev');
  process.exit(1);
}

const LOGO_PATH = path.join(__dirname, 'src/assets/logo/spenza-logo.svg');
const ICONS_DIR = path.join(__dirname, 'public/icons');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ANDROID_RES_DIR = path.join(__dirname, 'android/app/src/main/res');

// Icon sizes required for PWA
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const ANDROID_ICON_SIZES = [
  { density: 'mdpi', size: 48 },
  { density: 'hdpi', size: 72 },
  { density: 'xhdpi', size: 96 },
  { density: 'xxhdpi', size: 144 },
  { density: 'xxxhdpi', size: 192 },
];
const BRAND_BACKGROUND = '#6d28d9';

async function generateIcons() {
  console.log('🎨 Generating Spenza PWA icons...\n');

  // Ensure icons directory exists
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  // Read the SVG file
  const svgBuffer = fs.readFileSync(LOGO_PATH);

  // Generate each icon size
  for (const size of ICON_SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    
    try {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Failed to generate icon-${size}x${size}.png:`, error.message);
    }
  }

  // Generate favicon.ico (32x32)
  const faviconPath = path.join(PUBLIC_DIR, 'favicon.ico');
  try {
    await sharp(svgBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(faviconPath.replace('.ico', '.png'));
    
    // Rename to .ico (browsers accept PNG as .ico)
    fs.renameSync(faviconPath.replace('.ico', '.png'), faviconPath);
    console.log(`✅ Generated: favicon.ico`);
  } catch (error) {
    console.error(`❌ Failed to generate favicon.ico:`, error.message);
  }

  // Generate apple-touch-icon (180x180)
  const appleTouchIconPath = path.join(PUBLIC_DIR, 'apple-touch-icon.png');
  try {
    await sharp(svgBuffer)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(appleTouchIconPath);
    
    console.log(`✅ Generated: apple-touch-icon.png`);
  } catch (error) {
    console.error(`❌ Failed to generate apple-touch-icon.png:`, error.message);
  }

  // Generate Android launcher icons
  for (const { density, size } of ANDROID_ICON_SIZES) {
    const mipmapDir = path.join(ANDROID_RES_DIR, `mipmap-${density}`);

    if (!fs.existsSync(mipmapDir)) {
      fs.mkdirSync(mipmapDir, { recursive: true });
    }

    try {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(mipmapDir, 'ic_launcher.png'));

      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(mipmapDir, 'ic_launcher_round.png'));

      await sharp(svgBuffer)
        .resize(Math.round(size * 0.72), Math.round(size * 0.72), {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extend({
          top: Math.floor(size * 0.14),
          bottom: size - Math.round(size * 0.72) - Math.floor(size * 0.14),
          left: Math.floor(size * 0.14),
          right: size - Math.round(size * 0.72) - Math.floor(size * 0.14),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(mipmapDir, 'ic_launcher_foreground.png'));

      console.log(`✅ Generated Android launcher icons for ${density}`);
    } catch (error) {
      console.error(`❌ Failed to generate Android launcher icons for ${density}:`, error.message);
    }
  }

  // Keep adaptive icon background aligned with the Spenza brand.
  const backgroundXmlPath = path.join(ANDROID_RES_DIR, 'values/ic_launcher_background.xml');
  if (fs.existsSync(backgroundXmlPath)) {
    fs.writeFileSync(
      backgroundXmlPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND_BACKGROUND}</color>\n</resources>\n`
    );
    console.log(`✅ Updated Android adaptive icon background`);
  }

  console.log('\n✨ Icon generation complete!');
}

generateIcons().catch(error => {
  console.error('❌ Error generating icons:', error);
  process.exit(1);
});
