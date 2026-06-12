import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-input',
  standalone: true,
  template: `
    <div class="flex flex-col gap-1">
      <label [for]="inputId" class="text-sm font-medium text-foreground">{{ label }}</label>
      <ng-content />
      @if (errorMessage) {
        <p class="text-destructive text-sm mt-1">{{ errorMessage }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputComponent {
  @Input() label = '';
  @Input() inputId = '';
  @Input() errorMessage = '';
}
