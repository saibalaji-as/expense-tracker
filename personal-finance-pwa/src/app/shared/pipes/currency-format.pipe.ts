import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { CurrencyService } from '../../core/services/currency.service';

@Pipe({
  name: 'currencyFormat',
  standalone: true,
  pure: false,
})
export class CurrencyFormatPipe implements PipeTransform {
  constructor(
    private readonly i18n: I18nService,
    private readonly currencyService: CurrencyService,
  ) {}

  transform(value: number | null | undefined): string {
    return this.currencyService.format(value, this.i18n.locale());
  }
}
