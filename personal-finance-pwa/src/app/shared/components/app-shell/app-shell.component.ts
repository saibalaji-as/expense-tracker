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
  Bell,
} from 'lucide-angular';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { SpenzaLogoComponent } from '../spenza-logo/spenza-logo.component';
import { AuthService } from '../../../core/services/auth.service';
import { BackupModeService } from '../../../core/services/backup-mode.service';
import { TranslatePipe } from '../../pipes';

interface NavItem {
  path: string;
  labelKey: string;
  shortLabel: string;
  icon: LucideIconData;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, ThemeToggleComponent, TranslatePipe, SpenzaLogoComponent],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ CalendarDays, CalendarRange, SlidersHorizontal, WalletCards, LayoutDashboard, Settings, Bell }),
    },
  ],
  styles: [`
    :host { display: contents; }

    /* ══════════════════════════════════════════════════════════
       PORTRAIT — Full-width gradient bottom nav
       Active icon lifts out of bar; its label stays inside bar.
    ══════════════════════════════════════════════════════════ */

    .bottom-nav-bar {
      /* gradient uses the app primary colours */
      background: var(--gradient-primary);
      /* soft top shadow to lift the bar */
      box-shadow: 0 -4px 24px -4px color-mix(in oklab, var(--primary) 35%, transparent);
      overflow: visible;           /* bumped icon renders above the bar */
      padding-bottom: env(safe-area-inset-bottom, 0px);
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
    }

    .bottom-nav-inner {
      display: flex;
      align-items: flex-end;
      /* icon zone (34) + label zone (11) + bottom pad (10) = 55  +  bump head-room = 62 */
      height: 62px;
      overflow: visible;
    }

    /* ── Each tab item ── */
    .tab-item {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 10px;
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
      /* spring bump */
      transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    /* Active: whole column lifts 18px above bar */
    .tab-item.active {
      transform: translateY(-18px);
    }

    /* ── Icon bubble ── */
    .tab-icon {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      transition:
        width  0.30s cubic-bezier(0.34, 1.56, 0.64, 1),
        height 0.30s cubic-bezier(0.34, 1.56, 0.64, 1),
        border-radius 0.22s ease,
        background    0.22s ease,
        box-shadow    0.22s ease;
      /* inactive: small, no bg — icon is white on the gradient bar */
      width: 34px;
      height: 34px;
      border-radius: 10px;
    }
    /* active: solid primary colour bubble, no border, floating bob */
    .tab-icon.active {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: var(--gradient-primary);
      box-shadow: 0 6px 18px -4px color-mix(in oklab, var(--primary) 55%, transparent);
      animation: icon-float 2s ease-in-out infinite;
    }

    @keyframes icon-float {
      0%   { transform: translateY(0px);   }
      50%  { transform: translateY(-4px);  }
      100% { transform: translateY(0px);   }
    }

    /* ── Label ── */
    .tab-label {
      margin-top: 3px;
      font-size: 9.5px;
      font-weight: 700;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 46px;
      color: rgba(255, 255, 255, 0.85);
      transition: color 0.2s ease;
      letter-spacing: 0.01em;
    }
    .tab-label.active {
      color: #ffffff;
      font-weight: 900;
    }


    /* ══════════════════════════════════════════════════════════
       WAVE PEAK — localized bump behind the active tab
       Smooth quadratic-bezier wave that rises above the bar
       only at the selected tab.  Hidden otherwise.
    ══════════════════════════════════════════════════════════ */

    .wave-peak {
      position: absolute;
      top: 2px;
      left: calc(50% - 28.5px);
      width: 56px;
      height: 28px;
      z-index: -1;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      fill: var(--primary);
      filter: drop-shadow(0 4px 10px color-mix(in oklab, var(--primary) 25%, transparent));
    }

    .tab-item.active .wave-peak {
      opacity: 1;
      animation: wave-peak-pulse 3s ease-in-out infinite;
    }

    @keyframes wave-peak-pulse {
      0%, 100% { transform: scaleY(1) translateY(0); }
      50%      { transform: scaleY(1.06) translateY(-1.5px); }
    }


    /* ══════════════════════════════════════════════════════════
       LANDSCAPE (mobile < 887px) — Gradient left side rail
    ══════════════════════════════════════════════════════════ */

    .side-rail {
      background: var(--gradient-primary);
      border-right: none;
      box-shadow: 4px 0 20px -4px color-mix(in oklab, var(--primary) 35%, transparent);
    }

    .side-rail-item {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      color: rgba(255, 255, 255, 0.65);
      transition: background 0.22s ease, color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
    }
    .side-rail-item.active {
      background: var(--primary);
      color: #ffffff;
      box-shadow: 0 4px 14px -3px color-mix(in oklab, var(--primary) 55%, transparent);
      transform: scale(1.10);
    }
    .side-rail-item:not(.active):hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }


    /* ══════════════════════════════════════════════════════════
       RESPONSIVE VISIBILITY
    ══════════════════════════════════════════════════════════ */

    @media (orientation: portrait) and (max-width: 886px) {
      .mobile-bottom-nav { display: block; }
      .mobile-side-rail  { display: none !important; }
    }

    @media (orientation: landscape) and (max-width: 886px) {
      .mobile-bottom-nav { display: none !important; }
      .mobile-side-rail  { display: flex; }
      .landscape-pl      { padding-left: 60px; }
    }

    @media (min-width: 887px) {
      .mobile-bottom-nav { display: none !important; }
      .mobile-side-rail  { display: none !important; }
      .landscape-pl      { padding-left: 0; }
    }
  `],
  template: `
    <div class="min-h-screen flex flex-col overflow-x-hidden">

      <!-- ── Desktop top nav ──────────────────────────────────── -->
      <header class="sticky top-0 z-40 hidden min-[887px]:block">
        <div class="border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">

            <a routerLink="/daily" class="flex items-center gap-1">
              <app-spenza-logo [size]="40" />
              <span class="text-lg font-semibold tracking-tight">
                Spen<span class="gradient-text">za</span>
              </span>
            </a>

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

      <!-- ── Mobile top bar ────────────────────────────────────── -->
      <header class="sticky top-0 z-40 min-[887px]:hidden">
        <div class="flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl">
          <a routerLink="/daily" class="flex items-center gap-2">
            <app-spenza-logo [size]="32" />
            <span class="text-base font-semibold tracking-tight">
              Spen<span class="gradient-text">za</span>
            </span>
          </a>
          <app-theme-toggle />
        </div>
      </header>

      <!-- ── Main content ──────────────────────────────────────── -->
      <main [class]="showNavigation()
          ? 'flex-1 overflow-x-hidden pb-24 landscape-pl min-[887px]:pb-12 min-[887px]:pl-0'
          : 'flex-1 overflow-x-hidden pb-12'">
        <div class="mx-auto w-full max-w-7xl px-4 py-6 min-[887px]:px-6 min-[887px]:py-8">
          <ng-content />
        </div>
      </main>


      @if (showNavigation()) {

        <!-- ══ PORTRAIT: Edge-to-edge gradient bump nav ════════════ -->
        <nav
          class="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 bottom-nav-bar"
          aria-label="Mobile navigation"
        >
          <div class="bottom-nav-inner">
            @for (item of navItems; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive
                #rb="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: false }"
                [attr.aria-label]="item.shortLabel"
                class="tab-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
                [class.active]="rb.isActive"
                (click)="onNavTap($event)"
              >
                <!-- Localized wave peak — only visible on the active tab -->
                <svg class="wave-peak" viewBox="0 0 56 28" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0,28 Q14,2 28,2 Q42,2 56,28 Z" />
                </svg>
                <!--
                  Icon bubble:
                  • Inactive → small, icon white/translucent on the gradient bar
                  • Active   → white circle, icon uses primary colour (for any theme)
                -->
                <span
                  class="tab-icon"
                  [class.active]="rb.isActive"
                  aria-hidden="true"
                >
                  <lucide-icon
                    [img]="item.icon"
                    style="color: #ffffff; stroke-width: 2.5;"
                    [class]="rb.isActive ? 'h-[18px] w-[18px]' : 'h-[15px] w-[15px] opacity-85'"
                  />
                </span>

                <!-- Label — always shown; white, brighter when active -->
                <span
                  class="tab-label"
                  [class.active]="rb.isActive"
                >{{ item.shortLabel }}</span>
              </a>
            }
          </div>
        </nav>


        <!-- ══ LANDSCAPE: Gradient left side rail ═══════════════════ -->
        <nav
          class="mobile-side-rail side-rail fixed left-0 top-0 bottom-0 z-50 flex-col items-center justify-center gap-1.5"
          style="width: 56px;"
          aria-label="Mobile navigation"
        >
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive
              #rs="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: false }"
              [attr.aria-label]="item.shortLabel"
              class="side-rail-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              [class.active]="rs.isActive"
              (click)="onNavTap($event)"
            >
              <lucide-icon
                [img]="item.icon"
                class="h-[15px] w-[15px]"
                style="stroke-width: 2.5;"
                aria-hidden="true"
              />
            </a>
          }
        </nav>

      }

    </div>
  `,
})
export class AppShellComponent {
  readonly authService = inject(AuthService);
  private readonly backupModeService = inject(BackupModeService);

  readonly navItems: NavItem[] = [
    { path: '/daily',     labelKey: 'nav.daily',     shortLabel: 'Daily',    icon: CalendarDays },
    { path: '/monthly',   labelKey: 'nav.monthly',   shortLabel: 'Monthly',  icon: CalendarRange },
    { path: '/limits',    labelKey: 'nav.limits',    shortLabel: 'Limits',   icon: SlidersHorizontal },
    { path: '/finances',  labelKey: 'nav.finances',  shortLabel: 'Finance',  icon: WalletCards },
    { path: '/dashboard', labelKey: 'nav.dashboard', shortLabel: 'Dash',     icon: LayoutDashboard },
    { path: '/reminders', labelKey: 'nav.reminders', shortLabel: 'Alerts',   icon: Bell },
    { path: '/settings',  labelKey: 'nav.settings',  shortLabel: 'Settings', icon: Settings },
  ];

  /** Store the tap coordinates as CSS custom properties so the View Transition
   *  wave animation originates from the tapped nav icon. */
  onNavTap(event: MouseEvent | TouchEvent): void {
    let x: number;
    let y: number;

    if (event instanceof TouchEvent && event.touches.length > 0) {
      x = event.touches[0].clientX;
      y = event.touches[0].clientY;
    } else if (event instanceof MouseEvent) {
      x = event.clientX;
      y = event.clientY;
    } else {
      return;
    }

    const root = document.documentElement;
    root.style.setProperty('--nav-tap-x', `${x}px`);
    root.style.setProperty('--nav-tap-y', `${y}px`);
  }

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
