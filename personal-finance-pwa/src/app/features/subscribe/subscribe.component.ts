import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
  inject,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PaymentService, PRICING_PLANS, PricingPlan } from '../../core/services/payment.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';

@Component({
  selector: 'app-subscribe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-primary/5 to-background py-12 px-4">
      <div class="max-w-2xl mx-auto">

        <!-- Header -->
        <div class="text-center mb-10">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground text-2xl mb-4">
            💸
          </div>
          <h1 class="text-3xl font-bold text-foreground">Upgrade to Spenza Pro</h1>
          <p class="text-muted-foreground mt-2">Unlock advanced insights, family sync, and more.</p>
        </div>

        <!-- Feature list -->
        <div class="grid grid-cols-2 gap-3 mb-10 text-sm text-muted-foreground">
          @for (f of features; track f) {
            <div class="flex items-center gap-2">
              <span class="text-primary font-bold">✓</span> {{ f }}
            </div>
          }
        </div>

        <!-- Pricing cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          @for (plan of visiblePlans(); track plan.id) {
            <button
              (click)="selectPlan(plan)"
              [class]="selectedPlan()?.id === plan.id
                ? 'ring-2 ring-primary bg-primary/10 border-primary'
                : 'border-border bg-card hover:border-primary/40'"
              class="relative border-2 rounded-2xl p-6 text-left transition-all cursor-pointer focus:outline-none"
            >
              @if (plan.savings) {
                <span class="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                  {{ plan.savings }}
                </span>
              }
              <p class="font-semibold text-foreground text-base mb-1">{{ plan.label }}</p>
              <p class="text-2xl font-bold text-primary">
                {{ plan.priceDisplay }}<span class="text-sm font-normal text-muted-foreground">{{ plan.period }}</span>
              </p>
            </button>
          }
        </div>

        <!-- Payment button -->
        @if (errorMsg()) {
          <p class="text-destructive text-sm text-center mb-4">{{ errorMsg() }}</p>
        }

        <button
          (click)="pay()"
          [disabled]="!selectedPlan() || loading() || authorizing()"
          class="w-full py-4 rounded-2xl font-semibold text-base transition-all
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          @if (authorizing()) {
            Connecting your Spenza account...
          } @else if (loading()) {
            Processing...
          } @else if (isUpgradeMode()) {
            Upgrade Plan
          } @else {
            Pay with Razorpay
          }
        </button>

        <p class="text-xs text-center text-muted-foreground mt-4">
          Secure payments via Razorpay. Cancel anytime. By subscribing you agree to our
          <a routerLink="/terms" class="underline">Terms</a> and
          <a routerLink="/privacy" class="underline">Privacy Policy</a>.
        </p>

        <p class="text-center mt-6">
          <a routerLink="/" class="text-sm text-primary hover:underline">Continue with Free plan</a>
        </p>

        <!-- Restore subscription for users who paid but weren't activated -->
        <div class="mt-8 pt-6 border-t border-border">
          <p class="text-xs text-center text-muted-foreground mb-3">Already paid but not activated?</p>
          @if (!showRestore()) {
            <button
              (click)="showRestore.set(true)"
              class="w-full py-2 text-sm text-primary hover:underline"
            >
              Restore my subscription
            </button>
          } @else {
            <div class="flex gap-2">
              <input
                #subIdInput
                type="text"
                placeholder="Razorpay subscription ID (sub_...)"
                class="flex-1 px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
              <button
                (click)="restore(subIdInput.value)"
                [disabled]="restoring()"
                class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl disabled:opacity-50"
              >
                {{ restoring() ? '…' : 'Restore' }}
              </button>
            </div>
            @if (restoreMsg()) {
              <p class="text-xs text-center mt-2" [class]="restoreSuccess() ? 'text-success' : 'text-destructive'">
                {{ restoreMsg() }}
              </p>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class SubscribeComponent implements OnInit {
  protected readonly payService = inject(PaymentService);
  private readonly authService = inject(AuthService);
  protected readonly subscriptionService = inject(SubscriptionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly plans = PRICING_PLANS;
  protected readonly selectedPlan = signal<PricingPlan | null>(PRICING_PLANS[0]);
  protected readonly loading = signal(false);
  protected readonly authorizing = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly showRestore = signal(false);
  protected readonly restoring = signal(false);
  protected readonly restoreMsg = signal<string | null>(null);
  protected readonly restoreSuccess = signal(false);
  protected readonly isUpgradeMode = signal(false);
  protected readonly currentPlanType = signal<'monthly' | 'yearly' | null>(null);
  protected readonly visiblePlans = computed(() =>
    this.isUpgradeMode()
      ? this.plans.filter(p => p.planType !== this.currentPlanType())
      : this.plans
  );

  protected readonly features = [
    'Advanced spending insights',
    'Family sync mode',
    'Receipt scanner (OCR)',
    'CSV & Sheets export',
    'Custom budget limits',
    'Priority support',
  ];

  async ngOnInit(): Promise<void> {
    const handoff = this.route.snapshot.queryParamMap.get('handoff');
    if (handoff) {
      this.authorizing.set(true);
      this.location.replaceState('/subscribe');
      try {
        await this.authService.redeemSubscriptionHandoff(handoff);
      } catch (err) {
        this.errorMsg.set(err instanceof Error ? err.message : 'Could not authorize this subscription link.');
      } finally {
        this.authorizing.set(false);
      }
    }

    await this.subscriptionService.waitUntilLoaded();
    const status = this.subscriptionService.status();
    if (status.tier === 'pro' && status.isActive) {
      this.isUpgradeMode.set(true);
      this.currentPlanType.set(status.planType);
      const otherPlan = this.plans.find(p => p.planType !== status.planType);
      if (otherPlan) this.selectedPlan.set(otherPlan);
    }
  }

  protected selectPlan(plan: PricingPlan): void {
    this.selectedPlan.set(plan);
    this.errorMsg.set(null);
  }

  protected async restore(subscriptionId: string): Promise<void> {
    if (!subscriptionId.trim() || this.restoring()) return;
    this.restoring.set(true);
    this.restoreMsg.set(null);
    try {
      await this.payService.restoreSubscription(subscriptionId);
      this.restoreSuccess.set(true);
      this.restoreMsg.set('Subscription restored! Redirecting…');
      await this.router.navigate(['/'], { replaceUrl: true });
    } catch (err) {
      this.restoreSuccess.set(false);
      this.restoreMsg.set(err instanceof Error ? err.message : 'Restore failed. Please try again.');
    } finally {
      this.restoring.set(false);
    }
  }

  protected async pay(): Promise<void> {
    const plan = this.selectedPlan();
    if (!plan || this.loading()) return;

    this.loading.set(true);
    this.errorMsg.set(null);

    try {
      const idToken = await this.authService.ensureFirebaseIdToken();
      await this.payService.openRazorpay(plan, idToken, this.authService.userEmail());
      await this.router.navigate(['/'], { replaceUrl: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed. Please try again.';
      if (msg !== 'Payment cancelled') this.errorMsg.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
