import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  Inbox,
  Users,
} from 'lucide-angular';
import { Preferences } from '@capacitor/preferences';
import { PENDING_CIRCLE_JOIN_KEY } from '../../../core/models/circle.model';
import { SpenzaLogoComponent } from '../spenza-logo/spenza-logo.component';
import { CreditCardPickerComponent } from '../credit-card-picker/credit-card-picker.component';
import { AuthService } from '../../../core/services/auth.service';
import { BackupModeService } from '../../../core/services/backup-mode.service';
import { ExpenseStore, noCcAccountForExpense$ } from '../../../core/services/expense-store.service';
import { CircleSyncService } from '../../../core/services/circle-sync.service';
import { NotificationInboxService } from '../../../core/services/notification-inbox.service';
import { UserFeedbackService } from '../../../core/services/user-feedback.service';
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
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, TranslatePipe, SpenzaLogoComponent, CreditCardPickerComponent],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ CalendarDays, CalendarRange, SlidersHorizontal, WalletCards, LayoutDashboard, Settings, Bell, Inbox, Users }),
    },
  ],
  styles: [`
    :host { display: contents; }

    /* ══════════════════════════════════════════════════════════
       PORTRAIT — Floating glass pill nav
       Detached rounded bar, blur + glow, sliding gradient pill
       behind the active tab.
    ══════════════════════════════════════════════════════════ */

    .float-nav {
      position: fixed;
      left: 14px;
      right: 14px;
      bottom: calc(14px + env(safe-area-inset-bottom, 0px));
      z-index: 50;
      border-radius: 999px;
      background: color-mix(in oklab, var(--background) 72%, transparent);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
      backdrop-filter: blur(22px) saturate(160%);
      border: 1px solid color-mix(in oklab, var(--primary) 22%, var(--border));
      box-shadow:
        0 12px 32px -8px color-mix(in oklab, var(--primary) 35%, transparent),
        0 2px 8px rgba(0, 0, 0, 0.10);
      padding: 6px;
    }

    .float-nav-inner {
      position: relative;
      display: flex;
    }

    /* ── Sliding gradient pill behind the active tab ── */
    .nav-pill {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: calc(100% / 5);
      border-radius: 999px;
      background: var(--gradient-primary);
      box-shadow: 0 6px 18px -4px color-mix(in oklab, var(--primary) 60%, transparent);
      transition:
        transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
        opacity 0.25s ease;
      pointer-events: none;
    }
    .nav-pill.hidden-pill { opacity: 0; }

    /* ── Tab item ── */
    .float-tab {
      position: relative;
      z-index: 1;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      height: 56px;
      border-radius: 999px;
      text-decoration: none;
      color: var(--muted-foreground);
      -webkit-tap-highlight-color: transparent;
      transition: color 0.25s ease;
    }
    .float-tab.active { color: #ffffff; }
    .float-tab:not(.active):active .float-tab-icon { transform: scale(0.88); }

    .float-tab-icon {
      display: grid;
      place-items: center;
      transition: transform 0.2s ease;
    }
    .float-tab.active .float-tab-icon {
      animation: tab-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes tab-pop {
      0%   { transform: scale(0.7); }
      60%  { transform: scale(1.18); }
      100% { transform: scale(1); }
    }

    .float-tab-label {
      font-size: 9.5px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 56px;
    }

    /* ── Top-bar quick actions (Alerts / Settings) ── */
    .top-icon-btn {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 999px;
      color: var(--muted-foreground);
      transition: color 0.2s ease, background 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .top-icon-btn.active {
      color: var(--primary);
      background: color-mix(in oklab, var(--primary) 12%, transparent);
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
          </div>
        </div>
      </header>

      <!-- ── Mobile top bar ────────────────────────────────────── -->
      <header class="sticky top-0 z-40 min-[887px]:hidden">
        <div class="flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl">
          <a routerLink="/daily" class="flex items-center gap-2">
            <span class="text-base font-semibold tracking-tight">
              Spen<span class="gradient-text">za</span>
            </span>
          </a>
          <div class="flex items-center gap-1">
            @if (showNavigation()) {
              <a
                routerLink="/splits"
                routerLinkActive
                #raSplits="routerLinkActive"
                class="top-icon-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                [class.active]="raSplits.isActive"
                aria-label="Splits"
              >
                <lucide-icon [img]="usersIcon" class="h-5 w-5" style="stroke-width: 2.25;" aria-hidden="true" />
              </a>
              <a
                routerLink="/notifications"
                routerLinkActive
                #raInbox="routerLinkActive"
                class="top-icon-btn relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                [class.active]="raInbox.isActive"
                aria-label="Notifications"
              >
                <lucide-icon [img]="inboxIcon" class="h-5 w-5" style="stroke-width: 2.25;" aria-hidden="true" />
                @if (notificationInbox.pendingCount() > 0) {
                  <span
                    class="absolute right-0.5 top-0.5 grid min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white"
                    aria-hidden="true"
                  >{{ notificationInbox.pendingCount() > 9 ? '9+' : notificationInbox.pendingCount() }}</span>
                }
              </a>
              <a
                routerLink="/reminders"
                routerLinkActive
                #raAlerts="routerLinkActive"
                class="top-icon-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                [class.active]="raAlerts.isActive"
                aria-label="Alerts"
              >
                <lucide-icon [img]="bellIcon" class="h-5 w-5" style="stroke-width: 2.25;" aria-hidden="true" />
              </a>
              <a
                routerLink="/settings"
                routerLinkActive
                #raSettings="routerLinkActive"
                class="top-icon-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                [class.active]="raSettings.isActive"
                aria-label="Settings"
              >
                <lucide-icon [img]="settingsIcon" class="h-5 w-5" style="stroke-width: 2.25;" aria-hidden="true" />
              </a>
            }
          </div>
        </div>
      </header>

      <!-- ── Main content ──────────────────────────────────────── -->
      <main [class]="showNavigation()
          ? 'flex-1 overflow-x-hidden pb-28 landscape-pl min-[887px]:pb-12 min-[887px]:pl-0'
          : 'flex-1 overflow-x-hidden pb-12'">
        <div class="mx-auto w-full max-w-7xl px-4 py-6 min-[887px]:px-6 min-[887px]:py-8">
          <ng-content />
        </div>
      </main>


      @if (showNavigation()) {

        <!-- ══ PORTRAIT: Floating glass pill nav ═══════════════════ -->
        <nav class="mobile-bottom-nav float-nav" aria-label="Mobile navigation">
          <div class="float-nav-inner">

            <!-- Sliding gradient pill -->
            <span
              class="nav-pill"
              [class.hidden-pill]="activeMobileIndex() < 0"
              [style.transform]="'translateX(' + (activeMobileIndex() < 0 ? 0 : activeMobileIndex()) * 100 + '%)'"
              aria-hidden="true"
            ></span>

            @for (item of mobileNavItems; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive
                #rb="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: false }"
                [attr.aria-label]="item.shortLabel"
                class="float-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                [class.active]="rb.isActive"
                (click)="onNavTap($event)"
              >
                <span class="float-tab-icon" aria-hidden="true">
                  <lucide-icon
                    [img]="item.icon"
                    [class]="rb.isActive ? 'h-[19px] w-[19px]' : 'h-[17px] w-[17px]'"
                    style="stroke-width: 2.5;"
                  />
                </span>
                <span class="float-tab-label">{{ item.shortLabel }}</span>
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
          @for (item of mobileNavItems; track item.path) {
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

    <!-- ── Multi-CC picker: shown globally when a CC expense needs assignment ── -->
    @if (expenseStore.pendingCcExpenses().length > 0) {
      <app-credit-card-picker />
    }
  `,
})
export class AppShellComponent {
  readonly authService = inject(AuthService);
  readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly router = inject(Router);
  private readonly feedback = inject(UserFeedbackService);

  readonly notificationInbox = inject(NotificationInboxService);
  private readonly circleSync = inject(CircleSyncService);

  readonly bellIcon = Bell;
  readonly settingsIcon = Settings;
  readonly inboxIcon = Inbox;
  readonly usersIcon = Users;



  /** Full set — desktop top nav. */
  readonly navItems: NavItem[] = [
    { path: '/daily',     labelKey: 'nav.daily',     shortLabel: 'Daily',    icon: CalendarDays },
    { path: '/monthly',   labelKey: 'nav.monthly',   shortLabel: 'Monthly',  icon: CalendarRange },
    { path: '/limits',    labelKey: 'nav.limits',    shortLabel: 'Limits',   icon: SlidersHorizontal },
    { path: '/finances',  labelKey: 'nav.finances',  shortLabel: 'Finance',  icon: WalletCards },
    { path: '/dashboard', labelKey: 'nav.dashboard', shortLabel: 'Dash',     icon: LayoutDashboard },
    { path: '/splits',    labelKey: 'nav.splits',    shortLabel: 'Splits',   icon: Users },
    { path: '/notifications', labelKey: 'nav.notifications', shortLabel: 'Inbox', icon: Inbox },
    { path: '/reminders', labelKey: 'nav.reminders', shortLabel: 'Alerts',   icon: Bell },
    { path: '/settings',  labelKey: 'nav.settings',  shortLabel: 'Settings', icon: Settings },
  ];

  /** Trimmed set — mobile bottom pill + landscape rail.
   *  Alerts & Settings live in the mobile top bar. */
  readonly mobileNavItems: NavItem[] = [
    { path: '/daily',     labelKey: 'nav.daily',     shortLabel: 'Daily',    icon: CalendarDays },
    { path: '/monthly',   labelKey: 'nav.monthly',   shortLabel: 'Monthly',  icon: CalendarRange },
    { path: '/limits',    labelKey: 'nav.limits',    shortLabel: 'Limits',   icon: SlidersHorizontal },
    { path: '/finances',  labelKey: 'nav.finances',  shortLabel: 'Finance',  icon: WalletCards },
    { path: '/dashboard', labelKey: 'nav.dashboard', shortLabel: 'Dash',     icon: LayoutDashboard },
  ];

  /** Index of the active mobile tab; -1 when current route isn't in the pill
   *  (e.g. /reminders or /settings) so the highlight fades out. */
  readonly activeMobileIndex = signal(this.indexForUrl(this.router.url));

  constructor() {
    // Populate the notification-inbox badge; the /notifications screen
    // reloads on open, so this initial read keeps the count fresh enough.
    void this.notificationInbox.load();

    // Resume a Circle Link join parked before sign-in — a fresh user who
    // arrived via /join/:code lands here after auth/setup and must not need
    // to know that the Splits screen exists (docs/circle-splits-plan.md §6).
    void Preferences.get({ key: PENDING_CIRCLE_JOIN_KEY }).then((pending) => {
      if (pending.value) {
        void Preferences.remove({ key: PENDING_CIRCLE_JOIN_KEY });
        void this.router.navigate(['/join', pending.value]);
      }
    });

    // Start the circles listener app-wide: powers the Daily "Circle expense"
    // checkbox, the widget cache, widget-flush linking, and settle true-up —
    // none of which can wait for the user to open the Splits screen.
    void this.authService.sessionRestored?.then?.(() => {
      if (this.authService.isAuthenticated()) {
        void this.circleSync.startListening();
      }
    });

    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.activeMobileIndex.set(this.indexForUrl(event.urlAfterRedirects));
      }
    });

    noCcAccountForExpense$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.feedback.info(
        'Credit card expense saved from default account',
        'Add a credit card in the Finance tab to track it separately.',
      );
    });
  }

  private indexForUrl(url: string): number {
    return this.mobileNavItems.findIndex(
      (item) => url === item.path || url.startsWith(item.path + '/') || url.startsWith(item.path + '?'),
    );
  }

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
