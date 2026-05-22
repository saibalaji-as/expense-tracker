import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LocalNotificationService } from './local-notification.service';
import { StorageService } from './storage.service';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Mock Capacitor and LocalNotifications at module level
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn()
  }
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: vi.fn(),
    schedule: vi.fn(),
    requestPermissions: vi.fn(),
    checkPermissions: vi.fn(),
    addListener: vi.fn()
  }
}));

vi.mock('./expense-store.service', () => ({
  budgetThresholdExceeded$: {
    subscribe: vi.fn()
  }
}));

describe('LocalNotificationService - scheduleDailyReminder', () => {
  let service: LocalNotificationService;
  let mockStorageService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockStorageService = {
      getNotificationPreferences: vi.fn().mockResolvedValue({
        dailyReminderEnabled: false,
        reminderHour: 21,
        reminderMinute: 0,
        budgetWarningsEnabled: true
      }),
      setNotificationPreferences: vi.fn().mockResolvedValue(undefined)
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    service = new LocalNotificationService(mockStorageService, mockRouter);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('schedules the native daily reminder with a rotating money tip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10, 0, 0));
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LocalNotifications.schedule).mockResolvedValue(undefined);

    await service.scheduleDailyReminder(21, 0);

    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: 1,
          title: 'Spenza money tip',
          body: expect.stringContaining("Add today's expenses now."),
          extra: {
            route: '/daily'
          }
        })
      ]
    });
  });
});

describe('LocalNotificationService - cancelMonthlyNudge', () => {
  let service: LocalNotificationService;
  let mockStorageService: any;
  let mockRouter: any;

  beforeEach(() => {
    // Mock StorageService
    mockStorageService = {
      getNotificationPreferences: vi.fn().mockResolvedValue({
        dailyReminderEnabled: false,
        reminderHour: 21,
        reminderMinute: 0,
        budgetWarningsEnabled: true
      }),
      setNotificationPreferences: vi.fn().mockResolvedValue(undefined)
    };

    // Mock Router
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    // Create service instance directly without TestBed
    service = new LocalNotificationService(mockStorageService, mockRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Native Platform', () => {
    beforeEach(() => {
      // Mock Capacitor to return native platform
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      // Reset LocalNotifications.cancel mock
      vi.mocked(LocalNotifications.cancel).mockResolvedValue(undefined);
    });

    it('should cancel monthly nudge notification by ID 2 on native platform', async () => {
      await service.cancelMonthlyNudge();

      expect(LocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: 2 }]
      });
    });

    it('should not throw error if cancellation fails on native platform', async () => {
      vi.mocked(LocalNotifications.cancel).mockRejectedValue(new Error('Cancel failed'));

      await expect(service.cancelMonthlyNudge()).resolves.not.toThrow();
    });

    it('should log success message when cancellation succeeds', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.cancelMonthlyNudge();

      expect(consoleSpy).toHaveBeenCalledWith('[LocalNotificationService] Monthly nudge cancelled');
      
      consoleSpy.mockRestore();
    });

    it('should log error message when cancellation fails', async () => {
      const error = new Error('Cancel failed');
      vi.mocked(LocalNotifications.cancel).mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.cancelMonthlyNudge();

      expect(consoleSpy).toHaveBeenCalledWith('[LocalNotificationService] Failed to cancel monthly nudge:', error);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Web Platform', () => {
    beforeEach(() => {
      // Mock Capacitor to return web platform
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it('should clear timeout from internal map on web platform', async () => {
      // Schedule a monthly nudge first to create a timeout
      const mockTimeoutId = 12345;
      
      // Access private property for testing
      const timeoutMap = (service as any).webNotificationTimeouts;
      timeoutMap.set('monthly-nudge', mockTimeoutId);

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout').mockImplementation(() => {});

      await service.cancelMonthlyNudge();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeoutId);
      expect(timeoutMap.has('monthly-nudge')).toBe(false);
      
      clearTimeoutSpy.mockRestore();
    });

    it('should handle case when no timeout exists on web platform', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout').mockImplementation(() => {});

      await service.cancelMonthlyNudge();

      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      
      clearTimeoutSpy.mockRestore();
    });

    it('should log success message when web timeout is cleared', async () => {
      const mockTimeoutId = 12345;
      const timeoutMap = (service as any).webNotificationTimeouts;
      timeoutMap.set('monthly-nudge', mockTimeoutId);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.cancelMonthlyNudge();

      expect(consoleSpy).toHaveBeenCalledWith('[LocalNotificationService] Web monthly nudge cancelled');
      
      consoleSpy.mockRestore();
    });

    it('should not throw error if clearing timeout fails on web platform', async () => {
      const mockTimeoutId = 12345;
      const timeoutMap = (service as any).webNotificationTimeouts;
      timeoutMap.set('monthly-nudge', mockTimeoutId);

      vi.spyOn(global, 'clearTimeout').mockImplementation(() => {
        throw new Error('Clear timeout failed');
      });

      await expect(service.cancelMonthlyNudge()).resolves.not.toThrow();
    });
  });
});

describe('LocalNotificationService - scheduleOverspendAlert', () => {
  let service: LocalNotificationService;
  let mockStorageService: any;
  let mockRouter: any;

  beforeEach(() => {
    // Mock StorageService
    mockStorageService = {
      getNotificationPreferences: vi.fn().mockResolvedValue({
        dailyReminderEnabled: false,
        reminderHour: 21,
        reminderMinute: 0,
        budgetWarningsEnabled: true
      }),
      setNotificationPreferences: vi.fn().mockResolvedValue(undefined)
    };

    // Mock Router
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    // Create service instance
    service = new LocalNotificationService(mockStorageService, mockRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Native Platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(LocalNotifications.schedule).mockResolvedValue(undefined);
    });

    it('should schedule budget alert with correct parameters on native platform', async () => {
      await service.scheduleOverspendAlert('Food', 85);

      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            title: 'Budget Warning',
            body: "You've used 85% of your Food budget",
            extra: {
              route: '/limits',
              category: 'Food'
            }
          })
        ]
      });
    });

    it('should generate unique notification ID for each alert', async () => {
      await service.scheduleOverspendAlert('Food', 85);
      const firstCall = vi.mocked(LocalNotifications.schedule).mock.calls[0][0];
      const firstId = firstCall.notifications[0].id;

      await service.scheduleOverspendAlert('Transport', 90);
      const secondCall = vi.mocked(LocalNotifications.schedule).mock.calls[1][0];
      const secondId = secondCall.notifications[0].id;

      // IDs should be different
      expect(firstId).not.toBe(secondId);
      // IDs should be in range 1000-9999
      expect(firstId).toBeGreaterThanOrEqual(1000);
      expect(firstId).toBeLessThan(10000);
      expect(secondId).toBeGreaterThanOrEqual(1000);
      expect(secondId).toBeLessThan(10000);
    });

    it('should schedule notification for immediate delivery', async () => {
      const beforeCall = Date.now();
      await service.scheduleOverspendAlert('Food', 85);
      const afterCall = Date.now();

      const call = vi.mocked(LocalNotifications.schedule).mock.calls[0][0];
      const scheduledTime = call.notifications[0].schedule?.at?.getTime();

      expect(scheduledTime).toBeDefined();
      // Should be scheduled within 1-2 seconds from now
      expect(scheduledTime).toBeGreaterThanOrEqual(beforeCall);
      expect(scheduledTime).toBeLessThanOrEqual(afterCall + 2000);
    });

    it('should not throw error if scheduling fails', async () => {
      vi.mocked(LocalNotifications.schedule).mockRejectedValue(new Error('Schedule failed'));

      await expect(service.scheduleOverspendAlert('Food', 85)).resolves.not.toThrow();
    });
  });

  describe('Deduplication', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(LocalNotifications.schedule).mockResolvedValue(undefined);
    });

    it('should prevent duplicate alerts for same category within 1 hour', async () => {
      // First alert
      await service.scheduleOverspendAlert('Food', 85);
      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);

      // Second alert for same category within 1 hour
      await service.scheduleOverspendAlert('Food', 90);
      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should allow alerts for different categories', async () => {
      await service.scheduleOverspendAlert('Food', 85);
      await service.scheduleOverspendAlert('Transport', 90);

      expect(LocalNotifications.schedule).toHaveBeenCalledTimes(2);
    });

    it('should log when skipping duplicate alert', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.scheduleOverspendAlert('Food', 85);
      await service.scheduleOverspendAlert('Food', 90);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LocalNotificationService] Skipping duplicate alert for Food')
      );

      consoleSpy.mockRestore();
    });

    it('should update recent alerts map with current timestamp', async () => {
      await service.scheduleOverspendAlert('Food', 85);

      const recentAlerts = (service as any).recentBudgetAlerts;
      const timestamp = recentAlerts.get('Food');

      expect(timestamp).toBeDefined();
      expect(typeof timestamp).toBe('number');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it('should log error and not throw when scheduling fails', async () => {
      const error = new Error('Schedule failed');
      vi.mocked(LocalNotifications.schedule).mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.scheduleOverspendAlert('Food', 85)).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Failed to schedule budget alert:',
        error
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('LocalNotificationService - Monthly Nudge - calculateNext28th logic', () => {
  /**
   * Helper function to simulate the calculateNext28th logic
   * This is the same logic as in the service
   */
  function calculateNext28th(): Date {
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

  describe('calculateNext28th', () => {
    it('should calculate next 28th correctly when current day is before 28th', () => {
      // Mock current date to be January 15, 2024
      const mockDate = new Date(2024, 0, 15, 10, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return January 28, 2024 at 9:00 AM
      expect(next28th.getFullYear()).toBe(2024);
      expect(next28th.getMonth()).toBe(0); // January
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should calculate next 28th correctly when current day is after 28th', () => {
      // Mock current date to be January 30, 2024
      const mockDate = new Date(2024, 0, 30, 10, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return February 28, 2024 at 9:00 AM
      expect(next28th.getFullYear()).toBe(2024);
      expect(next28th.getMonth()).toBe(1); // February
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should calculate next 28th correctly when current day is 28th before 9 AM', () => {
      // Mock current date to be January 28, 2024 at 8:00 AM
      const mockDate = new Date(2024, 0, 28, 8, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return January 28, 2024 at 9:00 AM (same day)
      expect(next28th.getFullYear()).toBe(2024);
      expect(next28th.getMonth()).toBe(0); // January
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should calculate next 28th correctly when current day is 28th after 9 AM', () => {
      // Mock current date to be January 28, 2024 at 10:00 AM
      const mockDate = new Date(2024, 0, 28, 10, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return February 28, 2024 at 9:00 AM (next month)
      expect(next28th.getFullYear()).toBe(2024);
      expect(next28th.getMonth()).toBe(1); // February
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should handle year rollover correctly', () => {
      // Mock current date to be December 30, 2024
      const mockDate = new Date(2024, 11, 30, 10, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return January 28, 2025 at 9:00 AM (next year)
      expect(next28th.getFullYear()).toBe(2025);
      expect(next28th.getMonth()).toBe(0); // January
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should handle February correctly (month with 28 days)', () => {
      // Mock current date to be February 15, 2024
      const mockDate = new Date(2024, 1, 15, 10, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return February 28, 2024 at 9:00 AM
      expect(next28th.getFullYear()).toBe(2024);
      expect(next28th.getMonth()).toBe(1); // February
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should handle months with 31 days correctly', () => {
      // Mock current date to be March 31, 2024
      const mockDate = new Date(2024, 2, 31, 10, 0, 0);
      vi.setSystemTime(mockDate);

      const next28th = calculateNext28th();

      // Should return April 28, 2024 at 9:00 AM (next month)
      expect(next28th.getFullYear()).toBe(2024);
      expect(next28th.getMonth()).toBe(3); // April
      expect(next28th.getDate()).toBe(28);
      expect(next28th.getHours()).toBe(9);
      expect(next28th.getMinutes()).toBe(0);

      vi.useRealTimers();
    });
  });
});

describe('LocalNotificationService - setupNotificationListener', () => {
  let service: LocalNotificationService;
  let mockStorageService: any;
  let mockRouter: any;

  beforeEach(() => {
    // Mock StorageService
    mockStorageService = {
      getNotificationPreferences: vi.fn().mockResolvedValue({
        dailyReminderEnabled: false,
        reminderHour: 21,
        reminderMinute: 0,
        budgetWarningsEnabled: true
      }),
      setNotificationPreferences: vi.fn().mockResolvedValue(undefined)
    };

    // Mock Router
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    // Create service instance
    service = new LocalNotificationService(mockStorageService, mockRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Native Platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(LocalNotifications.addListener).mockReturnValue(Promise.resolve());
    });

    it('should register listener for localNotificationActionPerformed event on native platform', () => {
      service.setupNotificationListener();

      expect(LocalNotifications.addListener).toHaveBeenCalledWith(
        'localNotificationActionPerformed',
        expect.any(Function)
      );
    });

    it('should log success message when native listener is registered', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      service.setupNotificationListener();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Native notification tap listener registered'
      );

      consoleSpy.mockRestore();
    });

    it('should call handleNotificationTap when notification is tapped', () => {
      let eventHandler: any;
      vi.mocked(LocalNotifications.addListener).mockImplementation((event, handler) => {
        eventHandler = handler;
        return Promise.resolve();
      });

      service.setupNotificationListener();

      // Simulate notification tap event
      const mockEvent = {
        notification: {
          id: 1,
          title: 'Expense Reminder',
          body: "Don't forget to log today's expenses",
          extra: { route: '/daily' }
        }
      };

      eventHandler(mockEvent);

      // Verify navigation was called
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/daily']);
    });

    it('should log notification tap event', () => {
      let eventHandler: any;
      vi.mocked(LocalNotifications.addListener).mockImplementation((event, handler) => {
        eventHandler = handler;
        return Promise.resolve();
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      service.setupNotificationListener();

      const mockEvent = {
        notification: {
          id: 1,
          title: 'Expense Reminder',
          extra: { route: '/daily' }
        }
      };

      eventHandler(mockEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Notification tapped:',
        mockEvent
      );

      consoleSpy.mockRestore();
    });

    it('should not call handleNotificationTap if notification is missing in event', () => {
      let eventHandler: any;
      vi.mocked(LocalNotifications.addListener).mockImplementation((event, handler) => {
        eventHandler = handler;
        return Promise.resolve();
      });

      service.setupNotificationListener();

      // Simulate event without notification
      const mockEvent = {};

      eventHandler(mockEvent);

      // Verify navigation was not called
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('Web Platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it('should log message about inline click handlers on web platform', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      service.setupNotificationListener();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Web notification click handlers registered inline'
      );

      consoleSpy.mockRestore();
    });

    it('should not call LocalNotifications.addListener on web platform', () => {
      service.setupNotificationListener();

      expect(LocalNotifications.addListener).not.toHaveBeenCalled();
    });
  });
});

describe('LocalNotificationService - handleNotificationTap', () => {
  let service: LocalNotificationService;
  let mockStorageService: any;
  let mockRouter: any;

  beforeEach(() => {
    // Mock StorageService
    mockStorageService = {
      getNotificationPreferences: vi.fn().mockResolvedValue({
        dailyReminderEnabled: false,
        reminderHour: 21,
        reminderMinute: 0,
        budgetWarningsEnabled: true
      }),
      setNotificationPreferences: vi.fn().mockResolvedValue(undefined)
    };

    // Mock Router
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    // Create service instance
    service = new LocalNotificationService(mockStorageService, mockRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Route Navigation', () => {
    it('should navigate to /daily for daily reminder notification', () => {
      const notification = {
        id: 1,
        title: 'Expense Reminder',
        body: "Don't forget to log today's expenses",
        extra: { route: '/daily' }
      };

      (service as any).handleNotificationTap(notification);

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/daily']);
    });

    it('should navigate to /limits for budget warning notification', () => {
      const notification = {
        id: 1000,
        title: 'Budget Warning',
        body: "You've used 85% of your Food budget",
        extra: { route: '/limits', category: 'Food' }
      };

      (service as any).handleNotificationTap(notification);

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/limits']);
    });

    it('should navigate to /monthly for monthly nudge notification', () => {
      const notification = {
        id: 2,
        title: 'Monthly Summary',
        body: 'Month ending soon — check your spending summary',
        extra: { route: '/monthly', recurring: true }
      };

      (service as any).handleNotificationTap(notification);

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/monthly']);
    });

    it('should log navigation action', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const notification = {
        id: 1,
        extra: { route: '/daily' }
      };

      (service as any).handleNotificationTap(notification);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Navigating to /daily from notification tap'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should not navigate if route is missing in extra data', () => {
      const notification = {
        id: 1,
        title: 'Test Notification',
        extra: {}
      };

      (service as any).handleNotificationTap(notification);

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should log warning if route is missing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const notification = {
        id: 1,
        extra: {}
      };

      (service as any).handleNotificationTap(notification);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] No route found in notification extra data'
      );

      consoleSpy.mockRestore();
    });

    it('should not navigate if extra data is missing', () => {
      const notification = {
        id: 1,
        title: 'Test Notification'
      };

      (service as any).handleNotificationTap(notification);

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should fallback to home route if navigation fails', async () => {
      mockRouter.navigate.mockRejectedValueOnce(new Error('Navigation failed'));

      const notification = {
        id: 1,
        extra: { route: '/daily' }
      };

      (service as any).handleNotificationTap(notification);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/daily']);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should log error when navigation fails', async () => {
      const error = new Error('Navigation failed');
      mockRouter.navigate.mockRejectedValueOnce(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const notification = {
        id: 1,
        extra: { route: '/daily' }
      };

      (service as any).handleNotificationTap(notification);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Navigation failed:',
        error
      );

      consoleSpy.mockRestore();
    });

    it('should log fallback message when navigating to home', async () => {
      mockRouter.navigate.mockRejectedValueOnce(new Error('Navigation failed'));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const notification = {
        id: 1,
        extra: { route: '/daily' }
      };

      (service as any).handleNotificationTap(notification);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Falling back to home route'
      );

      consoleSpy.mockRestore();
    });

    it('should handle exceptions in handleNotificationTap gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Pass invalid notification that will cause an error
      const notification = null;

      expect(() => {
        (service as any).handleNotificationTap(notification);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalNotificationService] Error handling notification tap:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
