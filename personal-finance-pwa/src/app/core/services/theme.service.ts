import { Injectable, computed, signal } from '@angular/core';

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

  constructor() {
    // Load persisted preference from localStorage
    const saved = localStorage.getItem('pf-theme') as 'light' | 'dark' | 'system' | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      this._theme.set(saved);
    }

    // Apply theme immediately on init
    this.applyTheme();

    // Listen for system color scheme changes and re-apply when in 'system' mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this._theme() === 'system') {
        this.applyTheme();
      }
    });
  }

  /**
   * Updates the theme preference, persists it to localStorage, and applies it.
   */
  setTheme(t: 'light' | 'dark' | 'system'): void {
    this._theme.set(t);
    localStorage.setItem('pf-theme', t);
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
