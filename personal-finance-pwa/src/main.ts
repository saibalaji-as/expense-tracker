import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// PERF: tag the document as native so CSS can drop GPU-expensive effects
// (backdrop-filter blur, etc.) that the Android WebView cannot render cheaply.
// Set before bootstrap so the very first paint already uses the cheap path.
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('platform-native');
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
