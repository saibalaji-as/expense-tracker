import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { firebaseConfig } from '../config/firebase.config';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FcmService {
  private messaging: Messaging | null = null;
  // On native (Android/iOS), use the absolute Netlify URL from environment config.
  // On web, use the relative path so local dev and Netlify deployment both work.
  private readonly API_BASE = Capacitor.isNativePlatform()
    ? environment.netlifyFunctionsUrl
    : '/.netlify/functions';

  constructor() {
    // Only initialize in browser environment
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const app = initializeApp(firebaseConfig);
        this.messaging = getMessaging(app);
        this.listenForMessages();
      } catch (error) {
        console.error('Failed to initialize Firebase:', error);
      }
    }
  }

  /**
   * Request FCM token and register with backend
   * @param userId Unique user identifier
   * @param timezone IANA timezone string (e.g. "America/New_York")
   * @returns Promise<boolean> Success status
   */
  async registerForNotifications(userId: string, timezone: string): Promise<boolean> {
    if (!this.messaging) {
      console.warn('FCM not available');
      return false;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        return false;
      }

      // Get service worker registration
      const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;

      // Get FCM token
      const token = await getToken(this.messaging, {
        vapidKey: firebaseConfig.vapidKey,
        serviceWorkerRegistration: swRegistration
      });

      if (!token) {
        console.error('Failed to get FCM token');
        return false;
      }

      console.log('FCM token obtained:', token.substring(0, 20) + '...');

      // Register token with backend
      const response = await fetch(`${this.API_BASE}/register-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          fcmToken: token, 
          timezone,
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to register token with backend:', error);
        return false;
      }

      console.log('FCM token registered successfully');
      return true;
    } catch (error) {
      console.error('FCM registration failed:', error);
      return false;
    }
  }

  /**
   * Unregister from notifications
   * @param userId Unique user identifier
   * @returns Promise<boolean> Success status
   */
  async unregister(userId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE}/unregister-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        console.error('Failed to unregister token');
        return false;
      }

      console.log('FCM token unregistered successfully');
      return true;
    } catch (error) {
      console.error('Failed to unregister:', error);
      return false;
    }
  }

  /**
   * Listen for foreground messages (when app is open)
   */
  private listenForMessages(): void {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('Foreground FCM message received:', payload);
      
      // Show notification if app is in foreground
      if (payload.notification && Notification.permission === 'granted') {
        new Notification(payload.notification.title || 'Spenza 💸', {
          body: payload.notification.body || "Don't forget to log your expenses!",
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'spenza-reminder',
          requireInteraction: false,
          vibrate: [200, 100, 200]
        });
      }
    });
  }

  /**
   * Check if FCM is supported and available
   */
  isSupported(): boolean {
    return this.messaging !== null;
  }
}
