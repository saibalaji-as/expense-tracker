import { Injectable, computed, signal } from '@angular/core';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<'light' | 'dark' | 'system'>('system');

  /** The user's stored theme preference. */
  readonly theme = this._theme.asReadonly();

  /**
   * The resolved effective theme after applying system preference.
   * Always returns 'light' or 'dark' — never 'system'.
   */
  readonly effectiveTheme = computed(() => {
    const t = this._theme();
    if (t !== 'system') return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  constructor(private readonly storageService: StorageService) {
    // Restore persisted preference asynchronously
    this.#restoreTheme();

    // Listen for system color scheme changes and re-apply when in 'system' mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this._theme() === 'system') {
        this.applyTheme();
      }
    });
  }

  /**
   * Restores the persisted theme from storage and applies it.
   * Defaults to 'system' when the stored value is absent or unrecognised.
   */
  async #restoreTheme(): Promise<void> {
    const saved = await this.storageService.get('pf-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      this._theme.set(saved);
    }
    this.applyTheme();
  }

  /**
   * Updates the theme preference, persists it to storage, and applies it.
   */
  async setTheme(t: 'light' | 'dark' | 'system'): Promise<void> {
    this._theme.set(t);
    await this.storageService.set('pf-theme', t);
    this.applyTheme();
  }

  /**
   * Toggles the 'dark' class on document.documentElement based on effectiveTheme.
   */
  private applyTheme(): void {
    const isDark = this.effectiveTheme() === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }
}
