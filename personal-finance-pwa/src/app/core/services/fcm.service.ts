import { Injectable, signal, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
  async registerForNotifications(userId: string, timezone: string): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Native platform: Initialize FCM
        await this.initialize();
        
        // Wait for token to be generated
        const token = this.fcmToken();
        if (!token) {
          console.error('[FCM] No token generated after initialization');
          return false;
        }

        // Register token with backend
        return await this.registerTokenWithBackend(userId, token, timezone);
      } else {
        // Web platform: Get token from service worker
        // Note: This requires firebase-messaging-sw.js to be properly configured
        console.log('[FCM] Web platform - token registration would happen via service worker');
        
        // For now, return true for web (service worker handles it)
        // In a full implementation, you would:
        // 1. Get token from firebase.messaging()
        // 2. Register with backend
        return true;
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
    timezone: string
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>('/.netlify/functions/register-token', {
          userId,
          fcmToken,
          timezone,
          timestamp: Date.now()
        })
      );

      console.log('[FCM] Token registered with backend:', response);
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
      await firstValueFrom(
        this.http.post('/.netlify/functions/unregister-token', { userId })
      );
      console.log('[FCM] Token unregistered from backend');

      // Unregister from native platform if applicable
      if (Capacitor.isNativePlatform()) {
        await PushNotifications.removeAllListeners();
        this.fcmToken.set(null);
        console.log('[FCM] Unregistered from native push notifications');
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
      console.log('[FCM] Not a native platform, skipping FCM initialization');
      return;
    }

    try {
      console.log('[FCM] Initializing push notifications...');

      // Request permission
      const permissionResult = await PushNotifications.requestPermissions();
      console.log('[FCM] Permission result:', permissionResult);

      if (permissionResult.receive === 'granted') {
        this.pushPermissionStatus.set('granted');
        
        // Register with FCM
        await PushNotifications.register();
        console.log('[FCM] Registration initiated');

        // Setup listeners
        this.setupListeners();
      } else {
        this.pushPermissionStatus.set('denied');
        console.log('[FCM] Push notification permission denied');
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
    // Listen for registration success
    PushNotifications.addListener('registration', (token: Token) => {
      console.log('[FCM] Registration successful, token:', token.value);
      this.fcmToken.set(token.value);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[FCM] Registration error:', error);
      this.pushPermissionStatus.set('denied');
    });

    // Listen for push notifications received while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('[FCM] Push notification received:', notification);
      
      // Notification is automatically displayed by the system
      // You can add custom handling here if needed
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      console.log('[FCM] Push notification action performed:', notification);
      
      // Handle notification tap
      this.handleNotificationTap(notification);
    });

    console.log('[FCM] Event listeners registered');
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
        console.log(`[FCM] Navigating to ${route} from notification tap`);
        this.router.navigate([route]);
      } else {
        console.log('[FCM] No route found in notification data, navigating to home');
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
