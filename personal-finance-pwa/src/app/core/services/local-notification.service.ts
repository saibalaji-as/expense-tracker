import { Injectable, signal, isDevMode } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StorageService } from './storage.service';
import { budgetThresholdExceeded$ } from './budget-events';
import { getDailyReminderContent } from '../utils/reminder-message';

/**
 * LocalNotificationService
 * 
 * Manages local push notifications for the Personal Finance PWA.
 * Provides cross-platform notification support using Capacitor's local-notifications plugin
 * with fallback to browser Notification API for web platforms.
 * 
 * Features:
 * - Daily expense reminders at user-configured times
 * - Budget threshold alerts when spending exceeds 80% of category limits
 * - Monthly summary nudges on the 28th of each month
 * 
 * Requirements: 2.1, 2.9, 8.6
 */
@Injectable({ providedIn: 'root' })
export class LocalNotificationService {
  /**
   * Signal tracking the current notification permission status
   * Possible values: 'default', 'granted', 'denied'
   */
  readonly permissionStatus = signal<'granted' | 'denied' | 'default'>('default');

  /**
   * Platform detection getter
   * Returns 'native' for Android/iOS, 'web' for browser environments
   */
  private get isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Internal map for tracking web notification timeouts
   * Used for scheduling and canceling notifications on web platform
   * Key: notification ID, Value: timeout handle
   */
  private webNotificationTimeouts = new Map<string, number>();

  /**
   * Internal map for recent budget alerts (deduplication)
   * Prevents duplicate alerts for the same category within a 1-hour window
   * Key: category name, Value: timestamp of last alert
   */
  private recentBudgetAlerts = new Map<string, number>();

  constructor(
    private storageService: StorageService,
    private router: Router
  ) {}

  /**
   * Request notification permission from the user
   * 
   * Requests notification permission via the Capacitor plugin on native platforms
   * or the browser Notification API on web platforms.
   * 
   * @returns Promise resolving to 'granted' if permission is granted, 'denied' otherwise
   * 
   * Requirements: 2.1, 2.2, 2.3
   * 
   * @example
   * const status = await localNotificationService.requestPermission();
   * if (status === 'granted') {
   *   // Schedule notifications
   * }
   */
  async requestPermission(): Promise<'granted' | 'denied'> {
    try {
      if (this.isNativePlatform) {
        // Native platform: use Capacitor plugin
        const result = await LocalNotifications.requestPermissions();
        const status = result.display === 'granted' ? 'granted' : 'denied';
        this.permissionStatus.set(status);
        return status;
      } else {
        // Web platform: use browser Notification API
        if (!('Notification' in window)) {
          if (isDevMode()) { console.warn('[LocalNotificationService] Notifications not supported in this environment'); }
          this.permissionStatus.set('denied');
          return 'denied';
        }

        const permission = await Notification.requestPermission();
        const status = permission === 'granted' ? 'granted' : 'denied';
        this.permissionStatus.set(status);
        return status;
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to request permission:', error);
      this.permissionStatus.set('denied');
      return 'denied';
    }
  }

  /**
   * Get the current notification permission status
   * 
   * Returns a signal that tracks the current permission state.
   * The signal updates automatically when permission changes.
   * 
   * @returns Signal with current permission status ('granted', 'denied', or 'default')
   * 
   * Requirements: 2.9
   * 
   * @example
   * const status = localNotificationService.getPermissionStatus();
   * console.log('Current permission:', status());
   */
  getPermissionStatus() {
    return this.permissionStatus;
  }

  /**
   * Check and update the current permission status
   * 
   * Queries the current permission state from the platform and updates the signal.
   * This method is useful for checking permission status on service initialization.
   * 
   * @returns Promise resolving to the current permission status
   * 
   * Requirements: 2.9
   */
  async checkPermissionStatus(): Promise<'granted' | 'denied' | 'default'> {
    try {
      if (this.isNativePlatform) {
        // Native platform: check Capacitor plugin permission
        const result = await LocalNotifications.checkPermissions();
        const status = result.display === 'granted' ? 'granted' : 
                      result.display === 'denied' ? 'denied' : 'default';
        this.permissionStatus.set(status);
        return status;
      } else {
        // Web platform: check browser Notification API
        if (!('Notification' in window)) {
          this.permissionStatus.set('denied');
          return 'denied';
        }

        const permission = Notification.permission;
        const status = permission === 'granted' ? 'granted' : 
                      permission === 'denied' ? 'denied' : 'default';
        this.permissionStatus.set(status);
        return status;
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to check permission status:', error);
      // Don't change the current status on error
      return this.permissionStatus();
    }
  }

  /**
   * Schedule a daily reminder notification
   * 
   * Schedules a repeating daily notification at the specified time.
   * On native platforms, uses Capacitor's local-notifications plugin.
   * On web platforms, uses setTimeout with browser Notification API as fallback.
   * 
   * @param hour - Hour in 24-hour format (0-23)
   * @param minute - Minute (0-59)
   * @returns Promise that resolves when the notification is scheduled
   * 
   * Requirements: 2.4, 3.1, 3.6, 8.1, 8.2
   * 
   * @example
   * // Schedule daily reminder for 9:00 PM
   * await localNotificationService.scheduleDailyReminder(21, 0);
   */
  async scheduleDailyReminder(hour: number, minute: number): Promise<void> {
    try {
      if (this.isNativePlatform) {
        // Calculate the next occurrence of the specified time
        const now = new Date();
        const scheduledTime = new Date();
        scheduledTime.setHours(hour, minute, 0, 0);
        
        // If the time has already passed today, schedule for tomorrow
        if (scheduledTime <= now) {
          scheduledTime.setDate(scheduledTime.getDate() + 1);
        }
        
        if (isDevMode()) { console.log(`[LocalNotificationService] Scheduling daily reminder for ${scheduledTime.toLocaleString()}`); }
        const content = getDailyReminderContent(scheduledTime);
        
        // Native platform: use Capacitor plugin with specific date/time
        await LocalNotifications.schedule({
          notifications: [
            {
              id: 1, // Using numeric ID for native platforms
              title: content.title,
              body: content.body,
              schedule: {
                at: scheduledTime,
                repeats: true,
                every: 'day',
                allowWhileIdle: true // Allow notification even in Doze mode
              },
              channelId: 'expense-reminders', // Use high-priority channel
              extra: {
                route: '/daily'
              },
              // Additional Android-specific settings for lock screen delivery
              actionTypeId: '',
              attachments: [],
              sound: 'default',
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#6366F1', // Primary color
              ongoing: false,
              autoCancel: true
            }
          ]
        });
        if (isDevMode()) { console.log(`[LocalNotificationService] Daily reminder scheduled successfully`); }
      } else {
        // Web platform: use setTimeout with browser Notification API
        await this.scheduleWebDailyReminder(hour, minute);
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to schedule daily reminder:', error);
      // Don't throw - allow app to continue
    }
  }

  /**
   * Schedule a test notification (fires in 10 seconds)
   * Used for testing the notification system
   */
  async scheduleTestNotification(): Promise<void> {
    try {
      if (this.isNativePlatform) {
        const testTime = new Date(Date.now() + 10000); // 10 seconds from now
        
        if (isDevMode()) { console.log(`[LocalNotificationService] Scheduling test notification for ${testTime.toLocaleString()}`); }
        
        await LocalNotifications.schedule({
          notifications: [
            {
              id: 999, // Test notification ID
              title: 'Test Notification',
              body: 'This is a test notification. It works! 🎉',
              schedule: {
                at: testTime,
                allowWhileIdle: true // Allow notification even in Doze mode
              },
              channelId: 'expense-reminders', // Use high-priority channel
              extra: {
                route: '/daily'
              },
              // Additional Android-specific settings for lock screen delivery
              sound: 'default',
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#6366F1',
              ongoing: false,
              autoCancel: true
            }
          ]
        });
        if (isDevMode()) { console.log(`[LocalNotificationService] Test notification scheduled successfully`); }
      } else {
        if (isDevMode()) { console.log('[LocalNotificationService] Test notification only works on native platforms'); }
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to schedule test notification:', error);
    }
  }

  /**
   * Cancel the daily reminder notification
   * 
   * Cancels the scheduled daily reminder notification.
   * On native platforms, uses Capacitor's cancel API.
   * On web platforms, clears the setTimeout and removes from internal map.
   * 
   * @returns Promise that resolves when the notification is cancelled
   * 
   * Requirements: 2.5, 3.4
   * 
   * @example
   * // Cancel the daily reminder
   * await localNotificationService.cancelDailyReminder();
   */
  async cancelDailyReminder(): Promise<void> {
    try {
      if (this.isNativePlatform) {
        // Native platform: cancel notification by ID using Capacitor plugin
        await LocalNotifications.cancel({
          notifications: [{ id: 1 }] // ID 1 is used for daily reminder
        });
        if (isDevMode()) { console.log('[LocalNotificationService] Daily reminder cancelled'); }
      } else {
        // Web platform: clear timeout from internal map
        const timeoutId = this.webNotificationTimeouts.get('daily-reminder');
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.webNotificationTimeouts.delete('daily-reminder');
          if (isDevMode()) { console.log('[LocalNotificationService] Web daily reminder cancelled'); }
        }
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to cancel daily reminder:', error);
      // Don't throw - allow app to continue gracefully
    }
  }

  /**
   * Schedule a monthly summary nudge notification
   * 
   * Schedules a monthly notification that fires on the 28th of each month at 9:00 AM.
   * On native platforms, uses Capacitor's local-notifications plugin.
   * On web platforms, uses setTimeout with browser Notification API as fallback.
   * 
   * @returns Promise that resolves when the notification is scheduled
   * 
   * Requirements: 2.7, 5.1, 5.2, 5.5
   * 
   * @example
   * // Schedule monthly nudge for the 28th at 9:00 AM
   * await localNotificationService.scheduleMonthlyNudge();
   */
  async scheduleMonthlyNudge(): Promise<void> {
    try {
      if (this.isNativePlatform) {
        // Native platform: calculate next 28th and schedule
        const next28th = this.calculateNext28th();
        
        await LocalNotifications.schedule({
          notifications: [
            {
              id: 2, // Using numeric ID 2 for monthly nudge on native platforms
              title: 'Monthly Summary',
              body: 'Month ending soon — check your spending summary',
              schedule: {
                at: next28th
              },
              extra: {
                route: '/monthly',
                recurring: true
              }
            }
          ]
        });
        if (isDevMode()) { console.log(`[LocalNotificationService] Monthly nudge scheduled for ${next28th.toLocaleString()}`); }
      } else {
        // Web platform: use setTimeout with browser Notification API
        await this.scheduleWebMonthlyNudge();
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to schedule monthly nudge:', error);
      // Don't throw - allow app to continue
    }
  }

  /**
   * Cancel the monthly summary nudge notification
   * 
   * Cancels the scheduled monthly nudge notification.
   * On native platforms, uses Capacitor's cancel API.
   * On web platforms, clears the setTimeout and removes from internal map.
   * 
   * @returns Promise that resolves when the notification is cancelled
   * 
   * Requirements: 5.4
   * 
   * @example
   * // Cancel the monthly nudge
   * await localNotificationService.cancelMonthlyNudge();
   */
  async cancelMonthlyNudge(): Promise<void> {
    try {
      if (this.isNativePlatform) {
        // Native platform: cancel notification by ID using Capacitor plugin
        await LocalNotifications.cancel({
          notifications: [{ id: 2 }] // ID 2 is used for monthly nudge
        });
        if (isDevMode()) { console.log('[LocalNotificationService] Monthly nudge cancelled'); }
      } else {
        // Web platform: clear timeout from internal map
        const timeoutId = this.webNotificationTimeouts.get('monthly-nudge');
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.webNotificationTimeouts.delete('monthly-nudge');
          if (isDevMode()) { console.log('[LocalNotificationService] Web monthly nudge cancelled'); }
        }
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to cancel monthly nudge:', error);
      // Don't throw - allow app to continue gracefully
    }
  }

  /**
   * Calculate the next 28th of the month at 9:00 AM
   * 
   * Calculates the date for the next occurrence of the 28th day of the month.
   * If today is before the 28th, returns the 28th of the current month.
   * If today is the 28th or later, returns the 28th of the next month.
   * 
   * @returns Date object representing the next 28th at 9:00 AM
   * 
   * Requirements: 2.7, 5.2
   */
  private calculateNext28th(): Date {
    const now = new Date();
    const currentDay = now.getDate();
    
    // Create date for 28th of current month at 9:00 AM
    const next28th = new Date(now.getFullYear(), now.getMonth(), 28, 9, 0, 0, 0);
    
    // If we're past the 28th this month (or it's the 28th but past 9 AM), move to next month
    if (currentDay > 28 || (currentDay === 28 && now.getHours() >= 9)) {
      next28th.setMonth(next28th.getMonth() + 1);
    }
    
    return next28th;
  }

  /**
   * Schedule monthly nudge for web platform using setTimeout
   * 
   * Calculates the next 28th at 9:00 AM and schedules a notification using setTimeout.
   * Automatically reschedules for the next month after the notification fires.
   * 
   * Requirements: 1.5, 8.1, 8.3
   */
  private async scheduleWebMonthlyNudge(): Promise<void> {
    // Check if Notification API is available
    if (!('Notification' in window)) {
      if (isDevMode()) { console.warn('[LocalNotificationService] Notification API not available'); }
      return;
    }

    // Clear any existing monthly nudge timeout
    const existingTimeout = this.webNotificationTimeouts.get('monthly-nudge');
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Calculate next 28th at 9:00 AM
    const target = this.calculateNext28th();
    const now = new Date();
    const delay = target.getTime() - now.getTime();

    if (isDevMode()) { console.log(`[LocalNotificationService] Web monthly nudge scheduled for ${target.toLocaleString()}`); }

    // Schedule the notification
    const timeoutId = window.setTimeout(() => {
      // Show the notification
      if (Notification.permission === 'granted') {
        const notification = new Notification('Monthly Summary', {
          body: 'Month ending soon — check your spending summary',
          icon: '/icons/icon-192x192.png',
          tag: 'monthly-nudge',
          requireInteraction: false
        });

        // Handle notification click
        notification.onclick = () => {
          window.focus();
          this.router.navigate(['/monthly']);
          notification.close();
        };
      }

      // Reschedule for next month
      this.scheduleWebMonthlyNudge();
    }, delay);

    // Store timeout ID for cancellation
    this.webNotificationTimeouts.set('monthly-nudge', timeoutId);
  }

  /**
   * Schedule a budget overspend alert notification
   * 
   * Schedules an immediate notification when spending exceeds a threshold.
   * Implements deduplication to prevent multiple alerts for the same category within a 1-hour window.
   * 
   * @param category - Expense category name (e.g., 'Food', 'Transport')
   * @param percent - Percentage of budget used (rounded integer)
   * @returns Promise that resolves when the notification is scheduled
   * 
   * Requirements: 2.6, 4.3, 4.4, 4.6, 4.7
   * 
   * @example
   * // Alert when food spending reaches 85% of budget
   * await localNotificationService.scheduleOverspendAlert('Food', 85);
   */
  async scheduleOverspendAlert(category: string, percent: number): Promise<void> {
    try {
      // Check for duplicate alerts within 1-hour window
      const lastAlert = this.recentBudgetAlerts.get(category);
      const now = Date.now();
      const oneHourInMs = 3600000; // 1 hour = 3600000 milliseconds

      if (lastAlert && now - lastAlert < oneHourInMs) {
        if (isDevMode()) { console.log(`[LocalNotificationService] Skipping duplicate alert for ${category} (last alert was ${Math.round((now - lastAlert) / 60000)} minutes ago)`); }
        return;
      }

      // Update recent alerts map
      this.recentBudgetAlerts.set(category, now);

      if (this.isNativePlatform) {
        // Native platform: use Capacitor plugin with immediate delivery
        // Generate unique ID using timestamp to avoid conflicts
        const notificationId = 1000 + Math.floor(Math.random() * 9000); // Random ID between 1000-9999
        
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notificationId,
              title: 'Budget Warning',
              body: `You've used ${percent}% of your ${category} budget`,
              schedule: {
                at: new Date(Date.now() + 1000), // Schedule for 1 second from now (immediate)
                allowWhileIdle: true // Allow notification even in Doze mode
              },
              channelId: 'budget-alerts', // Use high-priority budget alerts channel
              extra: {
                route: '/limits',
                category: category
              },
              // Additional Android-specific settings for lock screen delivery
              sound: 'default',
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#EF4444', // Red color for alerts
              ongoing: false,
              autoCancel: true
            }
          ]
        });
        if (isDevMode()) { console.log(`[LocalNotificationService] Budget alert scheduled for ${category} (${percent}%)`); }
      } else {
        // Web platform: show notification immediately
        await this.showWebBudgetAlert(category, percent);
      }
    } catch (error) {
      console.error('[LocalNotificationService] Failed to schedule budget alert:', error);
      // Don't throw - allow app to continue
    }
  }

  /**
   * Show budget alert for web platform using browser Notification API
   * 
   * Displays an immediate notification for budget threshold alerts on web platforms.
   * 
   * @param category - Expense category name
   * @param percent - Percentage of budget used
   * 
   * Requirements: 1.5, 8.1
   */
  private async showWebBudgetAlert(category: string, percent: number): Promise<void> {
    // Check if window is available (for test environment compatibility)
    if (typeof window === 'undefined') {
      if (isDevMode()) { console.warn('[LocalNotificationService] Window not available'); }
      return;
    }

    // Check if Notification API is available
    if (!('Notification' in window)) {
      if (isDevMode()) { console.warn('[LocalNotificationService] Notification API not available'); }
      return;
    }

    // Check permission
    if (Notification.permission !== 'granted') {
      if (isDevMode()) { console.warn('[LocalNotificationService] Notification permission not granted'); }
      return;
    }

    // Generate unique tag for this notification
    const timestamp = Date.now();
    const tag = `budget-warning-${category}-${timestamp}`;

    // Show the notification
    const notification = new Notification('Budget Warning', {
      body: `You've used ${percent}% of your ${category} budget`,
      icon: '/icons/icon-192x192.png',
      tag: tag,
      requireInteraction: true // Keep notification visible until user interacts
    });

    // Handle notification click
    notification.onclick = () => {
      window.focus();
      this.router.navigate(['/limits']);
      notification.close();
    };

    if (isDevMode()) { console.log(`[LocalNotificationService] Web budget alert shown for ${category} (${percent}%)`); }
  }

  /**
   * Setup notification tap listener
   * 
   * Registers listeners for notification tap events on both native and web platforms.
   * On native platforms, listens to 'localNotificationActionPerformed' event.
   * On web platforms, click handlers are registered when notifications are created.
   * 
   * This method should be called during service initialization to ensure
   * notification taps are handled throughout the app lifecycle.
   * 
   * Requirements: 10.4, 10.7
   * 
   * @example
   * // Called during service initialization
   * this.setupNotificationListener();
   */
  setupNotificationListener(): void {
    if (this.isNativePlatform) {
      // Native platform: register listener for localNotificationActionPerformed event
      LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        if (isDevMode()) { console.log('[LocalNotificationService] Notification tapped:', event); }
        
        // Extract notification data and handle tap
        if (event.notification) {
          this.handleNotificationTap(event.notification);
        }
      });
      
      if (isDevMode()) { console.log('[LocalNotificationService] Native notification tap listener registered'); }
    } else {
      // Web platform: click handlers are registered inline when notifications are created
      // See scheduleWebDailyReminder(), scheduleWebMonthlyNudge(), and showWebBudgetAlert()
      if (isDevMode()) { console.log('[LocalNotificationService] Web notification click handlers registered inline'); }
    }
  }

  /**
   * Handle notification tap event
   * 
   * Processes notification tap events by extracting the target route from the notification
   * extra data and navigating to the appropriate page using Angular Router.
   * 
   * Route mapping:
   * - Daily reminder → /daily
   * - Budget warning → /limits
   * - Monthly nudge → /monthly
   * 
   * If navigation fails, falls back to navigating to the home route.
   * 
   * @param notification - The notification object containing extra data with route information
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.5, 10.6
   * 
   * @example
   * // Called when user taps a notification
   * this.handleNotificationTap({
   *   id: 1,
   *   title: 'Expense Reminder',
   *   body: 'Don\'t forget to log today\'s expenses',
   *   extra: { route: '/daily' }
   * });
   */
  private handleNotificationTap(notification: any): void {
    try {
      // Extract route from notification extra data
      const route = notification.extra?.route;
      
      if (!route) {
        if (isDevMode()) { console.warn('[LocalNotificationService] No route found in notification extra data'); }
        return;
      }

      if (isDevMode()) { console.log(`[LocalNotificationService] Navigating to ${route} from notification tap`); }

      // Navigate to the target route
      this.router.navigate([route]).catch((error) => {
        console.error('[LocalNotificationService] Navigation failed:', error);
        
        // Fallback: navigate to home route
        if (isDevMode()) { console.log('[LocalNotificationService] Falling back to home route'); }
        this.router.navigate(['/']);
      });
    } catch (error) {
      console.error('[LocalNotificationService] Error handling notification tap:', error);
    }
  }

  /**
   * Schedule daily reminder for web platform using setTimeout
   * 
   * Calculates the next trigger time and schedules a notification using setTimeout.
   * Automatically reschedules for the next day after the notification fires.
   * 
   * @param hour - Hour in 24-hour format (0-23)
   * @param minute - Minute (0-59)
   * 
   * Requirements: 1.5, 8.1, 8.3
   */
  private async scheduleWebDailyReminder(hour: number, minute: number): Promise<void> {
    // Check if Notification API is available
    if (!('Notification' in window)) {
      if (isDevMode()) { console.warn('[LocalNotificationService] Notification API not available'); }
      return;
    }

    // Clear any existing daily reminder timeout
    const existingTimeout = this.webNotificationTimeouts.get('daily-reminder');
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Calculate next trigger time
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    
    // If target time has passed today, schedule for tomorrow
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();

    if (isDevMode()) { console.log(`[LocalNotificationService] Web daily reminder scheduled for ${target.toLocaleString()}`); }

    // Schedule the notification
    const timeoutId = window.setTimeout(() => {
      // Show the notification
      if (Notification.permission === 'granted') {
        const content = getDailyReminderContent();
        const notification = new Notification(content.title, {
          body: content.body,
          icon: '/icons/icon-192x192.png',
          tag: 'daily-reminder',
          requireInteraction: false
        });

        // Handle notification click
        notification.onclick = () => {
          window.focus();
          this.router.navigate(['/daily']);
          notification.close();
        };
      }

      // Reschedule for next day
      this.scheduleWebDailyReminder(hour, minute);
    }, delay);

    // Store timeout ID for cancellation
    this.webNotificationTimeouts.set('daily-reminder', timeoutId);
  }

  /**
   * Initialize the notification service
   * 
   * Bootstraps the notification service on app startup by:
   * 1. Checking current permission status (without requesting)
   * 2. Setting up notification tap listeners
   * 3. Subscribing to budget threshold events from ExpenseStore
   * 
   * NOTE: Notifications are NOT automatically scheduled on startup to avoid
   * blocking the app with permission dialogs. Scheduling happens when the user
   * explicitly enables notifications in Settings.
   * 
   * This method should be called during app initialization (via APP_INITIALIZER).
   * 
   * @returns Promise that resolves when initialization is complete
   * 
   * Requirements: 7.3, 7.4, 7.5
   * 
   * @example
   * // Called during app bootstrap
   * await localNotificationService.initialize();
   */
  async initialize(): Promise<void> {
    try {
      if (isDevMode()) { console.log('[LocalNotificationService] Initializing service...'); }

      // Step 1: Check current permission status (without requesting)
      await this.checkPermissionStatus();
      if (isDevMode()) { console.log('[LocalNotificationService] Permission status:', this.permissionStatus()); }

      // Step 2: Setup notification tap listener
      this.setupNotificationListener();

      // Step 3: Subscribe to budget threshold events from ExpenseStore
      try {
        budgetThresholdExceeded$.subscribe(async (event) => {
          if (isDevMode()) { console.log('[LocalNotificationService] Budget threshold exceeded:', event); }
          
          // Check if budget warnings are enabled
          const currentPrefs = await this.storageService.getNotificationPreferences();
          if (currentPrefs.budgetWarningsEnabled && this.permissionStatus() === 'granted') {
            await this.scheduleOverspendAlert(event.category, event.percent);
          } else {
            if (isDevMode()) { console.log('[LocalNotificationService] Budget warning not sent:', {
              warningsEnabled: currentPrefs.budgetWarningsEnabled,
              permissionGranted: this.permissionStatus() === 'granted'
            }); }
          }
        });
        if (isDevMode()) { console.log('[LocalNotificationService] Subscribed to budget threshold events'); }
      } catch (error) {
        console.error('[LocalNotificationService] Failed to subscribe to budget threshold events:', error);
        // Don't throw - allow app to continue even if subscription fails
      }

      if (isDevMode()) { console.log('[LocalNotificationService] Initialization complete'); }
    } catch (error) {
      console.error('[LocalNotificationService] Initialization failed:', error);
      // Don't throw - allow app to continue even if notification initialization fails
    }
  }
}
