import { Injectable, computed, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type AppPalette = 'violet' | 'rose' | 'azure' | 'emerald' | 'amber';
export type AppStyle = 'glass' | 'neobrutalism' | 'neumorphism' | 'claymorphism';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<'light' | 'dark' | 'system'>('system');
  private readonly _palette = signal<AppPalette>('violet');
  private readonly _style = signal<AppStyle>('glass');

  readonly theme = this._theme.asReadonly();
  readonly palette = this._palette.asReadonly();
  readonly style = this._style.asReadonly();

  readonly effectiveTheme = computed(() => {
    const t = this._theme();
    if (t !== 'system') return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  constructor(private readonly storageService: StorageService) {
    this.#restoreTheme();
    this.#restorePalette();
    this.#restoreStyle();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this._theme() === 'system') {
        this.applyTheme();
      }
    });
  }

  async #restoreTheme(): Promise<void> {
    const saved = await this.storageService.get('pf-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      this._theme.set(saved);
    }
    this.applyTheme();
  }

  async #restorePalette(): Promise<void> {
    const saved = await this.storageService.get('pf-palette');
    const valid: AppPalette[] = ['violet', 'rose', 'azure', 'emerald', 'amber'];
    if (valid.includes(saved as AppPalette)) {
      this._palette.set(saved as AppPalette);
    }
    this.#applyPalette();
    this.#updateMetaThemeColor();
  }

  async #restoreStyle(): Promise<void> {
    const saved = await this.storageService.get('pf-style');
    const valid: AppStyle[] = ['glass', 'neobrutalism', 'neumorphism', 'claymorphism'];
    if (valid.includes(saved as AppStyle)) {
      this._style.set(saved as AppStyle);
    }
    this.#applyStyle();
  }

  async setTheme(t: 'light' | 'dark' | 'system'): Promise<void> {
    this._theme.set(t);
    await this.storageService.set('pf-theme', t);
    this.applyTheme();
  }

  async setPalette(p: AppPalette): Promise<void> {
    this._palette.set(p);
    await this.storageService.set('pf-palette', p);
    this.#applyPalette();
    this.#updateMetaThemeColor();
  }

  async setStyle(s: AppStyle): Promise<void> {
    this._style.set(s);
    await this.storageService.set('pf-style', s);
    this.#applyStyle();
  }

  getCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  private applyTheme(): void {
    const isDark = this.effectiveTheme() === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    this.#updateMetaThemeColor();
  }

  #applyPalette(): void {
    const p = this._palette();
    if (p === 'violet') {
      document.documentElement.removeAttribute('data-palette');
    } else {
      document.documentElement.setAttribute('data-palette', p);
    }
  }

  #applyStyle(): void {
    const s = this._style();
    if (s === 'glass') {
      document.documentElement.removeAttribute('data-style');
    } else {
      document.documentElement.setAttribute('data-style', s);
    }
  }

  #updateMetaThemeColor(): void {
    const primary = this.getCssVar('--primary');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', primary || '#7c3aed');
  }
}
