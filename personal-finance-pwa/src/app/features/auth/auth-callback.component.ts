import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideAngularModule, LucideIconProvider, LUCIDE_ICONS,
  Wallet, AlertCircle, Loader2, CalendarDays, SlidersHorizontal,
  LayoutDashboard, Cloud, Users, TrendingUp, ShieldCheck, Smartphone,
  Zap, Check, ArrowRight, Star, PiggyBank, Mic, ScanLine,
  Globe, MessageSquare, CreditCard, Archive, Cpu, RefreshCw,
} from 'lucide-angular';
import { AuthService, MissingDriveScopeError } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { FamilySyncService } from '../../core/services/family-sync.service';
import { TranslatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, TranslatePipe],
  providers: [{
    provide: LUCIDE_ICONS, multi: true,
    useValue: new LucideIconProvider({
      Wallet, AlertCircle, Loader2, CalendarDays, SlidersHorizontal,
      LayoutDashboard, Cloud, Users, TrendingUp, ShieldCheck, Smartphone,
      Zap, Check, ArrowRight, Star, PiggyBank, Mic, ScanLine,
      Globe, MessageSquare, CreditCard, Archive, Cpu, RefreshCw,
    }),
  }],
  styles: [`
    /* ── Root ── */
    :host {
      display: block;
    }
    .lp { position: relative; overflow-x: hidden; }

    /* ── Blobs ── */
    .blob { position: absolute; border-radius: 50%; filter: blur(110px); pointer-events: none; z-index: 0; background: var(--gradient-primary); }
    .blob-1 { width: 640px; height: 640px; top: -200px; left: -220px; opacity: .10; animation: bA 24s ease-in-out infinite; }
    .blob-2 { width: 420px; height: 420px; top: 50%; right: -150px; opacity: .08; animation: bB 30s ease-in-out infinite; }
    @keyframes bA { 0%,100%{transform:translate(0,0)} 50%{transform:translate(50px,60px)} }
    @keyframes bB { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-40px,50px)} }

    /* ── Sections ── */
    .sec { position: relative; z-index: 1; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }

    /* ══════════════════════════════════════
       HERO
    ══════════════════════════════════════ */
    .hero { padding: 4.5rem 0 3.5rem; }
    .hero-eyebrow {
      display: inline-flex; align-items: center; gap: .5rem;
      font-size: .6875rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: var(--muted-foreground); margin-bottom: 1.5rem;
    }
    .hero-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gradient-primary); flex-shrink: 0; }
    .hero-h1 {
      font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 900;
      letter-spacing: -.04em; line-height: 1.05; margin-bottom: 1.375rem;
    }
    .hero-accent { display: block; }
    .hero-sub {
      font-size: 1.0625rem; color: var(--muted-foreground);
      line-height: 1.7; max-width: 500px; margin-bottom: 2.25rem;
    }

    /* CTA row */
    .cta-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .btn-dark {
      display: inline-flex; align-items: center; gap: .625rem;
      padding: .875rem 1.75rem; border-radius: .875rem;
      font-size: .9375rem; font-weight: 700; cursor: pointer; border: none;
      background: var(--foreground); color: var(--background);
      transition: transform .15s, opacity .15s;
    }
    .btn-dark:hover:not(:disabled) { transform: translateY(-2px); opacity: .9; }
    .btn-dark:disabled { opacity: .5; cursor: not-allowed; }
    .cta-sub { font-size: .75rem; color: var(--muted-foreground); }

    /* Hero layout */
    .hero-grid { display: grid; grid-template-columns: 1fr; gap: 3rem; align-items: flex-start; }
    @media(min-width:900px) { .hero-grid { grid-template-columns: 1fr 1fr; } }

    /* Dashboard screenshot collage */
    .collage { position: relative; display: flex; flex-direction: column; gap: .75rem; }
    .collage-row { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
    .ss-card {
      border-radius: 1rem; border: 1px solid var(--border); background: var(--card);
      overflow: hidden;
      box-shadow: 0 8px 30px -10px color-mix(in oklab, var(--primary) 18%, transparent);
      animation: fadeUp .5s ease both;
    }
    .ss-card:nth-child(2) { animation-delay: .1s; }
    .ss-card:nth-child(3) { animation-delay: .15s; }
    .ss-card:nth-child(4) { animation-delay: .2s; }
    @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

    .ss-header { padding: .75rem 1rem .5rem; border-bottom: 1px solid var(--border); }
    .ss-title { font-size: .6875rem; font-weight: 700; }
    .ss-sub { font-size: .5625rem; color: var(--muted-foreground); }
    .ss-body { padding: .625rem .875rem .875rem; }

    /* mini line chart */
    .mini-line { display: flex; align-items: flex-end; gap: 2px; height: 50px; }
    .mini-bar { flex: 1; border-radius: 2px 2px 0 0; background: color-mix(in oklab, var(--primary) 18%, transparent); }
    .mini-bar.hi { background: var(--gradient-primary); }

    /* donut ring */
    .donut-wrap { display: flex; align-items: center; gap: .75rem; }
    .donut { width: 60px; height: 60px; border-radius: 50%; flex-shrink: 0; position: relative;
      background: conic-gradient(#3b82f6 0% 48%, #f59e0b 48% 60%, #10b981 60% 72%, #8b5cf6 72% 82%, #ef4444 82% 100%); }
    .donut::after { content:''; position:absolute; inset:14px; border-radius:50%; background:var(--card); }
    .donut-legend { display: flex; flex-direction: column; gap: .2rem; }
    .donut-item { display: flex; align-items: center; gap: .3rem; font-size: .5625rem; }
    .donut-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

    /* budget rule donut */
    .budget-donut { width: 60px; height: 60px; border-radius: 50%; flex-shrink: 0; position: relative;
      background: conic-gradient(#3b82f6 0% 32%, #f97316 32% 38%, #10b981 38% 38%); }
    .budget-donut::after { content:''; position:absolute; inset:14px; border-radius:50%; background:var(--card); }

    /* ══════════════════════════════════════
       LIFECYCLE
    ══════════════════════════════════════ */
    .lifecycle { padding: 5rem 0; border-top: 1px solid var(--border); }
    .lc-grid { display: grid; grid-template-columns: 1fr; gap: 3.5rem; align-items: center; }
    @media(min-width:900px) { .lc-grid { grid-template-columns: 1fr 1fr; } }
    .lc-steps { display: flex; flex-direction: column; gap: 1.75rem; margin-top: 2rem; }
    .lc-step { display: flex; gap: 1rem; }
    .lc-step-num {
      width: 1.875rem; height: 1.875rem; border-radius: .5rem; flex-shrink: 0;
      display: grid; place-items: center; font-size: .6875rem; font-weight: 800;
      background: var(--gradient-primary); color: white;
    }
    .lc-step-title { font-size: .9375rem; font-weight: 700; margin-bottom: .25rem; }
    .lc-step-desc { font-size: .8125rem; color: var(--muted-foreground); line-height: 1.55; }

    /* ══════════════════════════════════════
       FEATURES GRID
    ══════════════════════════════════════ */
    .features { padding: 5rem 0; border-top: 1px solid var(--border); }
    .section-label { font-size: .6875rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: .5rem; }
    .section-h2 { font-size: clamp(1.625rem, 3vw, 2.25rem); font-weight: 800; letter-spacing: -.03em; margin-bottom: .625rem; }
    .section-p { font-size: .9375rem; color: var(--muted-foreground); line-height: 1.6; max-width: 560px; }

    .feats-grid {
      display: grid; gap: 1px;
      grid-template-columns: repeat(2, 1fr);
      border: 1px solid var(--border); border-radius: 1.25rem; overflow: hidden;
      margin-top: 2.5rem;
    }
    @media(min-width:700px) { .feats-grid { grid-template-columns: repeat(4, 1fr); } }
    .feat-cell {
      padding: 1.5rem 1.25rem; background: var(--card);
      border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
      transition: background .2s; text-align: center;
    }
    .feat-cell:hover { background: color-mix(in oklab, var(--primary) 5%, var(--card)); }
    .feat-icon-wrap { width: 2.25rem; height: 2.25rem; border-radius: .625rem; display: grid; place-items: center; background: var(--gradient-primary); margin: 0 auto .875rem; }
    .feat-label { font-size: .6875rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: .25rem; }
    .feat-name { font-size: .9375rem; font-weight: 700; margin-bottom: .3rem; }
    .feat-desc { font-size: .75rem; color: var(--muted-foreground); line-height: 1.5; }

    /* ══════════════════════════════════════
       MULTI-DEVICE
    ══════════════════════════════════════ */
    .devices { padding: 5rem 0; border-top: 1px solid var(--border); }
    .phones-row {
      display: grid; grid-template-columns: 1fr; gap: 2rem; margin-top: 3rem;
      justify-items: center;
    }
    @media(min-width:700px) { .phones-row { grid-template-columns: repeat(3, 1fr); } }
    .phone-wrap { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; max-width: 220px; }
    .phone-caption { font-size: .75rem; font-weight: 600; color: var(--muted-foreground); text-align: center; }
    .phone-caption strong { display: block; color: var(--foreground); font-size: .875rem; margin-bottom: .125rem; }

    .phone {
      width: 200px; border-radius: 2rem; overflow: hidden;
      border: 6px solid color-mix(in oklab, var(--foreground) 15%, transparent);
      background: var(--card);
      box-shadow: 0 24px 60px -16px color-mix(in oklab, var(--primary) 20%, transparent),
                  inset 0 0 0 1px color-mix(in oklab, var(--foreground) 8%, transparent);
    }
    .phone-1 { animation: phoneFloat 5s ease-in-out infinite; }
    .phone-2 { animation: phoneFloat 5.5s ease-in-out infinite .4s; }
    .phone-3 { animation: phoneFloat 6s ease-in-out infinite .8s; }
    @keyframes phoneFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }


    /* ══════════════════════════════════════
       PRICING
    ══════════════════════════════════════ */
    .pricing { padding: 5rem 0; border-top: 1px solid var(--border); }
    .pricing-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-top: 2.5rem; }
    @media(min-width:640px) { .pricing-grid { grid-template-columns: 1fr 1fr; } }

    .price-card {
      border-radius: 1.375rem; border: 1px solid var(--border); background: var(--card);
      padding: 2rem;
    }
    .price-card-pro { border-color: var(--primary); background: var(--gradient-primary); color: white; position: relative; overflow: hidden; }
    .price-card-pro::before { content: 'RECOMMENDED'; position: absolute; top: 1.25rem; right: 1.25rem; font-size: .5625rem; font-weight: 800; letter-spacing: .1em; background: rgba(255,255,255,.2); padding: .2rem .5rem; border-radius: 999px; }
    .price-tier { font-size: .6875rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; opacity: .6; margin-bottom: .5rem; }
    .price-name { font-size: 1.375rem; font-weight: 900; letter-spacing: -.02em; margin-bottom: .25rem; }
    .price-amount { font-size: 2.5rem; font-weight: 900; letter-spacing: -.05em; line-height: 1; margin: 1rem 0 .25rem; }
    .price-amount span { font-size: 1rem; font-weight: 500; letter-spacing: 0; opacity: .6; }
    .price-period { font-size: .75rem; opacity: .6; margin-bottom: 1.5rem; }
    .price-features { display: flex; flex-direction: column; gap: .625rem; margin-bottom: 1.75rem; }
    .price-feat { display: flex; align-items: flex-start; gap: .5rem; font-size: .8125rem; }
    .price-feat-check { width: 1.125rem; height: 1.125rem; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; background: color-mix(in oklab, var(--primary) 12%, transparent); margin-top: .05rem; }
    .price-card-pro .price-feat-check { background: rgba(255,255,255,.2); }
    .btn-price-free {
      display: block; width: 100%; text-align: center; padding: .75rem; border-radius: .75rem;
      font-size: .9375rem; font-weight: 700; cursor: pointer; border: 1px solid var(--border);
      background: none; color: var(--foreground); transition: background .15s;
    }
    .btn-price-free:hover { background: color-mix(in oklab, var(--foreground) 6%, transparent); }
    .btn-price-pro {
      display: block; width: 100%; text-align: center; padding: .75rem; border-radius: .75rem;
      font-size: .9375rem; font-weight: 700; cursor: pointer; border: none;
      background: white; color: var(--primary); transition: opacity .15s;
    }
    .btn-price-pro:hover { opacity: .92; }

    /* ══════════════════════════════════════
       FINAL CTA
    ══════════════════════════════════════ */
    .final { padding: 6rem 1.5rem; text-align: center; border-top: 1px solid var(--border); }
    .final-h2 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; letter-spacing: -.04em; line-height: 1.1; margin-bottom: 1rem; }
    .final-sub { font-size: 1rem; color: var(--muted-foreground); margin-bottom: 2.25rem; }

    /* ══════════════════════════════════════
       FOOTER
    ══════════════════════════════════════ */
    .footer {
      padding: 1.75rem 1.5rem;
      border-top: 1px solid var(--border);
      display: flex; flex-wrap: wrap; gap: .75rem;
      align-items: center; justify-content: space-between;
      font-size: .75rem; color: var(--muted-foreground);
    }
    .footer-links { display: flex; gap: 1.5rem; }
    .footer-links a { color: var(--muted-foreground); text-decoration: none; transition: color .15s; }
    .footer-links a:hover { color: var(--foreground); }

    /* ── Error ── */
    .err-card {
      border-radius: .875rem; border: 1px solid color-mix(in oklab,var(--destructive) 40%,transparent);
      background: color-mix(in oklab,var(--destructive) 10%,transparent);
      padding: .875rem; margin-bottom: 1rem;
      display: flex; align-items: flex-start; gap: .625rem; max-width: 400px;
    }
  `],
  template: `
<div class="lp">
  <div aria-hidden="true" class="blob blob-1"></div>
  <div aria-hidden="true" class="blob blob-2"></div>

  <!-- ══════════════════════════════════════
       HERO
  ══════════════════════════════════════ -->
  <section class="sec hero">
    <div class="wrap">
      <div class="hero-grid">

        <!-- Left copy -->
        <div>
          <div class="hero-eyebrow">
            <span class="hero-eyebrow-dot"></span>
            PERSONAL FINANCE · SPENZA
            <span style="opacity:.4">→</span>
          </div>

          <h1 class="hero-h1">
            Wealth management
            <span class="hero-accent gradient-text">re-engineered.</span>
          </h1>
          <p class="hero-sub">
            A private, automated pipeline for your financial life. From voice entry to encrypted Google Drive backups — built around how you actually spend.
          </p>

          @if (errorMessage()) {
            <div class="err-card" role="alert">
              <lucide-icon name="alert-circle" style="width:1.125rem;height:1.125rem;flex-shrink:0;color:var(--destructive)"/>
              <p style="font-size:.875rem;color:var(--destructive)">{{ errorMessage() }}</p>
            </div>
            <button (click)="onSignIn()" class="btn-dark">{{ 'common.retry' | translate }}</button>
          } @else {
            <div class="cta-row">
              <button (click)="onSignIn()" [disabled]="isLoading()" class="btn-dark">
                @if (isLoading()) {
                  <lucide-icon name="loader-2" style="width:1rem;height:1rem;" class="animate-spin"/>
                  <span>{{ 'auth.signingIn' | translate }}</span>
                } @else {
                  <svg style="width:1rem;height:1rem;flex-shrink:0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>{{ 'auth.signIn' | translate }}</span>
                }
              </button>
              <span class="cta-sub">Free forever · No credit card</span>
            </div>
          }

        </div>

        <!-- Right: App screenshot collage -->
        <div class="collage">
          <!-- Row 1: Daily Expenses chart + Donut -->
          <div class="collage-row">
            <div class="ss-card">
              <div class="ss-header">
                <div class="ss-title">Year-to-date Daily Expenses</div>
                <div class="ss-sub">Daily spend · past 30 days</div>
              </div>
              <div class="ss-body">
                <div class="mini-line">
                  <div class="mini-bar" style="height:20%"></div>
                  <div class="mini-bar" style="height:30%"></div>
                  <div class="mini-bar" style="height:18%"></div>
                  <div class="mini-bar" style="height:25%"></div>
                  <div class="mini-bar" style="height:22%"></div>
                  <div class="mini-bar hi" style="height:90%"></div>
                  <div class="mini-bar" style="height:50%"></div>
                  <div class="mini-bar" style="height:35%"></div>
                  <div class="mini-bar" style="height:28%"></div>
                  <div class="mini-bar" style="height:15%"></div>
                </div>
              </div>
            </div>
            <div class="ss-card">
              <div class="ss-header">
                <div class="ss-title">This Month by Type</div>
                <div class="ss-sub">Where your spend is concentrated</div>
              </div>
              <div class="ss-body">
                <div class="donut-wrap">
                  <div class="donut"></div>
                  <div class="donut-legend">
                    <div class="donut-item"><div class="donut-dot" style="background:#3b82f6"></div>Housing ₹13,500</div>
                    <div class="donut-item"><div class="donut-dot" style="background:#f59e0b"></div>Dining ₹865</div>
                    <div class="donut-item"><div class="donut-dot" style="background:#10b981"></div>Food ₹1,798</div>
                    <div class="donut-item"><div class="donut-dot" style="background:#8b5cf6"></div>Subs ₹2,593</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Row 2: Last 6 months + Budget Rule -->
          <div class="collage-row">
            <div class="ss-card">
              <div class="ss-header">
                <div class="ss-title">Last 6 Months</div>
                <div class="ss-sub">Total monthly spend</div>
              </div>
              <div class="ss-body">
                <div class="mini-line">
                  <div class="mini-bar" style="height:5%"></div>
                  <div class="mini-bar" style="height:5%"></div>
                  <div class="mini-bar" style="height:5%"></div>
                  <div class="mini-bar" style="height:5%"></div>
                  <div class="mini-bar" style="height:5%"></div>
                  <div class="mini-bar hi" style="height:90%"></div>
                </div>
              </div>
            </div>
            <div class="ss-card">
              <div class="ss-header">
                <div class="ss-title">Budget Rule (50/30/20)</div>
                <div class="ss-sub">Actual split: Needs, Wants, Savings</div>
              </div>
              <div class="ss-body">
                <div class="donut-wrap">
                  <div class="budget-donut"></div>
                  <div class="donut-legend">
                    <div class="donut-item"><div class="donut-dot" style="background:#3b82f6"></div>Needs 32%</div>
                    <div class="donut-item"><div class="donut-dot" style="background:#f97316"></div>Wants 6%</div>
                    <div class="donut-item"><div class="donut-dot" style="background:#10b981"></div>Savings 0%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ══════════════════════════════════════
       LIFECYCLE
  ══════════════════════════════════════ -->
  <section class="sec lifecycle">
    <div class="wrap">
      <div class="lc-grid">
        <div>
          <div class="section-label">The Lifecycle</div>
          <h2 class="section-h2">Every rupee follows a precise, private path.</h2>
          <p class="section-p">From your phone to your long-term reports — automated, categorised, and synced to your personal Google Drive.</p>

          <div class="lc-steps">
            <div class="lc-step">
              <div class="lc-step-num">01</div>
              <div>
                <div class="lc-step-title">Capture</div>
                <div class="lc-step-desc">Add an expense by text, voice, or AI-smart fill. Takes under 5 seconds. Works offline too.</div>
              </div>
            </div>
            <div class="lc-step">
              <div class="lc-step-num">02</div>
              <div>
                <div class="lc-step-title">Process</div>
                <div class="lc-step-desc">On-device categorisation, limit checks, budget alerts. Visual progress so you know where you stand today.</div>
              </div>
            </div>
            <div class="lc-step">
              <div class="lc-step-num">03</div>
              <div>
                <div class="lc-step-title">Archive</div>
                <div class="lc-step-desc">Encrypted sync to your personal Google Drive. Your data, your account — we never touch it.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mini dashboard preview stacked -->
        <div style="display:flex;flex-direction:column;gap:.75rem">
          <div class="ss-card" style="animation-delay:.05s">
            <div class="ss-header">
              <div class="ss-title">Daily · Wed, 10 June</div>
              <div class="ss-sub">You've spent ₹1,732 of ₹1,933 today</div>
            </div>
            <div class="ss-body" style="display:flex;flex-direction:column;gap:.4rem">
              @for (r of dailyRows; track r.name) {
                <div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0;border-bottom:1px solid var(--border)">
                  <div style="width:1.375rem;height:1.375rem;border-radius:.375rem;display:grid;place-items:center;font-size:.625rem;flex-shrink:0;" [style.background]="r.bg">{{r.emoji}}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:.625rem;font-weight:600">{{r.name}}</div>
                    <div style="font-size:.5rem;color:var(--muted-foreground)">{{r.cat}}</div>
                  </div>
                  <div style="font-size:.6875rem;font-weight:700;color:var(--destructive)">{{r.amount}}</div>
                </div>
              }
            </div>
          </div>
          <div class="ss-card" style="animation-delay:.1s">
            <div class="ss-header">
              <div class="ss-title">Category Breakdown</div>
              <div class="ss-sub">How each category compares to its limit</div>
            </div>
            <div class="ss-body" style="display:flex;flex-direction:column;gap:.5rem">
              @for (c of limitRows; track c.name) {
                <div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:.25rem">
                    <span style="font-size:.5625rem;font-weight:700">{{c.name}}</span>
                    <span style="font-size:.5rem;color:var(--muted-foreground)">{{c.spent}} / {{c.limit}}</span>
                  </div>
                  <div style="height:4px;border-radius:999px;background:var(--border)">
                    <div style="height:100%;border-radius:999px;" [style.width]="c.pct" [style.background]="c.color"></div>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ══════════════════════════════════════
       FEATURES GRID
  ══════════════════════════════════════ -->
  <section class="sec features" id="features">
    <div class="wrap">
      <div class="section-label">Features</div>
      <h2 class="section-h2">{{ 'auth.features.heading' | translate }}</h2>
      <p class="section-p">Nine feature groups, one calm dashboard. Built for the way Indian households actually spend.</p>

      <div class="feats-grid">
        @for (f of allFeatures; track f.name; let i = $index) {
          <div class="feat-cell">
            <div class="feat-icon-wrap">
              <lucide-icon [name]="f.icon" style="width:1rem;height:1rem;color:white"/>
            </div>
            <div class="feat-label">Feature.0{{i + 1}}</div>
            <div class="feat-name">{{f.name}}</div>
            <div class="feat-desc">{{f.desc}}</div>
          </div>
        }
      </div>
    </div>
  </section>

  <!-- ══════════════════════════════════════
       MULTI-DEVICE
  ══════════════════════════════════════ -->
  <section class="sec devices">
    <div class="wrap">
      <div class="section-label">On every surface</div>
      <h2 class="section-h2">Mobile, widget, web —<br>the same source of truth.</h2>
      <p class="section-p">Log from your home screen widget, your voice, or the web. Everything stays in sync.</p>

      <div class="phones-row">

        <!-- Phone 1: Daily log -->
        <div class="phone-wrap">
          <div class="phone phone-1">
            <img src="assets/screenshots/daily.png" alt="Spenza daily expense log" style="width:100%;display:block;" />
          </div>
          <div class="phone-caption"><strong>Daily log — voice first</strong>Tap or speak to add expenses</div>
        </div>

        <!-- Phone 2: Category limits -->
        <div class="phone-wrap">
          <div class="phone phone-2">
            <img src="assets/screenshots/limits.png" alt="Spenza category limits breakdown" style="width:100%;display:block;" />
          </div>
          <div class="phone-caption"><strong>Category vs limit, at a glance</strong>Visual limits so you spend with intent</div>
        </div>

        <!-- Phone 3: Widget -->
        <div class="phone-wrap">
          <div class="phone phone-3">
            <img src="assets/screenshots/widget.png" alt="Spenza Android home screen widget" style="width:100%;display:block;" />
          </div>
          <div class="phone-caption"><strong>Android home screen widget</strong>Track expenses without opening the app</div>
        </div>

      </div>
    </div>
  </section>

  <!-- ══════════════════════════════════════
       PRICING
  ══════════════════════════════════════ -->
  <section class="sec pricing">
    <div class="wrap">
      <div class="section-label">Engineered for everyone.</div>
      <h2 class="section-h2">No hidden fees. No data selling.</h2>
      <p class="section-p">Pro access stays until the period ends. Cancel anytime.</p>

      <div class="pricing-grid">

        <!-- Free -->
        <div class="price-card">
          <div class="price-tier">Free</div>
          <div class="price-name">Spenza Free</div>
          <div class="price-amount">₹0</div>
          <div class="price-period">forever</div>
          <div class="price-features">
            @for (f of freeFeatures; track f) {
              <div class="price-feat">
                <div class="price-feat-check">
                  <lucide-icon name="check" style="width:.625rem;height:.625rem;" class="gradient-text"/>
                </div>
                <span>{{f}}</span>
              </div>
            }
          </div>
          <button class="btn-price-free" (click)="onSignIn()" [disabled]="isLoading()">Get Started</button>
        </div>

        <!-- Pro -->
        <div class="price-card price-card-pro">
          <div class="price-tier" style="opacity:.7">Pro</div>
          <div class="price-name">Spenza Pro</div>
          <div class="price-amount">₹199 <span>/ month</span></div>
          <div class="price-period">Yearly billing — cancel anytime</div>
          <div class="price-features">
            @for (f of proFeatures; track f) {
              <div class="price-feat" style="color:rgba(255,255,255,.9)">
                <div class="price-feat-check">
                  <lucide-icon name="check" style="width:.625rem;height:.625rem;color:white"/>
                </div>
                <span>{{f}}</span>
              </div>
            }
          </div>
          <button class="btn-price-pro" (click)="onSignIn()" [disabled]="isLoading()">Go Pro</button>
        </div>

      </div>
    </div>
  </section>

  <!-- ══════════════════════════════════════
       FINAL CTA
  ══════════════════════════════════════ -->
  <section class="sec final">
    <div style="max-width:600px;margin:0 auto">
      <h2 class="final-h2">Start your journey<br>to financial clarity.</h2>
      <p class="final-sub">Free forever. Private by design. 30 seconds to set up.</p>

      @if (errorMessage()) {
        <button (click)="onSignIn()" class="btn-dark" style="margin:0 auto">{{ 'common.retry' | translate }}</button>
      } @else {
        <button (click)="onSignIn()" [disabled]="isLoading()" class="btn-dark" style="margin:0 auto">
          @if (isLoading()) {
            <lucide-icon name="loader-2" style="width:1rem;height:1rem;" class="animate-spin"/>
            <span>{{ 'auth.signingIn' | translate }}</span>
          } @else {
            <svg style="width:1rem;height:1rem;flex-shrink:0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>{{ 'auth.signIn' | translate }}</span>
          }
        </button>
      }
    </div>
  </section>

  <!-- ══════════════════════════════════════
       FOOTER
  ══════════════════════════════════════ -->
  <footer class="footer">
    <span>© 2026 Spenza · Privacy by design</span>
    <div class="footer-links">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </div>
  </footer>

</div>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly familySyncService = inject(FamilySyncService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  readonly allFeatures = [
    { icon: 'users',              name: 'Family Sync',         desc: 'Share with a partner in real-time. Shared budgets, individual privacy.' },
    { icon: 'credit-card',        name: 'EMI & Debt',          desc: 'Credit cards, personal, vehicle, home loans. Visual payoff progress.' },
    { icon: 'mic',                name: 'Voice Entry',         desc: '"Spent ₹82 on groceries yesterday." Gemini parses it into a filled form.' },
    { icon: 'cloud',              name: 'Drive Backup',        desc: 'Encrypted sync to your own Google Drive. We never see it.' },
    { icon: 'trending-up',        name: 'AI Insights',         desc: 'On-device analysis gives you proactive spending nudges.' },
    { icon: 'message-square',     name: 'SMS Detection',       desc: 'On-device parsing prompts you to log real spend — never touches inbox.' },
    { icon: 'globe',              name: 'Multilingual',        desc: 'English, Tamil, Hindi — including voice (अरे · உழை · हाँ).' },
    { icon: 'shield-check',       name: 'Privacy First',       desc: 'No ads. No data selling. Comments and receipts never leave your device.' },
  ];

  readonly dailyRows = [
    { emoji: '☕', name: 'Morning Coffee',  cat: 'Food & Drinks', amount: '-₹80',  bg: 'color-mix(in oklab,#f59e0b 15%,transparent)' },
    { emoji: '🚌', name: 'Metro Card',      cat: 'Transport',     amount: '-₹50',  bg: 'color-mix(in oklab,#3b82f6 15%,transparent)' },
    { emoji: '🍱', name: 'Office Lunch',    cat: 'Food & Drinks', amount: '-₹220', bg: 'color-mix(in oklab,#10b981 15%,transparent)' },
    { emoji: '💊', name: 'Pharmacy',        cat: 'Health',        amount: '-₹340', bg: 'color-mix(in oklab,#8b5cf6 15%,transparent)' },
  ];

  readonly limitRows = [
    { name: 'Housing',        spent: '₹13,500', limit: '₹14,500', pct: '93%',  color: '#3b82f6' },
    { name: 'Food & Groceries', spent: '₹1,798', limit: '₹6,960', pct: '26%', color: '#10b981' },
    { name: 'Transport',      spent: '₹1,800',  limit: '₹4,060',  pct: '44%',  color: '#06b6d4' },
    { name: 'Utilities',      spent: '₹1,642',  limit: '₹4,640',  pct: '35%',  color: '#f59e0b' },
  ];

  readonly freeFeatures = [
    'Unlimited expense tracking',
    'Accounts, debts & EMI',
    'Google Drive backup',
    'Daily, monthly & limits views',
    'Android home screen widget',
    'Voice entry (Gemini Smart Fill)',
  ];

  readonly proFeatures = [
    'Everything in Free',
    'Real-time Family Sync',
    'Advanced Gemini insights',
    'CSV & Google Sheets export',
    'Priority support',
    'Yearly billing — cancel anytime',
  ];

  async onSignIn(): Promise<void> {
    this.errorMessage.set(null);
    this.isLoading.set(true);
    try {
      const signInResult = await this.authService.signIn();
      if (signInResult.accountChanged) await this.resetAccountScopedLocalState();

      const uid = this.authService.firebaseUid();
      if (uid) this.subscriptionService.ensureStarted(uid);

      await this.backupModeService.loadFromDrive(true);
      const mode = this.backupModeService.getMode();

      if (mode === null) { await this.router.navigate(['/mode-select']); return; }
      if (mode === 'family' && !this.backupModeService.getSharedFileId() && !this.backupModeService.getFamilyId()) {
        await this.router.navigate(['/family-setup']); return;
      }

      await this.router.navigate(['/daily']);

      const familyId = this.backupModeService.getFamilyId();
      void (async () => {
        await this.expenseStore.loadFromDrive();
        if (mode === 'family' && familyId && uid) this.familySyncService.startListening(familyId, uid);
      })();
    } catch (err) {
      // Missing Drive scope (unticked consent checkbox) or Drive 403 right after
      // sign-in: explain the exact fix instead of looping with a generic error.
      const status = (err as { status?: number } | null)?.status;
      if (err instanceof MissingDriveScopeError || status === 403) {
        this.errorMessage.set(this.i18n.t('auth.error.driveAccess'));
      } else {
        this.errorMessage.set(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private async resetAccountScopedLocalState(): Promise<void> {
    this.expenseStore.clearLocalData();
    await Promise.all([
      this.expenseStore.clearLocalBackupCache(),
      this.backupModeService.clearLocalCacheForAccountSwitch(),
    ]);
  }
}
