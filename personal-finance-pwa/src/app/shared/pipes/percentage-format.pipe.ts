import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

// PERF: reuse one Intl.NumberFormat per locale instead of constructing a new one
// on every call.
const percentFormatterCache = new Map<string, Intl.NumberFormat>();
function formatterFor(locale: string): Intl.NumberFormat {
  let fmt = percentFormatterCache.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    percentFormatterCache.set(locale, fmt);
  }
  return fmt;
}

@Pipe({
  name: 'percentageFormat',
  standalone: true,
  // Impure so it reacts to a runtime locale change. PERF: previously rebuilt an
  // Intl formatter on every change-detection pass for every percentage binding.
  // Now we reuse a cached formatter and memoize the last (value, locale) -> result.
  pure: false,
})
export class PercentageFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  private lastValue = NaN;
  private lastLocale?: string;
  private lastResult = '';

  transform(value: number): string {
    const locale = this.i18n.locale();
    if (value === this.lastValue && locale === this.lastLocale) {
      return this.lastResult;
    }
    this.lastValue = value;
    this.lastLocale = locale;
    this.lastResult = `${formatterFor(locale).format(value)}%`;
    return this.lastResult;
  }
}
