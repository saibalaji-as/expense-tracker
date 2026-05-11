import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-section-card',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="glass-card w-full min-w-0" [class]="className()">
      @if (title()) {
        <header class="flex items-start justify-between gap-4 px-5 py-4 md:px-6 md:py-5">
          <div>
            <h2 class="text-base font-semibold tracking-tight md:text-lg">{{ title() }}</h2>
            @if (description()) {
              <p class="mt-0.5 text-xs text-muted-foreground md:text-sm">{{ description() }}</p>
            }
          </div>
          <ng-content select="[action]" />
        </header>
      }
      <div
        class="px-5 pb-5 md:px-6 md:pb-6"
        [ngClass]="{ 'pt-5': !title(), 'md:pt-6': !title() }"
      >
        <ng-content />
      </div>
    </section>
  `,
})
export class SectionCardComponent {
  readonly title = input<string>('');
  readonly description = input<string>('');
  readonly className = input<string>('');
}
