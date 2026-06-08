import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconData,
  LucideIconProvider,
  LUCIDE_ICONS,
  CalendarDays,
  CalendarRange,
  SlidersHorizontal,
  WalletCards,
  LayoutDashboard,
  Settings,
} from 'lucide-angular';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { AuthService } from '../../../core/services/auth.service';
import { BackupModeService } from '../../../core/services/backup-mode.service';
import { TranslatePipe } from '../../pipes';

interface NavItem {
  path: string;
  labelKey: string;
  icon: LucideIconData;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, ThemeToggleComponent, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ CalendarDays, CalendarRange, SlidersHorizontal, WalletCards, LayoutDashboard, Settings }),
    },
  ],
  template: `
    <div class="min-h-screen flex flex-col overflow-x-hidden">

      <!-- Desktop top nav (hidden on mobile) -->
      <header class="sticky top-0 z-40 hidden min-[887px]:block">
        <div class="border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">

            <!-- Logo -->
            <a routerLink="/daily" class="flex items-center">
              <img src="/spenza-logo.svg" alt="Spenza Logo" class="h-10 w-10 object-contain" />
              <span class="text-lg font-semibold tracking-tight">
                Spen<span class="gradient-text">za</span>
              </span>
            </a>

            <!-- Nav links -->
            <nav class="flex flex-1 items-center justify-center gap-1" aria-label="Main navigation">
              @if (showNavigation()) {
                @for (item of navItems; track item.path) {
                  <a
                    [routerLink]="item.path"
                    routerLinkActive
                    #rla="routerLinkActive"
                    [routerLinkActiveOptions]="{ exact: false }"
                    [class]="rla.isActive
                      ? 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all bg-primary text-primary-foreground shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                      : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'"
                  >
                    <lucide-icon [img]="item.icon" class="h-4 w-4" aria-hidden="true" />
                    {{ item.labelKey | translate }}
                  </a>
                }
              }
            </nav>

            <app-theme-toggle />
          </div>
        </div>
      </header>

      <!-- Mobile top bar (hidden on desktop) -->
      <header class="sticky top-0 z-40 min-[887px]:hidden">
        <div class="flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl">
          <a routerLink="/daily" class="flex items-center gap-2">
            <img src="/spenza-logo.svg" alt="Spenza Logo" class="h-8 w-8 object-contain" />
            <span class="text-base font-semibold tracking-tight">
              Spen<span class="gradient-text">za</span>
            </span>
          </a>
          <app-theme-toggle />
        </div>
      </header>

      <!-- Main content -->
      <main [class]="'flex-1 overflow-x-hidden ' + (showNavigation() ? 'pb-28 min-[887px]:pb-12' : 'pb-12')">
        <div class="mx-auto w-full max-w-7xl px-4 py-6 min-[887px]:px-6 min-[887px]:py-8">
          <ng-content />
        </div>
      </main>

      <!-- Mobile bottom tab bar -->
      @if (showNavigation()) {
      <nav class="fixed inset-x-0 bottom-0 z-50 min-[887px]:hidden" aria-label="Mobile navigation">
        <div class="mx-auto mb-3 max-w-md px-3">
          <div class="glass-card flex items-center justify-around p-2">
            @for (item of navItems; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive
                #rlaBottom="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: false }"
                [class]="rlaBottom.isActive
                  ? 'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-all text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  : 'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-all text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'"
                [attr.aria-label]="item.labelKey | translate"
              >
                <span
                  [class]="rlaBottom.isActive
                    ? 'grid h-9 w-9 place-items-center rounded-xl transition-all gradient-primary text-primary-foreground shadow-glow'
                    : 'grid h-9 w-9 place-items-center rounded-xl transition-all'"
                >
                  <lucide-icon [img]="item.icon" class="h-4 w-4" aria-hidden="true" />
                </span>
                <span class="text-[10px] font-medium">{{ item.labelKey | translate }}</span>
              </a>
            }
          </div>
        </div>
      </nav>
      }

    </div>
  `,
})
export class AppShellComponent {
  readonly authService = inject(AuthService);
  private readonly backupModeService = inject(BackupModeService);
  readonly navItems: NavItem[] = [
    { path: '/daily',     labelKey: 'nav.daily',     icon: CalendarDays },
    { path: '/monthly',   labelKey: 'nav.monthly',   icon: CalendarRange },
    { path: '/limits',    labelKey: 'nav.limits',    icon: SlidersHorizontal },
    { path: '/finances',  labelKey: 'nav.finances',  icon: WalletCards },
    { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { path: '/settings',  labelKey: 'nav.settings',  icon: Settings },
  ];

  showNavigation(): boolean {
    if (!this.authService.isAuthenticated()) return false;

    const mode = this.backupModeService.getMode();
    if (mode === 'single') return true;

    return (
      mode === 'family' &&
      (!!this.backupModeService.getSharedFileId() || !!this.backupModeService.getFamilyId()) &&
      !!this.backupModeService.getOwnerRole()
    );
  }
}
