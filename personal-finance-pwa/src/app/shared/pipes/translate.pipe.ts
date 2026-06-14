import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

@Pipe({
  name: 'translate',
  standalone: true,
  // Impure so it reacts to a runtime language change. PERF: transform() runs on
  // every change-detection pass for every `| translate` in the view (hundreds of
  // them). We memoize the last (key, language) -> result so repeated calls are a
  // couple of cheap comparisons instead of a map lookup each time, and only
  // recompute when the key or the active language actually changes.
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  private lastKey?: string;
  private lastLanguage?: string;
  private lastResult = '';

  transform(key: string): string {
    const language = this.i18n.language();
    if (key === this.lastKey && language === this.lastLanguage) {
      return this.lastResult;
    }
    this.lastKey = key;
    this.lastLanguage = language;
    this.lastResult = this.i18n.t(key);
    return this.lastResult;
  }
}
