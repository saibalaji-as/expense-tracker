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
        return 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary';
      case 'danger':
        return 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive';
      case 'ghost':
        return 'bg-transparent text-foreground hover:bg-muted border border-border focus:ring-muted-foreground';
    }
  }
}
