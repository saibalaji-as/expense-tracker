import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideAngularModule,
  LucideIconData,
  LucideIconProvider,
  LUCIDE_ICONS,
  Sun,
  Moon,
  Monitor,
} from 'lucide-angular';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  providers: [
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Sun, Moon, Monitor }) },
  ],
  template: `
    <div class="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1 backdrop-blur">
      @for (opt of options; track opt.value) {
        <button
          type="button"
          [attr.aria-label]="opt.label"
          [class]="themeService.theme() === opt.value
            ? 'bg-primary text-primary-foreground shadow-glow rounded-full h-8 w-8 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            : 'text-muted-foreground rounded-full h-8 w-8 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'"
          (click)="themeService.setTheme(opt.value)"
        >
          <lucide-icon [img]="opt.icon" class="h-4 w-4" />
        </button>
      }
    </div>
  `,
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);

  readonly options: { value: 'light' | 'dark' | 'system'; label: string; icon: LucideIconData }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
}
