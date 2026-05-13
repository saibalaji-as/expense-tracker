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

// Google OAuth Client IDs (for reference — used in auth.service.ts initialize call)
// Web Client ID:     335358015393-9jek528175b4030m56oro1si8vknvlvu.apps.googleusercontent.com
// Android Client ID: 335358015393-vp8s227vqliul2vseqo7t6i1brgas95v.apps.googleusercontent.com

export default config;
