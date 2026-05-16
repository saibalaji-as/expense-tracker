import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../models/notification-preferences.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }

  async clear(): Promise<void> {
    await Preferences.clear();
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const json = await this.get('notification_preferences');
    if (!json) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    
    try {
      return JSON.parse(json);
    } catch (error) {
      console.error('[StorageService] Failed to parse notification preferences:', error);
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
  }

  async setNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
    await this.set('notification_preferences', JSON.stringify(prefs));
  }
}
