import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
} from '@angular/core';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Bell,
  Check,
  X,
} from 'lucide-angular';
import { TranslatePipe } from '../../pipes';

@Component({
  selector: 'app-notification-disclosure',
  standalone: true,
  imports: [LucideAngularModule, TranslatePipe],
  providers: [
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Bell, Check, X }) },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Backdrop -->
    <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" aria-hidden="true"></div>

    <!-- Dialog -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-disclosure-title"
      class="fixed inset-x-4 top-1/2 z-[60] mx-auto max-w-sm -translate-y-1/2"
    >
      <div class="glass-card overflow-hidden rounded-3xl p-6">

        <!-- Bell icon -->
        <div class="mb-5 flex justify-center">
          <span class="grid h-16 w-16 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
            <lucide-icon [img]="bellIcon" class="h-8 w-8" />
          </span>
        </div>

        <!-- Title -->
        <h2
          id="notif-disclosure-title"
          class="mb-5 text-center text-xl font-bold text-foreground"
        >
          {{ 'notifDisclosure.title' | translate }}
        </h2>

        <!-- What Spenza reads -->
        <div class="mb-3 rounded-2xl border border-border bg-card/40 p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
            {{ 'notifDisclosure.whatWeRead' | translate }}
          </p>
          <ul class="space-y-2.5">
            <li class="flex items-start gap-2.5 text-sm text-muted-foreground">
              <span class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <lucide-icon [img]="checkIcon" class="h-2.5 w-2.5" />
              </span>
              {{ 'notifDisclosure.whatWeReadBullet1' | translate }}
            </li>
            <li class="flex items-start gap-2.5 text-sm text-muted-foreground">
              <span class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <lucide-icon [img]="checkIcon" class="h-2.5 w-2.5" />
              </span>
              {{ 'notifDisclosure.whatWeReadBullet2' | translate }}
            </li>
          </ul>
        </div>

        <!-- What Spenza never does -->
        <div class="mb-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
            {{ 'notifDisclosure.whatWeNever' | translate }}
          </p>
          <ul class="space-y-2.5">
            <li class="flex items-start gap-2.5 text-sm text-muted-foreground">
              <span class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <lucide-icon [img]="xIcon" class="h-2.5 w-2.5" />
              </span>
              {{ 'notifDisclosure.whatWeNeverBullet1' | translate }}
            </li>
            <li class="flex items-start gap-2.5 text-sm text-muted-foreground">
              <span class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <lucide-icon [img]="xIcon" class="h-2.5 w-2.5" />
              </span>
              {{ 'notifDisclosure.whatWeNeverBullet2' | translate }}
            </li>
          </ul>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-3">
          <button
            type="button"
            (click)="onAllow()"
            class="w-full rounded-2xl gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
          >
            {{ 'notifDisclosure.allowBtn' | translate }}
          </button>
          <button
            type="button"
            (click)="onDeny()"
            class="w-full rounded-2xl border border-border bg-card/40 px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ 'notifDisclosure.denyBtn' | translate }}
          </button>
        </div>

      </div>
    </div>
  `,
})
export class NotificationDisclosureComponent {
  @Output() allow = new EventEmitter<void>();
  @Output() deny = new EventEmitter<void>();

  readonly bellIcon = Bell;
  readonly checkIcon = Check;
  readonly xIcon = X;

  onAllow(): void {
    this.allow.emit();
  }

  onDeny(): void {
    this.deny.emit();
  }
}
