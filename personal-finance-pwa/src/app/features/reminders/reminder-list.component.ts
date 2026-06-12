import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Bell,
  BellOff,
  Plus,
  Check,
  Trash2,
  MapPin,
  Clock,
  ChevronRight,
} from 'lucide-angular';
import { ReminderService, Reminder } from '../../core/services/reminder.service';
import { AuthService } from '../../core/services/auth.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { I18nService } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../shared/pipes';

type Tab = 'active' | 'completed';

@Component({
  selector: 'app-reminder-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Bell, BellOff, Plus, Check, Trash2, MapPin, Clock, ChevronRight }),
    },
  ],
  template: `
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'reminders.title' | translate }}</h1>
          <p class="text-sm text-muted-foreground mt-0.5">{{ 'reminders.subtitle' | translate }}</p>
        </div>
        <button
          (click)="navigateToCreate()"
          class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90"
        >
          <lucide-icon name="plus" class="h-4 w-4" />
          {{ 'reminders.create' | translate }}
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex rounded-xl bg-muted p-1 gap-1">
        <button
          (click)="activeTab.set('active')"
          [class]="activeTab() === 'active'
            ? 'flex-1 rounded-lg py-2 text-sm font-medium transition-all bg-background text-foreground shadow-sm'
            : 'flex-1 rounded-lg py-2 text-sm font-medium transition-all text-muted-foreground'"
        >
          {{ 'reminders.tab.active' | translate }} ({{ activeReminders().length }})
        </button>
        <button
          (click)="activeTab.set('completed')"
          [class]="activeTab() === 'completed'
            ? 'flex-1 rounded-lg py-2 text-sm font-medium transition-all bg-background text-foreground shadow-sm'
            : 'flex-1 rounded-lg py-2 text-sm font-medium transition-all text-muted-foreground'"
        >
          {{ 'reminders.tab.completed' | translate }} ({{ completedReminders().length }})
        </button>
      </div>

      <!-- List -->
      <div class="space-y-3">
        @if (displayedReminders().length === 0) {
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <lucide-icon name="bell-off" class="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p class="text-sm text-muted-foreground">
              {{ activeTab() === 'active' ? ('reminders.empty.active' | translate) : ('reminders.empty.completed' | translate) }}
            </p>
          </div>
        }

        @for (reminder of displayedReminders(); track reminder.id) {
          <div class="glass-card rounded-xl p-4 flex items-start gap-3">

            <!-- Icon -->
            <div
              [class]="reminder.type === 'location'
                ? 'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500'
                : 'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'"
            >
              <lucide-icon [name]="reminder.type === 'location' ? 'map-pin' : 'clock'" class="h-4 w-4" />
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1 cursor-pointer" (click)="navigateToEdit(reminder.id)">
              <p class="font-medium text-foreground truncate">{{ reminder.title }}</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                @if (reminder.type === 'datetime' && reminder.remindAt) {
                  {{ formatDate(reminder.remindAt) }}
                } @else if (reminder.type === 'location' && reminder.location) {
                  {{ reminder.location.name }} &bull; {{ reminder.location.radiusKm }} km
                } @else if (reminder.status === 'expired') {
                  {{ 'reminders.expired' | translate }}
                }
              </p>
            </div>

            <!-- Actions -->
            <div class="flex shrink-0 items-center gap-1">
              @if (reminder.status === 'active') {
                <button
                  (click)="complete(reminder)"
                  [attr.aria-label]="'reminders.action.complete' | translate"
                  class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-green-500/10 hover:text-green-600"
                >
                  <lucide-icon name="check" class="h-4 w-4" />
                </button>
              }
              <button
                (click)="remove(reminder)"
                [attr.aria-label]="'reminders.action.delete' | translate"
                class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <lucide-icon name="trash-2" class="h-4 w-4" />
              </button>
            </div>

          </div>
        }
      </div>
    </div>
  `,
})
export class ReminderListComponent implements OnInit, OnDestroy {
  private readonly reminderService = inject(ReminderService);
  private readonly authService = inject(AuthService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly activeTab = signal<Tab>('active');

  readonly activeReminders = computed(() =>
    this.reminderService.reminders().filter((r) => r.status === 'active')
  );
  readonly completedReminders = computed(() =>
    this.reminderService.reminders().filter((r) => r.status !== 'active')
  );
  readonly displayedReminders = computed(() =>
    this.activeTab() === 'active' ? this.activeReminders() : this.completedReminders()
  );

  ngOnInit(): void {
    const uid = this.authService.firebaseUid();
    if (uid) void this.reminderService.start(uid);
  }

  ngOnDestroy(): void {
    // Keep service alive so other components can use it; only stop on logout
  }

  navigateToCreate(): void {
    void this.router.navigate(['/reminders/new']);
  }

  navigateToEdit(id: string): void {
    void this.router.navigate(['/reminders', id]);
  }

  async complete(reminder: Reminder): Promise<void> {
    const uid = this.authService.firebaseUid();
    if (!uid) return;
    try {
      await this.reminderService.completeReminder(uid, reminder.id);
      this.feedback.success(this.i18n.t('reminders.feedback.completed'));
    } catch {
      this.feedback.error(this.i18n.t('reminders.feedback.error'));
    }
  }

  async remove(reminder: Reminder): Promise<void> {
    const uid = this.authService.firebaseUid();
    if (!uid) return;
    try {
      await this.reminderService.deleteReminder(uid, reminder.id);
      this.feedback.success(this.i18n.t('reminders.feedback.deleted'));
    } catch {
      this.feedback.error(this.i18n.t('reminders.feedback.error'));
    }
  }

  formatDate(date: Date): string {
    return date.toLocaleString(this.i18n.locale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
