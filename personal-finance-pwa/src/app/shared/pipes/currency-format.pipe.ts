import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';

@Pipe({
  name: 'currencyFormat',
  standalone: true,
  // Impure so it reacts to runtime locale/currency changes. PERF: transform()
  // runs on every change-detection pass for every currency binding (every list
  // row). CurrencyService now caches the Intl formatter, and we additionally
  // memoize the last (value, locale, currency) -> result here so an unchanged
  // value short-circuits before even calling format().
  pure: false,
})
export class CurrencyFormatPipe implements PipeTransform {
  constructor(
    private readonly i18n: I18nService,
    private readonly currencyService: CurrencyService,
  ) {}

  private lastValue: number | null | undefined = NaN;
  private lastLocale?: string;
  private lastCurrency?: string;
  private lastResult = '';

  transform(value: number | null | undefined): string {
    const locale = this.i18n.locale();
    const currency = this.currencyService.currency();
    if (value === this.lastValue && locale === this.lastLocale && currency === this.lastCurrency) {
      return this.lastResult;
    }
    this.lastValue = value;
    this.lastLocale = locale;
    this.lastCurrency = currency;
    this.lastResult = this.currencyService.format(value, locale, currency);
    return this.lastResult;
  }
}
