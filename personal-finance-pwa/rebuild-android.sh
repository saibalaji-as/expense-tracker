#!/bin/bash

# Android Rebuild Script
# Rebuilds the Android app with all fixes applied

echo "========================================="
echo "Android App Rebuild Script"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📦 Step 1: Building Angular app..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Angular build completed"
else
    echo "❌ Angular build failed"
    exit 1
fi

echo ""
echo "📦 Step 2: Syncing Capacitor with Android..."
npx cap sync android

if [ $? -eq 0 ]; then
    echo "✅ Capacitor sync completed"
else
    echo "❌ Capacitor sync failed"
    exit 1
fi

echo ""
echo "🧹 Step 3: Cleaning Android build..."
cd android
./gradlew clean

if [ $? -eq 0 ]; then
    echo "✅ Clean completed"
else
    echo "❌ Clean failed"
    exit 1
fi

echo ""
echo "🔨 Step 4: Building debug APK..."
./gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo ""
    echo "========================================="
    echo "✅ Build Complete!"
    echo "========================================="
    echo ""
    echo "APK Location:"
    echo "  android/app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "To install on connected device:"
    echo "  adb install app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "Or run directly:"
    echo "  cd .."
    echo "  npx cap run android"
    echo ""
else
    echo "❌ Build failed"
    echo ""
    echo "To view errors:"
    echo "  ./gradlew assembleDebug --stacktrace"
    exit 1
fi
