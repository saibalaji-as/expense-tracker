import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

@Pipe({
  name: 'percentageFormat',
  standalone: true,
  pure: false,
})
export class PercentageFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(value: number): string {
    return `${new Intl.NumberFormat(this.i18n.locale(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)}%`;
  }
}
