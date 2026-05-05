import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'percentageFormat',
  standalone: true,
})
export class PercentageFormatPipe implements PipeTransform {
  transform(value: number): string {
    return value.toFixed(1) + '%';
  }
}
