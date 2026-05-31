import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spenza.app',
  appName: 'Spenza',
  webDir: 'dist/personal-finance-pwa/browser',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Set to true only for debugging
    backgroundColor: '#ffffff',
    // Enable smooth scrolling
    overScrollMode: 'never',
    // Improve touch responsiveness
    scrollbarStyle: 'outsideOverlay',
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },
  },
};

// Native Google sign-in uses the Web OAuth client ID from AuthService.
// Google Cloud must also have an Android OAuth client for com.spenza.app
// whose SHA-1 matches the exact APK signing certificate.

export default config;
