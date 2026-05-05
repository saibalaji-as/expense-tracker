import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-progress-ring',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative inline-flex items-center justify-center"
      [style.width.px]="size()"
      [style.height.px]="size()"
    >
      <svg [attr.width]="size()" [attr.height]="size()" class="-rotate-90">
        <!-- Background track -->
        <circle
          [attr.cx]="size() / 2"
          [attr.cy]="size() / 2"
          [attr.r]="r"
          [attr.stroke-width]="stroke()"
          class="fill-none stroke-muted"
        />
        <!-- Progress arc -->
        <circle
          [attr.cx]="size() / 2"
          [attr.cy]="size() / 2"
          [attr.r]="r"
          [attr.stroke-width]="stroke()"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="dashOffset"
          class="fill-none stroke-[url(#ring-grad)] transition-[stroke-dashoffset] duration-500"
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--primary)" />
            <stop offset="100%" stop-color="var(--primary-glow)" />
          </linearGradient>
        </defs>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        @if (label()) {
          <span class="text-base font-semibold leading-none">{{ label() }}</span>
        }
        @if (sub()) {
          <span class="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{{ sub() }}</span>
        }
      </div>
    </div>
  `,
})
export class ProgressRingComponent {
  readonly value = input<number>(0);
  readonly size = input<number>(80);
  readonly stroke = input<number>(8);
  readonly label = input<string>('');
  readonly sub = input<string>('');

  get clamped(): number {
    return Math.max(0, Math.min(100, this.value()));
  }

  get r(): number {
    return (this.size() - this.stroke()) / 2;
  }

  get circumference(): number {
    return 2 * Math.PI * this.r;
  }

  get dashOffset(): number {
    return this.circumference - (this.clamped / 100) * this.circumference;
  }
}
