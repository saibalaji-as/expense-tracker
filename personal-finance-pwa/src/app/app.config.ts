import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
  APP_INITIALIZER,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withViewTransitions,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import type { RouterFeatures } from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { LocalNotificationService } from './core/services/local-notification.service';
import { ThemeService } from './core/services/theme.service';

// PERF: the View Transitions API snapshots the ENTIRE page (including the
// frosted-glass blur layers) and freezes that snapshot until the next route's
// component has fully resolved its async guards AND rendered. On Android WebView
// that capture-and-hold is expensive and, worse, it visually freezes the UI for
// the whole navigation — which is exactly the "screen takes 2s to change" feel.
// Native gets NO view transitions (instant swap); the web keeps the crossfade,
// where the snapshot is cheap and desirable.
const routerFeatures: RouterFeatures[] = [
  withComponentInputBinding(),
  withHashLocation(),
  // PreloadAllModules: after first paint, lazy route chunks are fetched/parsed
  // in the background (idle) instead of on first tap. Removes the JS-parse stall
  // on first navigation to each screen.
  withPreloading(PreloadAllModules),
];
if (!Capacitor.isNativePlatform()) {
  routerFeatures.push(withViewTransitions());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, ...routerFeatures),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: (localNotificationService: LocalNotificationService) => {
        // Fire-and-forget: notification permission checks must NOT block first
        // paint (startup budget < 500 ms). initialize() handles its own errors.
        return () => {
          void localNotificationService.initialize();
        };
      },
      deps: [LocalNotificationService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (_themeService: ThemeService) => {
        // Eagerly instantiate ThemeService so it reads palette/style/theme from
        // storage and applies them to the DOM before first paint. Without this,
        // the service is lazily created only when the Settings route is visited,
        // leaving the app on default colours until then.
        return () => {};
      },
      deps: [ThemeService],
      multi: true,
    },
  ],
};
