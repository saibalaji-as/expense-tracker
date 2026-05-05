import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [NgClass],
  template: `
    <button
      [ngClass]="variantClasses"
      class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
      [disabled]="disabled"
      [attr.aria-disabled]="disabled"
    >
      <ng-content />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'danger' | 'ghost' = 'primary';
  @Input() disabled = false;

  get variantClasses(): string {
    switch (this.variant) {
      case 'primary':
        return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500';
      case 'danger':
        return 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500';
      case 'ghost':
        return 'bg-transparent text-gray-700 hover:bg-gray-100 border border-gray-300 focus:ring-gray-400';
    }
  }
}
