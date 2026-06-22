import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SpenzaLogoComponent } from '../../shared/components/spenza-logo/spenza-logo.component';

/**
 * Public, unauthenticated landing page served at the root URL (`/`).
 *
 * This page exists so that anyone — including a Google OAuth verification
 * reviewer or a search crawler — can read what Spenza is and how it uses the
 * Google account data it requests, WITHOUT signing in. It is intentionally
 * NOT behind authGuard/setupGuard and is rendered shell-less (see app.html).
 *
 * Signed-in users are bounced straight to the app so they never see it.
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SpenzaLogoComponent],
  template: `
    <div class="min-h-screen bg-background text-foreground">
      <!-- Hero -->
      <header class="max-w-3xl mx-auto px-5 pt-14 pb-8 text-center">
        <div class="flex justify-center mb-5">
          <app-spenza-logo [size]="72" className="rounded-2xl shadow-sm" />
        </div>
        <h1 class="text-4xl font-bold tracking-tight">Spenza</h1>
        <p class="mt-4 text-lg text-muted-foreground leading-relaxed">
          Spenza is a personal and family finance tracker. It helps you record daily
          and monthly expenses, track your accounts and net worth, manage debts and
          EMIs, set budgets and spending limits, and understand where your money goes
          through a clear dashboard of insights — all in one private, secure place.
        </p>
        <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            routerLink="/daily"
            class="inline-flex items-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition"
          >Open Spenza</a>
          <button
            type="button"
            (click)="scrollToDataUse()"
            class="inline-flex items-center rounded-xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted/50 transition"
          >How your data is used</button>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-5 pb-16">
        <!-- What you can do -->
        <section class="grid gap-4 sm:grid-cols-2 mt-4">
          <div class="rounded-2xl bg-card p-5 shadow-sm">
            <h2 class="font-semibold mb-1">Expenses</h2>
            <p class="text-sm text-muted-foreground leading-relaxed">Log daily and monthly spending and keep a running picture of your cash flow.</p>
          </div>
          <div class="rounded-2xl bg-card p-5 shadow-sm">
            <h2 class="font-semibold mb-1">Accounts &amp; net worth</h2>
            <p class="text-sm text-muted-foreground leading-relaxed">Track balances across your accounts and watch your net worth over time.</p>
          </div>
          <div class="rounded-2xl bg-card p-5 shadow-sm">
            <h2 class="font-semibold mb-1">Debts &amp; EMIs</h2>
            <p class="text-sm text-muted-foreground leading-relaxed">Keep tabs on loans and EMI schedules so nothing slips through.</p>
          </div>
          <div class="rounded-2xl bg-card p-5 shadow-sm">
            <h2 class="font-semibold mb-1">Budgets &amp; insights</h2>
            <p class="text-sm text-muted-foreground leading-relaxed">Set spending limits and review dashboard insights for personal or family finances.</p>
          </div>
        </section>

        <!-- How Spenza uses your Google account data -->
        <section id="data-use" class="mt-12 rounded-2xl bg-card p-6 shadow-sm scroll-mt-6">
          <h2 class="text-2xl font-bold mb-2">How Spenza uses your Google account data</h2>
          <p class="text-sm text-muted-foreground leading-relaxed mb-6">
            Spenza only requests the Google permissions it needs to back up and import
            your own financial data. Your data stays yours — Spenza never sells it or
            shares it for advertising.
          </p>

          <div class="space-y-6">
            <div>
              <h3 class="font-semibold">Google Drive — app data folder
                <span class="block text-xs font-normal text-muted-foreground mt-0.5">scope: drive.appdata</span>
              </h3>
              <p class="text-sm text-muted-foreground leading-relaxed mt-1">
                Used only to store a private backup of your own financial data in a hidden,
                app-specific folder in your Google Drive. This folder is not visible alongside
                your normal Drive files, is not human-readable, and is never shared with anyone.
                Spenza cannot see, read, or touch any of your other Drive files with this
                permission — only the backup it created.
              </p>
            </div>

            <div>
              <h3 class="font-semibold">Google Sheets
                <span class="block text-xs font-normal text-muted-foreground mt-0.5">scope: spreadsheets</span>
              </h3>
              <p class="text-sm text-muted-foreground leading-relaxed mt-1">
                Used only when you choose to import existing records into Spenza. If you point
                Spenza at a Google Sheets spreadsheet that you own, Spenza reads the expense rows
                from that spreadsheet so it can migrate them into your Spenza account. This is an
                optional, user-initiated action — Spenza does not read your spreadsheets in the
                background and does not access spreadsheets you have not explicitly selected.
              </p>
            </div>

            <div>
              <h3 class="font-semibold">Basic profile &amp; email
                <span class="block text-xs font-normal text-muted-foreground mt-0.5">scopes: openid, email, profile</span>
              </h3>
              <p class="text-sm text-muted-foreground leading-relaxed mt-1">
                Used to sign you in securely and identify your account. Spenza does not use your
                email for marketing.
              </p>
            </div>
          </div>
        </section>

        <!-- Legal -->
        <footer class="mt-10 text-center text-sm text-muted-foreground">
          <p>
            Read our
            <a routerLink="/privacy" class="text-primary hover:underline">Privacy Policy</a>
            and
            <a routerLink="/terms" class="text-primary hover:underline">Terms of Service</a>.
          </p>
          <p class="mt-4 text-xs">&copy; {{ year }} Spenza. All rights reserved.</p>
        </footer>
      </main>
    </div>
  `,
})
export class WelcomeComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly year = new Date().getFullYear();

  async ngOnInit(): Promise<void> {
    // Signed-in visitors go straight to the app; the landing page is only for
    // logged-out visitors (and reviewers/crawlers). The landing markup still
    // renders immediately in the DOM, so it is visible without auth.
    await this.authService.sessionRestored;
    if (this.authService.isAuthenticated()) {
      await this.router.navigate(['/daily']);
    }
  }

  // The app uses hash-based routing, so an `href="#data-use"` anchor would be
  // treated as a route change (and fall through to the `**` redirect). Scroll
  // the section into view manually instead.
  scrollToDataUse(): void {
    document.getElementById('data-use')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
