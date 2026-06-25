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
  styles: [`
    .hero-gradient {
      background: linear-gradient(135deg, oklch(0.97 0.015 280) 0%, oklch(0.99 0.005 250) 50%, oklch(0.96 0.02 305) 100%);
    }
    .feature-icon {
      width: 40px; height: 40px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.2rem; flex-shrink: 0;
    }
  `],
  template: `
    <div class="min-h-screen bg-background text-foreground">

      <!-- Nav bar -->
      <nav class="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border">
        <div class="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <app-spenza-logo [size]="32" className="rounded-lg" />
            <span class="font-bold text-base tracking-tight">Spenza</span>
          </div>
          <a
            routerLink="/daily"
            class="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition"
          >Get Started</a>
        </div>
      </nav>

      <!-- Hero -->
      <header class="hero-gradient border-b border-border">
        <div class="max-w-4xl mx-auto px-5 pt-16 pb-14 text-center">
          <div class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6 shadow-sm">
            <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
            Telecom Expense Management
          </div>
          <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Control your<br/>
            <span class="text-primary">telecom spend</span>
          </h1>
          <p class="mt-5 text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Spenza helps businesses track, optimize, and control communication costs across
            all lines, plans, and invoices — in one secure place.
          </p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              routerLink="/daily"
              class="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-90 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Open Spenza
            </a>
            <button
              type="button"
              (click)="scrollToDataUse()"
              class="inline-flex items-center rounded-xl border border-border bg-card px-7 py-3.5 text-sm font-semibold hover:bg-muted/50 transition shadow-sm"
            >How your data is used</button>
          </div>
        </div>
      </header>

      <main class="max-w-4xl mx-auto px-5 pb-20">

        <!-- Feature grid -->
        <section class="mt-12">
          <h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">What you can do</h2>
          <div class="grid gap-4 sm:grid-cols-2">

            <div class="rounded-2xl bg-card border border-border p-5 flex gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div class="feature-icon bg-primary/10 text-primary">📋</div>
              <div>
                <h3 class="font-semibold mb-1">Invoice tracking</h3>
                <p class="text-sm text-muted-foreground leading-relaxed">Monitor telecom invoices and usage across all accounts and plans in one place.</p>
              </div>
            </div>

            <div class="rounded-2xl bg-card border border-border p-5 flex gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div class="feature-icon bg-success/10 text-success">💡</div>
              <div>
                <h3 class="font-semibold mb-1">Cost optimization</h3>
                <p class="text-sm text-muted-foreground leading-relaxed">Identify unused lines, overage charges, and savings opportunities automatically.</p>
              </div>
            </div>

            <div class="rounded-2xl bg-card border border-border p-5 flex gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div class="feature-icon bg-accent text-accent-foreground">📊</div>
              <div>
                <h3 class="font-semibold mb-1">Dashboards &amp; insights</h3>
                <p class="text-sm text-muted-foreground leading-relaxed">Visualize spend trends and get actionable reports for your entire team.</p>
              </div>
            </div>

            <div class="rounded-2xl bg-card border border-border p-5 flex gap-4 shadow-sm hover:shadow-md transition-shadow">
              <div class="feature-icon bg-warning/10 text-warning-foreground">🔔</div>
              <div>
                <h3 class="font-semibold mb-1">Budgets &amp; alerts</h3>
                <p class="text-sm text-muted-foreground leading-relaxed">Set spending limits and receive alerts before costs exceed thresholds.</p>
              </div>
            </div>

          </div>
        </section>

        <!-- Trust strip -->
        <section class="mt-10 rounded-2xl border border-border bg-card p-6 flex flex-wrap gap-6 justify-around shadow-sm">
          <div class="text-center">
            <p class="text-2xl font-bold text-primary">100%</p>
            <p class="text-xs text-muted-foreground mt-0.5">Your data, your control</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-primary">0</p>
            <p class="text-xs text-muted-foreground mt-0.5">Data sold or shared</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-primary">Secure</p>
            <p class="text-xs text-muted-foreground mt-0.5">Google sign-in &amp; backup</p>
          </div>
        </section>

        <!-- Google data use -->
        <section id="data-use" class="mt-12 scroll-mt-6">
          <h2 class="text-xl font-bold mb-1">How Spenza uses your Google account data</h2>
          <p class="text-sm text-muted-foreground leading-relaxed mb-6">
            Spenza only requests the Google permissions it needs to back up and import your own
            financial data. Your data stays yours — Spenza never sells it or shares it for advertising.
          </p>

          <div class="space-y-3">

            <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div class="flex items-start gap-3">
                <div class="feature-icon bg-primary/10 text-primary mt-0.5">🔒</div>
                <div>
                  <h3 class="font-semibold">Google Drive — app data folder</h3>
                  <p class="text-xs text-muted-foreground mb-2">scope: drive.appdata</p>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    Used only to store a private backup of your own financial data in a hidden,
                    app-specific folder in your Google Drive. Not visible alongside your normal
                    Drive files, never shared with anyone. Spenza cannot access any other Drive files.
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div class="flex items-start gap-3">
                <div class="feature-icon bg-success/10 text-success mt-0.5">📄</div>
                <div>
                  <h3 class="font-semibold">Google Sheets</h3>
                  <p class="text-xs text-muted-foreground mb-2">scope: spreadsheets</p>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    Used only when you choose to import existing records from a spreadsheet you own.
                    Optional and user-initiated — Spenza does not read spreadsheets in the background
                    or access any spreadsheet you haven't explicitly selected.
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div class="flex items-start gap-3">
                <div class="feature-icon bg-accent text-accent-foreground mt-0.5">👤</div>
                <div>
                  <h3 class="font-semibold">Basic profile &amp; email</h3>
                  <p class="text-xs text-muted-foreground mb-2">scopes: openid, email, profile</p>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    Used to sign you in securely and identify your account.
                    Spenza does not use your email for marketing.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>

        <!-- Footer -->
        <footer class="mt-14 text-center text-sm text-muted-foreground border-t border-border pt-8">
          <div class="flex items-center justify-center gap-2 mb-3">
            <app-spenza-logo [size]="24" className="rounded-md" />
            <span class="font-semibold text-foreground">Spenza</span>
          </div>
          <p>
            <a routerLink="/privacy" class="text-primary hover:underline">Privacy Policy</a>
            &nbsp;·&nbsp;
            <a routerLink="/terms" class="text-primary hover:underline">Terms of Service</a>
          </p>
          <p class="mt-3 text-xs">&copy; {{ year }} Spenza. All rights reserved.</p>
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
