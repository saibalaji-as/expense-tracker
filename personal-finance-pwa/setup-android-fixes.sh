#!/bin/bash

# Android Issues Fix - Setup Script
# This script installs required packages and syncs with Android

echo "========================================="
echo "Android Issues Fix - Setup Script"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📦 Installing required Capacitor plugins..."
echo ""

# Install Push Notifications plugin
echo "Installing @capacitor/push-notifications..."
npm install @capacitor/push-notifications

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "✅ @capacitor/push-notifications installed successfully"
else
    echo "❌ Failed to install @capacitor/push-notifications"
    exit 1
fi

echo ""
echo "🔄 Syncing Capacitor with Android..."
npx cap sync android

if [ $? -eq 0 ]; then
    echo "✅ Capacitor sync completed successfully"
else
    echo "❌ Failed to sync Capacitor"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Setup completed successfully!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Add google-services.json to android/app/ directory"
echo "   - Download from Firebase Console"
echo "   - Place in: android/app/google-services.json"
echo ""
echo "2. Build and test the Android app:"
echo "   npx cap run android"
echo ""
echo "3. Or build APK for testing:"
echo "   cd android"
echo "   ./gradlew assembleDebug"
echo ""
echo "For detailed instructions, see ANDROID_ISSUES_FIX.md"
echo ""
