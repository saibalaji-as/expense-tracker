import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { StorageService } from './storage.service';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../models/notification-preferences.model';

// In-memory store backing the mock
const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) =>
      Promise.resolve({ value: store.get(key) ?? null })
    ),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    remove: vi.fn(({ key }: { key: string }) => {
      store.delete(key);
      return Promise.resolve();
    }),
  },
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    store.clear();
    service = new StorageService();
  });

  // Feature: capacitor-preferences-migration, Property 1: set-then-get round-trip
  // Validates: Requirements 2.6
  it('set then get returns the stored value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // key
        fc.string(),                  // value
        async (key, value) => {
          store.clear();
          await service.set(key, value);
          const result = await service.get(key);
          expect(result).toBe(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: capacitor-preferences-migration, Property 2: remove clears the key
  // Validates: Requirements 2.7
  it('set then remove then get returns null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string(),
        async (key, value) => {
          store.clear();
          await service.set(key, value);
          await service.remove(key);
          const result = await service.get(key);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: capacitor-preferences-migration, Property 3: last write wins
  // Validates: Requirements 2.8
  it('second set overwrites the first', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.string(),
        async (key, v1, v2) => {
          store.clear();
          await service.set(key, v1);
          await service.set(key, v2);
          const result = await service.get(key);
          expect(result).toBe(v2);
        }
      ),
      { numRuns: 100 }
    );
  });

  describe('Notification Preferences', () => {
    // Unit test: returns default preferences when none exist
    // Validates: Requirements 7.1
    it('getNotificationPreferences returns default preferences when none exist', async () => {
      store.clear();
      const prefs = await service.getNotificationPreferences();
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    // Unit test: returns default preferences on JSON parse error
    // Validates: Requirements 7.1
    it('getNotificationPreferences returns default preferences on JSON parse error', async () => {
      store.clear();
      store.set('notification_preferences', 'invalid json');
      const prefs = await service.getNotificationPreferences();
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    // Unit test: set then get returns the stored preferences
    // Validates: Requirements 7.1, 7.2
    it('setNotificationPreferences then getNotificationPreferences returns stored preferences', async () => {
      store.clear();
      const testPrefs: NotificationPreferences = {
        dailyReminderEnabled: true,
        reminderHour: 9,
        reminderMinute: 30,
        budgetWarningsEnabled: false,
      };
      
      await service.setNotificationPreferences(testPrefs);
      const result = await service.getNotificationPreferences();
      expect(result).toEqual(testPrefs);
    });

    // Property-based test: set then get round-trip
    // Validates: Requirements 7.1, 7.2
    it('notification preferences round-trip preserves all fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          fc.boolean(),
          async (dailyReminderEnabled, reminderHour, reminderMinute, budgetWarningsEnabled) => {
            store.clear();
            const prefs: NotificationPreferences = {
              dailyReminderEnabled,
              reminderHour,
              reminderMinute,
              budgetWarningsEnabled,
            };
            
            await service.setNotificationPreferences(prefs);
            const result = await service.getNotificationPreferences();
            
            expect(result.dailyReminderEnabled).toBe(dailyReminderEnabled);
            expect(result.reminderHour).toBe(reminderHour);
            expect(result.reminderMinute).toBe(reminderMinute);
            expect(result.budgetWarningsEnabled).toBe(budgetWarningsEnabled);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property-based test: last write wins
    // Validates: Requirements 7.2
    it('second setNotificationPreferences overwrites the first', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          fc.boolean(),
          fc.boolean(),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          fc.boolean(),
          async (enabled1, hour1, minute1, warnings1, enabled2, hour2, minute2, warnings2) => {
            store.clear();
            const prefs1: NotificationPreferences = {
              dailyReminderEnabled: enabled1,
              reminderHour: hour1,
              reminderMinute: minute1,
              budgetWarningsEnabled: warnings1,
            };
            const prefs2: NotificationPreferences = {
              dailyReminderEnabled: enabled2,
              reminderHour: hour2,
              reminderMinute: minute2,
              budgetWarningsEnabled: warnings2,
            };
            
            await service.setNotificationPreferences(prefs1);
            await service.setNotificationPreferences(prefs2);
            const result = await service.getNotificationPreferences();
            
            expect(result).toEqual(prefs2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
