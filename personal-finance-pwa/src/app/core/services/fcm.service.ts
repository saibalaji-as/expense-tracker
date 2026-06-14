import { Injectable, signal, inject, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseConfig } from '../config/firebase.config';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface PushReminderPreferences {
  dailyReminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
}

/**
 * FCM Service
 * 
 * Manages Firebase Cloud Messaging (FCM) push notifications for both web and native platforms.
 * This service handles:
 * - Push notification registration
 * - FCM token management
 * - Backend token registration (for web push)
 * - Notification reception and display
 * - Notification tap handling
 * 
 * Platform Support:
 * - Web: Registers token with backend for scheduled notifications
 * - Android/iOS: Uses Capacitor Push Notifications plugin
 */
@Injectable({ providedIn: 'root' })
export class FcmService {
  /**
   * Signal tracking the FCM registration token
   */
  readonly fcmToken = signal<string | null>(null);

  /**
   * Signal tracking push notification permission status
   */
  readonly pushPermissionStatus = signal<'granted' | 'denied' | 'prompt'>('prompt');

  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private listenersSetup = false;

  /** Auth headers for Firebase Functions calls — the backend requires a Firebase ID token. */
  private async authHeaders(): Promise<Record<string, string>> {
    const idToken = await this.authService.getFirebaseIdToken();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  }

  /**
   * Register for notifications and store token in backend
   * 
   * This method handles both web and native platforms:
   * - Web: Gets token from service worker and registers with backend
   * - Native: Initializes Capacitor plugin and registers with backend
   * 
   * @param userId - Unique user identifier
   * @param timezone - User's timezone (e.g., "America/New_York")
   * @returns Promise<boolean> - true if registration successful
   */
  async registerForNotifications(
    userId: string,
    timezone: string,
    reminderPreferences?: PushReminderPreferences,
    options?: { tokenOnly?: boolean }
  ): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const token = await this.registerNativeAndGetToken();
        return await this.registerTokenWithBackend(userId, token, timezone, reminderPreferences, options);
      } else {
        const token = await this.registerWebAndGetToken();
        return await this.registerTokenWithBackend(userId, token, timezone, reminderPreferences, options);
      }
    } catch (error) {
      console.error('[FCM] Failed to register for notifications:', error);
      return false;
    }
  }

  /**
   * Register FCM token with backend
   * 
   * @param userId - Unique user identifier
   * @param fcmToken - FCM registration token
   * @param timezone - User's timezone
   * @returns Promise<boolean> - true if registration successful
   */
  private async registerTokenWithBackend(
    userId: string,
    fcmToken: string,
    timezone: string,
    reminderPreferences?: PushReminderPreferences,
    options?: { tokenOnly?: boolean }
  ): Promise<boolean> {
    try {
      const endpoint = this.functionsEndpoint('registerToken');
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(endpoint, {
          userId,
          fcmToken,
          timezone,
          platform: Capacitor.isNativePlatform() ? 'native' : 'web',
          ...(options?.tokenOnly ? { tokenOnly: true } : {}),
          ...reminderPreferences,
          timestamp: Date.now()
        }, { headers: await this.authHeaders() })
      );

      if (isDevMode()) { console.log('[FCM] Token registered with backend:', response); }
      return response.success;
    } catch (error) {
      console.error('[FCM] Failed to register token with backend:', error);
      return false;
    }
  }

  /**
   * Unregister from notifications and remove token from backend
   * 
   * @param userId - Unique user identifier
   * @returns Promise<void>
   */
  async unregister(userId: string): Promise<void> {
    try {
      // Unregister from backend
      const endpoint = this.functionsEndpoint('unregisterToken');
      await firstValueFrom(
        this.http.post(endpoint, { userId }, { headers: await this.authHeaders() })
      );
      if (isDevMode()) { console.log('[FCM] Token unregistered from backend'); }

      // Unregister from native platform if applicable
      if (Capacitor.isNativePlatform()) {
        await PushNotifications.removeAllListeners();
        this.fcmToken.set(null);
        if (isDevMode()) { console.log('[FCM] Unregistered from native push notifications'); }
      }
    } catch (error) {
      console.error('[FCM] Failed to unregister:', error);
    }
  }

  /**
   * Initialize FCM push notifications (Native platforms only)
   * 
   * This method should be called when the user explicitly enables push notifications
   * in the Settings page, NOT during app startup to avoid blocking the app.
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Only initialize on native platforms
    if (!Capacitor.isNativePlatform()) {
      if (isDevMode()) { console.log('[FCM] Not a native platform, skipping FCM initialization'); }
      return;
    }

    try {
      if (isDevMode()) { console.log('[FCM] Initializing push notifications...'); }

      // Request permission
      const permissionResult = await PushNotifications.requestPermissions();
      if (isDevMode()) { console.log('[FCM] Permission result:', permissionResult); }

      if (permissionResult.receive === 'granted') {
        this.pushPermissionStatus.set('granted');

        this.setupListeners();

        // Register with FCM
        await PushNotifications.register();
        if (isDevMode()) { console.log('[FCM] Registration initiated'); }
      } else {
        this.pushPermissionStatus.set('denied');
        if (isDevMode()) { console.log('[FCM] Push notification permission denied'); }
      }
    } catch (error) {
      console.error('[FCM] Failed to initialize push notifications:', error);
      this.pushPermissionStatus.set('denied');
    }
  }

  /**
   * Check current push notification permission status
   * 
   * @returns Promise resolving to the current permission status
   */
  async checkPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!Capacitor.isNativePlatform()) {
      return 'denied';
    }

    try {
      const result = await PushNotifications.checkPermissions();
      const status = result.receive === 'granted' ? 'granted' : 
                    result.receive === 'denied' ? 'denied' : 'prompt';
      this.pushPermissionStatus.set(status);
      return status;
    } catch (error) {
      console.error('[FCM] Failed to check permission status:', error);
      return 'denied';
    }
  }

  /**
   * Setup FCM event listeners (Native platforms only)
   */
  private setupListeners(): void {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    // Listen for registration success
    PushNotifications.addListener('registration', (token: Token) => {
      if (isDevMode()) { console.log('[FCM] Registration successful, token:', token.value); }
      this.fcmToken.set(token.value);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[FCM] Registration error:', error);
      this.pushPermissionStatus.set('denied');
    });

    // Listen for push notifications received while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      if (isDevMode()) { console.log('[FCM] Push notification received:', notification); }
      
      // Notification is automatically displayed by the system
      // You can add custom handling here if needed
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      if (isDevMode()) { console.log('[FCM] Push notification action performed:', notification); }
      
      // Handle notification tap
      this.handleNotificationTap(notification);
    });

    if (isDevMode()) { console.log('[FCM] Event listeners registered'); }
  }

  private functionsEndpoint(name: string): string {
    const base = environment.firebaseFunctionsUrl;
    return `${base.replace(/\/$/, '')}/${name}`;
  }

  private async registerNativeAndGetToken(): Promise<string> {
    if (isDevMode()) { console.log('[FCM] Registering native push notifications...'); }

    const permissionResult = await PushNotifications.requestPermissions();
    if (isDevMode()) { console.log('[FCM] Permission result:', permissionResult); }

    if (permissionResult.receive !== 'granted') {
      this.pushPermissionStatus.set('denied');
      throw new Error('Push notification permission denied.');
    }

    this.pushPermissionStatus.set('granted');

    const tokenPromise = new Promise<string>((resolve, reject) => {
      let settled = false;
      let registrationListener: { remove: () => Promise<void> } | null = null;
      let errorListener: { remove: () => Promise<void> } | null = null;

      const cleanup = () => {
        void registrationListener?.remove();
        void errorListener?.remove();
      };

      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Timed out waiting for native FCM token.'));
      }, 10000);

      void PushNotifications.addListener('registration', (token: Token) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();
        if (isDevMode()) { console.log('[FCM] Registration successful, token:', token.value); }
        this.fcmToken.set(token.value);
        resolve(token.value);
      }).then((handle) => {
        registrationListener = handle;
      });

      void PushNotifications.addListener('registrationError', (error: any) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();
        this.pushPermissionStatus.set('denied');
        reject(error instanceof Error ? error : new Error(String(error)));
      }).then((handle) => {
        errorListener = handle;
      });
    });

    await PushNotifications.register();
    if (isDevMode()) { console.log('[FCM] Native registration initiated'); }

    this.setupListeners();
    return tokenPromise;
  }

  private async registerWebAndGetToken(): Promise<string> {
    if (isDevMode()) { console.log('[FCM] Registering web push notifications...'); }

    if (!(await isSupported())) {
      throw new Error('Firebase Messaging is not supported in this browser.');
    }

    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported in this browser.');
    }

    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Web push notification permission denied.');
      }
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      throw new Error('Firebase did not return a web push token.');
    }

    this.fcmToken.set(token);
    this.pushPermissionStatus.set('granted');
    if (isDevMode()) { console.log('[FCM] Web registration successful, token:', token); }

    return token;
  }

  /**
   * Handle notification tap
   * 
   * @param notification - The notification action data
   */
  private handleNotificationTap(notification: ActionPerformed): void {
    try {
      // Extract route from notification data
      const data = notification.notification.data;
      const route = data?.route;

      if (route) {
        if (isDevMode()) { console.log(`[FCM] Navigating to ${route} from notification tap`); }
        this.router.navigate([route]);
      } else {
        if (isDevMode()) { console.log('[FCM] No route found in notification data, navigating to home'); }
        this.router.navigate(['/']);
      }
    } catch (error) {
      console.error('[FCM] Error handling notification tap:', error);
    }
  }

  /**
   * Get the current FCM token
   * 
   * @returns The current FCM token or null if not registered
   */
  getToken(): string | null {
    return this.fcmToken();
  }

  /**
   * Get the current permission status
   * 
   * @returns The current permission status signal
   */
  getPermissionStatus() {
    return this.pushPermissionStatus;
  }
}
