#!/usr/bin/env node

/**
 * Icon Generator for Spenza PWA
 * 
 * This script generates PWA icons in various sizes from the Spenza logo SVG.
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

// Icon sizes required for PWA
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

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

  console.log('\n✨ Icon generation complete!');
}

generateIcons().catch(error => {
  console.error('❌ Error generating icons:', error);
  process.exit(1);
});
