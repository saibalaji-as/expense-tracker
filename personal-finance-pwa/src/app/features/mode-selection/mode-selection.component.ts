import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, User, Users, Lock } from 'lucide-angular';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TranslatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-mode-selection',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, RouterLink, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ User, Users, Lock }),
    },
  ],
  template: `
    <div class="min-h-[50vh] flex items-center justify-center p-6">
      <div class="w-full max-w-lg">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'mode.title' | translate }}</h1>
          <p class="text-muted-foreground text-sm">{{ 'mode.description' | translate }}</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- Single User -->
          <button
            type="button"
            (click)="onSelectSingle()"
            class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl text-left transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Single User mode"
          >
            <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
              <lucide-icon name="user" class="h-7 w-7" />
            </span>
            <div class="text-center">
              <p class="font-semibold text-base mb-1">{{ 'mode.single.title' | translate }}</p>
              <p class="text-xs text-muted-foreground">{{ 'mode.single.description' | translate }}</p>
            </div>
          </button>

          <!-- Family / Shared -->
          <button
            type="button"
            (click)="onSelectFamily()"
            class="relative glass-card flex flex-col items-center gap-4 p-6 rounded-2xl text-left transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Family / Shared mode"
          >
            @if (!subscriptionService.isPro()) {
              <span class="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                <lucide-icon name="lock" class="h-2.5 w-2.5" /> Pro
              </span>
            }
            <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
              <lucide-icon name="users" class="h-7 w-7" />
            </span>
            <div class="text-center">
              <p class="font-semibold text-base mb-1">{{ 'mode.family.title' | translate }}</p>
              <p class="text-xs text-muted-foreground">{{ 'mode.family.description' | translate }}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ModeSelectionComponent implements OnInit {
  private readonly backupModeService = inject(BackupModeService);
  private readonly router = inject(Router);
  readonly subscriptionService = inject(SubscriptionService);

  ngOnInit(): void {
    // If mode is already set, skip this screen
    if (this.backupModeService.getMode() !== null) {
      void this.router.navigate(['/daily']);
    }
  }

  async onSelectSingle(): Promise<void> {
    await this.backupModeService.setMode('single');
    // Single mode uses drive.appdata — current token already has that scope,
    // so we can go straight to the auth callback to bootstrap Drive.
    await this.router.navigate(['/auth/callback']);
  }

  async onSelectFamily(): Promise<void> {
    if (!this.subscriptionService.isPro()) {
      await this.router.navigate(['/subscribe']);
      return;
    }
    await this.router.navigate(['/family-setup']);
  }
}
