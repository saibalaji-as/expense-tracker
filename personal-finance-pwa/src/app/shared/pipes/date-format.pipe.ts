import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

@Pipe({
  name: 'dateFormat',
  standalone: true,
  pure: false,
})
export class DateFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(value: string): string {
    return new Date(value).toLocaleDateString(this.i18n.locale(), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
