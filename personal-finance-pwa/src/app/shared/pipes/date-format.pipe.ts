import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

// PERF: Intl.DateTimeFormat construction is expensive; build one per locale and
// reuse it across every dateFormat binding in the app.
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(locale: string): Intl.DateTimeFormat {
  let fmt = dateFormatterCache.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    dateFormatterCache.set(locale, fmt);
  }
  return fmt;
}

@Pipe({
  name: 'dateFormat',
  standalone: true,
  // Impure so it reacts to a runtime locale change. PERF: previously rebuilt an
  // Intl formatter on every change-detection pass for every date binding. Now we
  // reuse a cached formatter and memoize the last (value, locale) -> result.
  pure: false,
})
export class DateFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  private lastValue?: string;
  private lastLocale?: string;
  private lastResult = '';

  transform(value: string): string {
    const locale = this.i18n.locale();
    if (value === this.lastValue && locale === this.lastLocale) {
      return this.lastResult;
    }
    this.lastValue = value;
    this.lastLocale = locale;
    this.lastResult = formatterFor(locale).format(new Date(value));
    return this.lastResult;
  }
}
