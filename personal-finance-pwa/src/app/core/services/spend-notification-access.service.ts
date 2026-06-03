import { Injectable, signal, isDevMode } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface SpendNotificationAccessStatus {
  supported: boolean;
  permissionGranted: boolean;
  promptEnabled: boolean;
}

interface SpendNotificationAccessPlugin {
  getStatus(): Promise<SpendNotificationAccessStatus>;
  setPromptEnabled(options: { enabled: boolean }): Promise<SpendNotificationAccessStatus>;
  openSettings(): Promise<void>;
}

const SpendNotificationAccess = registerPlugin<SpendNotificationAccessPlugin>('SpendNotificationAccess');

@Injectable({ providedIn: 'root' })
export class SpendNotificationAccessService {
  readonly supported = signal(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android');
  readonly permissionGranted = signal(false);
  readonly promptEnabled = signal(false);
  readonly isLoading = signal(false);

  async refreshStatus(): Promise<void> {
    if (!this.supported()) return;
    this.isLoading.set(true);
    try {
      this.applyStatus(await SpendNotificationAccess.getStatus());
    } catch (error) {
      if (isDevMode()) { console.warn('[SpendNotificationAccess] Failed to read status:', error); }
    } finally {
      this.isLoading.set(false);
    }
  }

  async setPromptEnabled(enabled: boolean): Promise<void> {
    if (!this.supported()) return;
    this.isLoading.set(true);
    try {
      this.applyStatus(await SpendNotificationAccess.setPromptEnabled({ enabled }));
    } finally {
      this.isLoading.set(false);
    }
  }

  async openSettings(): Promise<void> {
    if (!this.supported()) return;
    await SpendNotificationAccess.openSettings();
  }

  private applyStatus(status: SpendNotificationAccessStatus): void {
    this.supported.set(status.supported);
    this.permissionGranted.set(status.permissionGranted);
    this.promptEnabled.set(status.promptEnabled);
  }
}
