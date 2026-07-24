import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, MissingDriveScopeError } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { FamilySyncService } from '../../core/services/family-sync.service';
import { TranslatePipe } from '../../shared/pipes';

interface FeedItem {
  emoji: string;
  name: string;
  cat: string;
  via: string;
  amount: string;
  bg: string;
}

/**
 * Sign-in landing page at `/auth/callback` — where authGuard sends every
 * unauthenticated visitor. Hosts the real Google sign-in flow (onSignIn) plus
 * marketing sections for first-time visitors. Rendered SHELL-LESS via
 * app.ts isPublicPage (it carries its own nav and footer).
 *
 * Visual design ported from the "Spenza Auth Callback" Claude Design file
 * (2026-07-24), reworked to be THEME-AWARE: structural colors map to the
 * app's theme tokens (--background/--card/--border/…), light renders by
 * default, and `:host-context(.dark)` restores the design's original dark
 * glass look when the user picks the dark theme. Copy corrections vs the
 * design (which mirrored this screen's old stale copy): pricing ₹199 → real
 * ₹499/mo + ₹3,999/yr; free/pro feature lists aligned with the subscribe
 * page; "encrypted" Drive claims softened to "private" (no client-side
 * encryption exists). Error card + retry state carried over from the old
 * implementation (absent in the design).
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  styles: [`
    :host {
      display: block;
      /* ---- light theme (default) ---- */
      --acc: oklch(0.55 0.22 290);
      --acc-glow: oklch(0.66 0.24 305);
      --acc-deep: oklch(0.50 0.25 290);
      --acc-ink: #fff;
      --ink: var(--foreground);
      --mut: var(--muted-foreground);
      --line: var(--border);
      --glass: var(--card);
      --soft: oklch(0.25 0.03 275 / 0.05);
      --soft-line: oklch(0.25 0.03 275 / 0.08);
      --track: oklch(0.25 0.03 275 / 0.10);
      --pos: oklch(0.50 0.14 155);
      --neg: oklch(0.55 0.20 20);
      --err-ink: oklch(0.45 0.18 25);
      --deep-shadow: 0 40px 90px -30px oklch(0.20 0.04 265 / 0.28);
      --nav-bg: color-mix(in oklab, var(--background) 82%, transparent);
      --marquee-bg: var(--card);
      --spot: oklch(0.55 0.24 295 / 0.07);
      --hero-bg:
        radial-gradient(at 12% 8%, oklch(0.90 0.09 290 / 0.55) 0px, transparent 55%),
        radial-gradient(at 88% 14%, oklch(0.90 0.08 220 / 0.45) 0px, transparent 55%),
        radial-gradient(at 50% 110%, oklch(0.93 0.06 180 / 0.40) 0px, transparent 55%);
      --final-bg: radial-gradient(at 50% 120%, oklch(0.90 0.09 290 / 0.60) 0px, transparent 60%);
      --font-display: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
    }
    /* ---- dark theme (app .dark class on <html>) ---- */
    :host-context(.dark) {
      --acc: oklch(0.72 0.20 290);
      --acc-glow: oklch(0.78 0.22 310);
      --acc-ink: oklch(0.12 0.03 265);
      --glass: oklch(0.20 0.025 265 / 0.62);
      --soft: oklch(1 0 0 / 0.04);
      --soft-line: oklch(1 0 0 / 0.05);
      --track: oklch(1 0 0 / 0.08);
      --pos: oklch(0.78 0.14 155);
      --neg: oklch(0.74 0.16 15);
      --err-ink: oklch(0.85 0.09 25);
      --deep-shadow: 0 40px 90px -30px oklch(0 0 0 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.08);
      --marquee-bg: oklch(0.16 0.022 265);
      --spot: oklch(0.55 0.24 295 / 0.16);
      --hero-bg:
        radial-gradient(at 12% 8%, oklch(0.50 0.25 290 / 0.35) 0px, transparent 55%),
        radial-gradient(at 88% 14%, oklch(0.45 0.20 220 / 0.30) 0px, transparent 55%),
        radial-gradient(at 50% 110%, oklch(0.50 0.20 180 / 0.22) 0px, transparent 55%);
      --final-bg: radial-gradient(at 50% 120%, oklch(0.50 0.25 290 / 0.35) 0px, transparent 60%);
    }
    .acb-root {
      min-height: 100vh; color: var(--ink); overflow-x: hidden;
      background: var(--background);
      font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .acb-root a { text-decoration: none; }

    /* ---------- nav ---------- */
    .acb-nav {
      position: sticky; top: 0; z-index: 50; backdrop-filter: blur(16px);
      background: var(--nav-bg); border-bottom: 1px solid var(--line);
    }
    .acb-nav-inner {
      max-width: 1140px; margin: 0 auto; padding: 0 24px; height: 62px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
    }
    .acb-brand { display: flex; align-items: center; gap: 10px; }
    .acb-brand-name { font-family: var(--font-display); font-weight: 800; font-size: 19px; letter-spacing: -0.02em; }
    .acb-nav-links { display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 500; color: var(--mut); }
    .acb-nav-link {
      padding: 8px 12px; border-radius: 10px; color: inherit; background: none;
      border: none; cursor: pointer; font: inherit; transition: background 0.15s, color 0.15s;
    }
    .acb-nav-link:hover { background: var(--soft); color: var(--ink); }
    .acb-nav-cta {
      display: inline-flex; align-items: center; gap: 8px; border: none; cursor: pointer;
      font-family: inherit; border-radius: 12px;
      background: linear-gradient(135deg, var(--acc), var(--acc-glow));
      padding: 9px 18px; font-size: 14px; font-weight: 700; color: var(--acc-ink);
      box-shadow: 0 10px 30px -8px var(--acc-deep); transition: opacity 0.15s;
    }
    .acb-nav-cta:hover:not(:disabled) { opacity: 0.9; }
    .acb-nav-cta:disabled { opacity: 0.55; cursor: not-allowed; }

    /* ---------- hero ---------- */
    .acb-hero { position: relative; border-bottom: 1px solid var(--line); background: var(--hero-bg); }
    .acb-spotlight {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(560px circle at var(--mx, 30%) var(--my, 30%), var(--spot), transparent 70%);
    }
    .acb-hero-inner {
      position: relative; max-width: 1140px; margin: 0 auto; padding: 76px 24px 92px;
      display: grid; grid-template-columns: 1.02fr 0.98fr; gap: 60px; align-items: center;
    }
    .acb-hero-copy { animation: fadeUp 0.7s ease-out both; }
    .acb-eyebrow {
      display: inline-flex; align-items: center; gap: 9px; border-radius: 9999px;
      border: 1px solid var(--line); background: var(--soft); padding: 7px 16px;
      font-size: 12.5px; font-weight: 600; letter-spacing: 0.06em; color: var(--mut); margin-bottom: 28px;
    }
    .acb-eyebrow-dot {
      width: 8px; height: 8px; border-radius: 9999px; background: oklch(0.72 0.18 155);
      display: inline-block; animation: pulseDot 2.4s ease-in-out infinite;
    }
    .acb-h1 {
      font-family: var(--font-display); font-size: clamp(44px, 5.4vw, 68px);
      font-weight: 800; letter-spacing: -0.035em; line-height: 1.04; margin: 0; text-wrap: balance;
    }
    .acb-shimmer {
      background: linear-gradient(100deg, var(--acc-glow), var(--acc), var(--acc-glow));
      background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
      color: transparent; animation: shimmer 6s linear infinite;
    }
    .acb-sub {
      margin: 24px 0 0; font-size: 18px; color: var(--mut); line-height: 1.68;
      max-width: 480px; text-wrap: pretty;
    }
    .acb-sub em { font-style: normal; font-weight: 600; color: var(--ink); }
    .acb-sub strong { color: var(--ink); }
    .acb-cta-row { margin-top: 36px; display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
    .acb-google-btn, .acb-retry {
      cursor: pointer; font-family: inherit; background: #fff;
      color: #1f1f1f; font-weight: 700; transition: transform 0.15s;
      display: inline-flex; align-items: center; border: 1px solid var(--line);
    }
    .acb-google-btn {
      justify-content: center; gap: 10px; min-width: 250px; border-radius: 14px;
      padding: 15px 28px; font-size: 15px;
      box-shadow: 0 20px 50px -14px oklch(0.55 0.24 295 / 0.45);
    }
    .acb-google-btn:hover:not(:disabled), .acb-retry:hover { transform: translateY(-2px); }
    .acb-google-btn:disabled { cursor: not-allowed; opacity: 0.85; }
    .acb-spinner {
      width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid #c7c7c7;
      border-top-color: #1f1f1f; animation: spin 0.7s linear infinite; display: inline-block;
    }
    .acb-cta-sub { font-size: 13px; color: var(--mut); }
    .acb-ticks {
      margin-top: 32px; display: flex; align-items: center; gap: 18px;
      font-size: 13px; color: var(--mut); flex-wrap: wrap;
    }
    .acb-tick { display: inline-flex; align-items: center; gap: 6px; }

    /* error card (not in the design — preserved from old screen) */
    .acb-err {
      margin-top: 28px; border-radius: 14px;
      border: 1px solid oklch(0.6 0.2 25 / 0.5); background: oklch(0.6 0.2 25 / 0.12);
      padding: 14px 16px; display: flex; align-items: flex-start; gap: 10px; max-width: 440px;
    }
    .acb-err p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--err-ink); }
    .acb-retry { margin-top: 14px; gap: 8px; border-radius: 12px; padding: 11px 22px; font-size: 14px; }

    /* ---------- hero glass dashboard ---------- */
    .acb-mock-wrap { position: relative; animation: fadeUp 0.7s ease-out 0.15s both; }
    .acb-mock-halo {
      position: absolute; inset: -50px -30px; pointer-events: none;
      background: radial-gradient(closest-side, oklch(0.50 0.25 290 / 0.18), transparent);
      border-radius: 50%;
    }
    .acb-mock-card {
      position: relative; border-radius: 26px; background: var(--glass);
      backdrop-filter: blur(20px); border: 1px solid var(--line);
      box-shadow: var(--deep-shadow);
      padding: 24px; animation: floaty 7s ease-in-out infinite;
    }
    .acb-mock-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; margin-bottom: 6px;
    }
    .acb-mock-label {
      margin: 0; font-size: 11.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--mut);
    }
    .acb-mock-sync {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11.5px; font-weight: 600; color: var(--pos);
    }
    .acb-mock-sync-dot {
      width: 6px; height: 6px; border-radius: 50%; background: oklch(0.72 0.18 155);
      animation: pulseDot 2s ease-in-out infinite;
    }
    .acb-mock-amount {
      margin: 0 0 4px; font-family: var(--font-display);
      font-size: 38px; font-weight: 800; letter-spacing: -0.02em;
    }
    .acb-mock-amount span { font-size: 15px; font-weight: 600; color: var(--mut); letter-spacing: 0; }
    .acb-mock-track { height: 7px; border-radius: 9999px; background: var(--track); overflow: hidden; margin: 10px 0 20px; }
    .acb-mock-fill {
      height: 100%; width: 89%; border-radius: 9999px;
      background: linear-gradient(90deg, var(--acc), var(--acc-glow));
      transform-origin: left; animation: growX 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.4s both;
    }
    .acb-feed { display: flex; flex-direction: column; gap: 8px; min-height: 208px; }
    .acb-feed-row {
      display: flex; align-items: center; gap: 11px; padding: 8px 10px; border-radius: 12px;
      background: var(--soft); border: 1px solid var(--soft-line);
      animation: slideIn 0.45s ease-out both;
    }
    .acb-feed-icon {
      width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
      font-size: 15px; flex-shrink: 0;
    }
    .acb-feed-main { flex: 1; min-width: 0; }
    .acb-feed-name { font-size: 13px; font-weight: 600; }
    .acb-feed-meta { font-size: 11px; color: var(--mut); }
    .acb-feed-amt { font-size: 13.5px; font-weight: 700; color: var(--neg); }
    .acb-limits { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
    .acb-limit-head { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .acb-limit-head .n { font-size: 11.5px; font-weight: 700; }
    .acb-limit-head .v { font-size: 11px; color: var(--mut); }
    .acb-limit-track { height: 5px; border-radius: 9999px; background: var(--track); }
    .acb-limit-fill { height: 100%; border-radius: 9999px; transform-origin: left; animation: growX 1s ease-out both; }
    .acb-voice-chip {
      position: absolute; top: -22px; right: -14px; display: flex; align-items: center; gap: 9px;
      border-radius: 14px; background: var(--glass); backdrop-filter: blur(16px);
      border: 1px solid var(--line); box-shadow: 0 20px 50px -16px oklch(0.2 0.04 265 / 0.4);
      padding: 11px 16px; animation: floaty2 6s ease-in-out infinite 0.8s;
    }
    .acb-voice-icon {
      width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center;
      background: linear-gradient(135deg, var(--acc), var(--acc-glow));
    }
    .acb-voice-quote { font-size: 12px; font-weight: 700; }
    .acb-voice-result { font-size: 10.5px; color: var(--pos); font-weight: 600; }

    /* ---------- marquee ---------- */
    .acb-marquee { border-bottom: 1px solid var(--line); overflow: hidden; padding: 16px 0; background: var(--marquee-bg); }
    .acb-marquee-track { display: flex; width: max-content; animation: marquee 30s linear infinite; }
    .acb-marquee-list {
      display: flex; gap: 44px; padding-right: 44px; font-family: var(--font-display);
      font-size: 13px; font-weight: 700; letter-spacing: 0.14em;
      color: var(--mut); white-space: nowrap;
    }
    .acb-marquee-list .d { color: var(--acc); }

    /* ---------- shared section bits ---------- */
    .acb-section { border-bottom: 1px solid var(--line); }
    .acb-kicker {
      font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--acc); margin-bottom: 12px;
    }
    .acb-h2 {
      font-family: var(--font-display); font-size: clamp(28px, 3.2vw, 40px);
      font-weight: 800; letter-spacing: -0.03em; line-height: 1.12; margin: 0 0 14px; text-wrap: balance;
    }
    .acb-section-sub { margin: 0; font-size: 15.5px; color: var(--mut); line-height: 1.65; }
    [data-reveal] { will-change: opacity, transform; }

    /* ---------- lifecycle ---------- */
    .acb-how-inner {
      max-width: 1140px; margin: 0 auto; padding: 96px 24px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;
    }
    .acb-steps { position: relative; display: flex; flex-direction: column; gap: 30px; margin-top: 36px; }
    .acb-steps-line {
      position: absolute; left: 15px; top: 34px; bottom: 34px; width: 2px;
      background: linear-gradient(180deg, var(--acc), var(--acc-glow), transparent);
    }
    .acb-step { display: flex; gap: 18px; position: relative; }
    .acb-step-n {
      width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
      display: grid; place-items: center; font-size: 12px; font-weight: 800;
      background: linear-gradient(135deg, var(--acc), var(--acc-glow));
      color: var(--acc-ink); box-shadow: 0 8px 20px -6px var(--acc-deep);
    }
    .acb-step-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .acb-step-desc { font-size: 14px; color: var(--mut); line-height: 1.6; }
    .acb-voice-demo { display: flex; flex-direction: column; gap: 14px; }
    .acb-glass-card {
      border-radius: 20px; background: var(--glass); backdrop-filter: blur(16px);
      border: 1px solid var(--line); padding: 20px 22px;
    }
    .acb-card-label {
      font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--mut); margin-bottom: 10px;
    }
    .acb-wave { display: flex; align-items: center; gap: 3px; height: 26px; }
    .acb-wave span { width: 3px; border-radius: 2px; background: var(--acc-glow); }
    .acb-say-quote { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
    .acb-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .acb-form-cell { border-radius: 12px; border: 1px solid var(--soft-line); background: var(--soft); padding: 10px 14px; }
    .acb-form-cell .k { font-size: 10px; color: var(--mut); margin-bottom: 2px; }
    .acb-form-cell .v { font-size: 15px; font-weight: 700; }
    .acb-form-cell-ok { border-color: oklch(0.62 0.16 155 / 0.4); background: oklch(0.62 0.16 155 / 0.08); }
    .acb-form-cell-ok .k, .acb-form-cell-ok .v { color: var(--pos); }

    /* ---------- features ---------- */
    .acb-features-inner { max-width: 1140px; margin: 0 auto; padding: 96px 24px; }
    .acb-features-head { max-width: 560px; }
    .acb-features-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 44px; }
    .acb-feature-card {
      border-radius: 18px; border: 1px solid var(--line); background: var(--glass);
      padding: 22px 20px; transition: border-color 0.2s, transform 0.2s;
    }
    .acb-feature-card:hover { border-color: var(--acc); transform: translateY(-3px); }
    .acb-feature-icon {
      width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center;
      background: linear-gradient(135deg, var(--acc), var(--acc-glow)); margin-bottom: 16px;
    }
    .acb-feature-name { font-size: 15px; font-weight: 700; margin-bottom: 5px; }
    .acb-feature-desc { font-size: 13px; color: var(--mut); line-height: 1.55; }

    /* ---------- pricing ---------- */
    .acb-pricing-inner { max-width: 900px; margin: 0 auto; padding: 96px 24px; }
    .acb-pricing-head { text-align: center; max-width: 560px; margin: 0 auto; }
    .acb-pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 48px; align-items: stretch; }
    .acb-plan {
      border-radius: 22px; border: 1px solid var(--line); background: var(--glass);
      backdrop-filter: blur(16px); padding: 32px; display: flex; flex-direction: column;
    }
    .acb-plan-pro {
      position: relative; border: 1px solid var(--acc);
      background: linear-gradient(150deg, oklch(0.30 0.10 290), oklch(0.22 0.06 295));
      color: oklch(0.97 0.005 250);
      box-shadow: 0 30px 70px -24px var(--acc-deep), inset 0 1px 0 oklch(1 0 0 / 0.12);
      overflow: hidden;
    }
    .acb-plan-flag {
      position: absolute; top: 22px; right: 22px; font-size: 9.5px; font-weight: 800;
      letter-spacing: 0.1em; background: oklch(1 0 0 / 0.15); padding: 4px 9px; border-radius: 9999px;
    }
    .acb-plan-tier {
      font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--mut); margin-bottom: 8px;
    }
    .acb-plan-pro .acb-plan-tier { color: oklch(0.85 0.06 300); }
    .acb-plan-name { font-family: var(--font-display); font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .acb-plan-price { font-family: var(--font-display); font-size: 42px; font-weight: 800; letter-spacing: -0.04em; margin: 16px 0 2px; }
    .acb-plan-price span { font-size: 16px; font-weight: 600; letter-spacing: 0; opacity: 0.65; }
    .acb-plan-period { font-size: 12.5px; color: var(--mut); margin-bottom: 26px; }
    .acb-plan-pro .acb-plan-period { color: oklch(0.85 0.06 300); }
    .acb-plan-feats { display: flex; flex-direction: column; gap: 11px; margin-bottom: 30px; flex: 1; }
    .acb-plan-feat { display: flex; gap: 9px; font-size: 13.5px; align-items: flex-start; }
    .acb-plan-feat .c { color: var(--pos); font-weight: 700; }
    .acb-plan-pro .acb-plan-feat .c { color: oklch(0.85 0.10 155); }
    .acb-plan-btn-free, .acb-plan-btn-pro {
      width: 100%; padding: 13px; border-radius: 13px; font-size: 14.5px;
      font-weight: 700; cursor: pointer; font-family: inherit;
    }
    .acb-plan-btn-free {
      border: 1px solid var(--line); background: none; color: var(--ink); transition: background 0.15s;
    }
    .acb-plan-btn-free:hover:not(:disabled) { background: var(--soft); }
    .acb-plan-btn-pro { border: none; background: #fff; color: oklch(0.35 0.15 290); transition: opacity 0.15s; }
    .acb-plan-btn-pro:hover:not(:disabled) { opacity: 0.92; }
    .acb-plan button:disabled { opacity: 0.55; cursor: not-allowed; }

    /* ---------- final CTA + footer ---------- */
    .acb-final { border-bottom: 1px solid var(--line); background: var(--final-bg); }
    .acb-final-inner { max-width: 660px; margin: 0 auto; padding: 110px 24px; text-align: center; }
    .acb-final-h {
      font-family: var(--font-display); font-size: clamp(34px, 4.6vw, 56px);
      font-weight: 800; letter-spacing: -0.035em; line-height: 1.08; margin: 0 0 16px; text-wrap: balance;
    }
    .acb-final-grad {
      background: linear-gradient(100deg, var(--acc-glow), var(--acc));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .acb-final-sub { margin: 0 0 34px; font-size: 16px; color: var(--mut); }
    .acb-footer {
      max-width: 1140px; margin: 0 auto; padding: 28px 24px;
      display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
      justify-content: space-between; font-size: 13px; color: var(--mut);
    }
    .acb-footer a { color: var(--mut); transition: color 0.15s; }
    .acb-footer a:hover { color: var(--ink); }

    /* ---------- animations ---------- */
    @keyframes fadeUp { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
    @keyframes floaty2 { 0%, 100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-16px) rotate(1.5deg); } }
    @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes pulseDot { 0%, 100% { box-shadow: 0 0 0 0 oklch(0.72 0.18 155 / 0.55); } 50% { box-shadow: 0 0 0 7px oklch(0.72 0.18 155 / 0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes growX { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
    @media (prefers-reduced-motion: reduce) {
      .acb-root *, .acb-root { animation-duration: 0.01s !important; transition-duration: 0.01s !important; }
    }

    /* ---------- responsive (not in the design file — added for mobile) ---------- */
    @media (max-width: 960px) {
      .acb-hero-inner { grid-template-columns: 1fr; gap: 64px; padding: 56px 24px 96px; }
      .acb-mock-wrap { max-width: 480px; margin: 0 auto; }
      .acb-voice-chip { right: 4px; }
    }
    @media (max-width: 900px) {
      .acb-how-inner { grid-template-columns: 1fr; gap: 48px; }
      .acb-features-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 760px) { .acb-pricing-grid { grid-template-columns: 1fr; } }
    @media (max-width: 700px) { .acb-nav-links { display: none; } }
    @media (max-width: 560px) {
      .acb-features-grid { grid-template-columns: 1fr; }
      .acb-hero-inner { padding: 48px 20px 88px; }
    }
  `],
  template: `
    <div class="acb-root">

      <!-- ============ NAV ============ -->
      <nav class="acb-nav">
        <div class="acb-nav-inner">
          <div class="acb-brand">
            <svg width="34" height="34" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style="border-radius: 9px;" role="img" aria-label="Spenza Logo">
              <defs>
                <linearGradient id="acb-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2620"/><stop offset="1" stop-color="#121009"/></linearGradient>
                <radialGradient id="acb-disc" cx="0.42" cy="0.36" r="0.75"><stop offset="0" stop-color="#FBE79A"/><stop offset="0.45" stop-color="#E6C24E"/><stop offset="0.8" stop-color="#C49A28"/><stop offset="1" stop-color="#8B6F1A"/></radialGradient>
                <linearGradient id="acb-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5D76E"/><stop offset="0.5" stop-color="#D6AE33"/><stop offset="1" stop-color="#A07F1C"/></linearGradient>
              </defs>
              <rect x="0" y="0" width="1024" height="1024" rx="224" fill="url(#acb-tile)"/>
              <circle cx="512" cy="512" r="300" fill="none" stroke="#3a3024" stroke-width="54"/>
              <circle cx="512" cy="512" r="300" fill="none" stroke="url(#acb-ring)" stroke-width="54" stroke-linecap="round" stroke-dasharray="1413 1885" transform="rotate(-90 512 512)"/>
              <circle cx="512" cy="512" r="204" fill="url(#acb-disc)"/>
              <circle cx="512" cy="512" r="204" fill="none" stroke="#7A611A" stroke-width="7"/>
              <circle cx="512" cy="512" r="174" fill="none" stroke="#B8911F" stroke-width="6" opacity="0.65"/>
            </svg>
            <span class="acb-brand-name">Spenza</span>
          </div>
          <div class="acb-nav-links">
            <button type="button" class="acb-nav-link" (click)="scrollTo('features')">Features</button>
            <button type="button" class="acb-nav-link" (click)="scrollTo('how')">How it works</button>
            <button type="button" class="acb-nav-link" (click)="scrollTo('pricing')">Pricing</button>
          </div>
          <button type="button" class="acb-nav-cta" (click)="onSignIn()" [disabled]="isLoading()">Get Started</button>
        </div>
      </nav>

      <!-- ============ HERO ============ -->
      <header class="acb-hero" #hero>
        <div class="acb-spotlight"></div>
        <div class="acb-hero-inner">
          <div class="acb-hero-copy">
            <div class="acb-eyebrow">
              <span class="acb-eyebrow-dot"></span>
              PRIVATE BY DESIGN · YOUR DRIVE, YOUR DATA
            </div>
            <h1 class="acb-h1">
              Every rupee,<br>
              <span class="acb-shimmer">in plain sight.</span>
            </h1>
            <p class="acb-sub">
              Say <em>"spent ₹82 on groceries"</em> and it's logged. Budgets warn you
              <em>before</em> you overshoot, family stays in sync, and everything is backed up
              privately to <strong>your own Google Drive</strong> — never our servers.
            </p>

            @if (errorMessage()) {
              <div class="acb-err" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.62 0.2 25)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                <p>{{ errorMessage() }}</p>
              </div>
              <button type="button" class="acb-retry" (click)="onSignIn()">{{ 'common.retry' | translate }}</button>
            } @else {
              <div class="acb-cta-row">
                <button type="button" class="acb-google-btn" (click)="onSignIn()" [disabled]="isLoading()">
                  @if (isLoading()) {
                    <span class="acb-spinner"></span>
                    <span>{{ 'auth.signingIn' | translate }}</span>
                  } @else {
                    <svg style="width: 17px; height: 17px; flex-shrink: 0;" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>{{ 'auth.signIn' | translate }}</span>
                  }
                </button>
                <span class="acb-cta-sub">Free forever · No credit card</span>
              </div>
            }

            <div class="acb-ticks">
              @for (tick of heroTicks; track tick) {
                <span class="acb-tick">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.62 0.16 155)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{{ tick }}
                </span>
              }
            </div>
          </div>

          <!-- Live glass dashboard -->
          <div class="acb-mock-wrap">
            <div class="acb-mock-halo"></div>
            <div class="acb-mock-card">
              <div class="acb-mock-head">
                <p class="acb-mock-label">Today · Live</p>
                <span class="acb-mock-sync"><span class="acb-mock-sync-dot"></span>Synced to your Drive</span>
              </div>
              <p class="acb-mock-amount">₹{{ todayDisplay() }}<span> of ₹1,933 today</span></p>
              <div class="acb-mock-track"><div class="acb-mock-fill"></div></div>
              <div class="acb-feed">
                @for (e of feed(); track e.key) {
                  <div class="acb-feed-row">
                    <div class="acb-feed-icon" [style.background]="e.bg">{{ e.emoji }}</div>
                    <div class="acb-feed-main">
                      <div class="acb-feed-name">{{ e.name }}</div>
                      <div class="acb-feed-meta">{{ e.cat }} · {{ e.via }}</div>
                    </div>
                    <div class="acb-feed-amt">{{ e.amount }}</div>
                  </div>
                }
              </div>
              <div class="acb-limits">
                @for (l of limitRows; track l.name) {
                  <div>
                    <div class="acb-limit-head"><span class="n">{{ l.name }}</span><span class="v">{{ l.spent }} / {{ l.limit }}</span></div>
                    <div class="acb-limit-track">
                      <div class="acb-limit-fill" [style.width]="l.pct" [style.background]="l.color" [style.animation-delay]="l.delay"></div>
                    </div>
                  </div>
                }
              </div>
            </div>
            <div class="acb-voice-chip">
              <div class="acb-voice-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--acc-ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              </div>
              <div>
                <div class="acb-voice-quote">"Spent ₹82 on groceries"</div>
                <div class="acb-voice-result">→ Logged by Gemini in 3s</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- ============ MARQUEE ============ -->
      <div class="acb-marquee" aria-hidden="true">
        <div class="acb-marquee-track">
          <div class="acb-marquee-list">
            @for (k of marqueeKeywords; track k) { <span>{{ k }}</span><span class="d">◆</span> }
          </div>
          <div class="acb-marquee-list">
            @for (k of marqueeKeywords; track k) { <span>{{ k }}</span><span class="d">◆</span> }
          </div>
        </div>
      </div>

      <!-- ============ LIFECYCLE ============ -->
      <section id="how" class="acb-section">
        <div class="acb-how-inner">
          <div data-reveal>
            <div class="acb-kicker">The lifecycle</div>
            <h2 class="acb-h2">Every rupee follows a precise, private path.</h2>
            <p class="acb-section-sub" style="max-width: 460px;">From your phone to your long-term reports — automated, categorised, and synced to your personal Google Drive.</p>
            <div class="acb-steps">
              <div class="acb-steps-line"></div>
              @for (s of steps; track s.n) {
                <div class="acb-step">
                  <div class="acb-step-n">{{ s.n }}</div>
                  <div>
                    <div class="acb-step-title">{{ s.title }}</div>
                    <div class="acb-step-desc">{{ s.body }}</div>
                  </div>
                </div>
              }
            </div>
          </div>
          <!-- Voice → form transformation card -->
          <div data-reveal class="acb-voice-demo">
            <div class="acb-glass-card">
              <div class="acb-card-label">You say</div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="acb-wave">
                  <span style="height: 10px"></span><span style="height: 22px"></span><span style="height: 14px"></span><span style="height: 24px"></span><span style="height: 8px"></span>
                </div>
                <span class="acb-say-quote">"Spent ₹82 on groceries yesterday"</span>
              </div>
            </div>
            <div style="display: flex; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
            </div>
            <div class="acb-glass-card">
              <div class="acb-card-label" style="margin-bottom: 14px;">Gemini fills the form</div>
              <div class="acb-form-grid">
                <div class="acb-form-cell"><div class="k">AMOUNT</div><div class="v">₹82</div></div>
                <div class="acb-form-cell"><div class="k">CATEGORY</div><div class="v">🛒 Food &amp; Groceries</div></div>
                <div class="acb-form-cell"><div class="k">DATE</div><div class="v">Yesterday</div></div>
                <div class="acb-form-cell acb-form-cell-ok"><div class="k">STATUS</div><div class="v">✓ Logged</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ FEATURES ============ -->
      <section id="features" class="acb-section">
        <div class="acb-features-inner">
          <div data-reveal class="acb-features-head">
            <div class="acb-kicker">Features</div>
            <h2 class="acb-h2">One calm dashboard. Eight quiet superpowers.</h2>
            <p class="acb-section-sub">Built for the way Indian households actually spend.</p>
          </div>
          <div data-reveal class="acb-features-grid">
            @for (f of allFeatures; track f.name) {
              <div class="acb-feature-card">
                <div class="acb-feature-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acc-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="f.iconD"/></svg>
                </div>
                <div class="acb-feature-name">{{ f.name }}</div>
                <div class="acb-feature-desc">{{ f.desc }}</div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- ============ PRICING ============ -->
      <section id="pricing" class="acb-section">
        <div class="acb-pricing-inner">
          <div data-reveal class="acb-pricing-head">
            <div class="acb-kicker">Pricing</div>
            <h2 class="acb-h2">No hidden fees. No data selling.</h2>
            <p class="acb-section-sub">Pro access stays until the period ends. Cancel anytime.</p>
          </div>
          <div data-reveal class="acb-pricing-grid">
            <div class="acb-plan">
              <div class="acb-plan-tier">Free</div>
              <div class="acb-plan-name">Spenza Free</div>
              <div class="acb-plan-price">₹0</div>
              <div class="acb-plan-period">forever</div>
              <div class="acb-plan-feats">
                @for (x of freeFeatures; track x) {
                  <div class="acb-plan-feat"><span class="c">✓</span>{{ x }}</div>
                }
              </div>
              <button type="button" class="acb-plan-btn-free" (click)="onSignIn()" [disabled]="isLoading()">Get Started</button>
            </div>
            <div class="acb-plan acb-plan-pro">
              <div class="acb-plan-flag">RECOMMENDED</div>
              <div class="acb-plan-tier">Pro</div>
              <div class="acb-plan-name">Spenza Pro</div>
              <div class="acb-plan-price">₹499 <span>/ month</span></div>
              <div class="acb-plan-period">or ₹3,999/year (save 33%) — cancel anytime</div>
              <div class="acb-plan-feats">
                @for (x of proFeatures; track x) {
                  <div class="acb-plan-feat"><span class="c">✓</span>{{ x }}</div>
                }
              </div>
              <button type="button" class="acb-plan-btn-pro" (click)="onSignIn()" [disabled]="isLoading()">Go Pro</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ FINAL CTA ============ -->
      <section class="acb-final">
        <div data-reveal class="acb-final-inner">
          <h2 class="acb-final-h">Start your journey to <span class="acb-final-grad">financial clarity.</span></h2>
          <p class="acb-final-sub">Free forever. Private by design. 30 seconds to set up.</p>
          @if (errorMessage()) {
            <button type="button" class="acb-retry" style="margin: 0 auto;" (click)="onSignIn()">{{ 'common.retry' | translate }}</button>
          } @else {
            <button type="button" class="acb-google-btn" (click)="onSignIn()" [disabled]="isLoading()">
              @if (isLoading()) {
                <span class="acb-spinner"></span>
                <span>{{ 'auth.signingIn' | translate }}</span>
              } @else {
                <svg style="width: 17px; height: 17px; flex-shrink: 0;" viewBox="0 0 24 24">
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

      <!-- ============ FOOTER ============ -->
      <footer class="acb-footer">
        <span>© {{ year }} Spenza · Privacy by design</span>
        <div style="display: flex; gap: 24px;">
          <a href="#/privacy">Privacy</a>
          <a href="#/terms">Terms</a>
        </div>
      </footer>
    </div>
  `,
})
export class AuthCallbackComponent implements AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly backupModeService = inject(BackupModeService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly familySyncService = inject(FamilySyncService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  readonly year = new Date().getFullYear();

  /* ---------- decorative live-dashboard state ---------- */

  private readonly todaySpent = signal(0);
  private readonly feedIdx = signal(0);
  readonly todayDisplay = computed(() => this.todaySpent().toLocaleString('en-IN'));

  private raf = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private io: IntersectionObserver | null = null;
  private heroEl: HTMLElement | null = null;
  private readonly onHeroMove = (ev: MouseEvent): void => {
    if (!this.heroEl) return;
    const r = this.heroEl.getBoundingClientRect();
    this.heroEl.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    this.heroEl.style.setProperty('--my', `${ev.clientY - r.top}px`);
  };

  /** Illustrative rotating feed; categories match real Spenza category names. */
  private readonly pool: FeedItem[] = [
    { emoji: '☕', name: 'Morning Coffee', cat: 'Dining Out', via: 'Widget', amount: '-₹80', bg: 'oklch(0.85 0.17 80 / 0.18)' },
    { emoji: '🚌', name: 'Metro Card', cat: 'Transport', via: 'SMS detected', amount: '-₹50', bg: 'oklch(0.78 0.16 230 / 0.18)' },
    { emoji: '🍱', name: 'Office Lunch', cat: 'Dining Out', via: 'Voice', amount: '-₹220', bg: 'oklch(0.78 0.18 155 / 0.18)' },
    { emoji: '💊', name: 'Pharmacy', cat: 'Healthcare', via: 'Manual', amount: '-₹340', bg: 'oklch(0.74 0.20 15 / 0.18)' },
    { emoji: '🛒', name: 'Groceries', cat: 'Food & Groceries', via: 'Voice · Gemini', amount: '-₹82', bg: 'oklch(0.78 0.18 145 / 0.18)' },
    { emoji: '📱', name: 'Mobile Recharge', cat: 'Utilities', via: 'SMS detected', amount: '-₹299', bg: 'oklch(0.78 0.14 210 / 0.18)' },
    { emoji: '🎬', name: 'Movie Tickets', cat: 'Entertainment', via: 'Family sync', amount: '-₹560', bg: 'oklch(0.74 0.22 305 / 0.18)' },
    { emoji: '⛽', name: 'Petrol', cat: 'Transport', via: 'Widget', amount: '-₹101', bg: 'oklch(0.78 0.18 50 / 0.18)' },
  ];

  readonly feed = computed(() => {
    const idx = this.feedIdx();
    return Array.from({ length: 4 }, (_, i) => ({
      ...this.pool[(idx + i) % this.pool.length],
      key: idx + i,
    }));
  });

  readonly limitRows = [
    { name: 'Housing', spent: '₹13,500', limit: '₹14,500', pct: '93%', color: 'oklch(0.62 0.18 280)', delay: '0.6s' },
    { name: 'Food & Groceries', spent: '₹1,798', limit: '₹6,960', pct: '26%', color: 'oklch(0.62 0.16 155)', delay: '0.7s' },
    { name: 'Transport', spent: '₹1,800', limit: '₹4,060', pct: '44%', color: 'oklch(0.62 0.14 210)', delay: '0.8s' },
  ];

  /* ---------- static copy ---------- */

  readonly heroTicks = ['Works offline', 'No ads, no data selling', 'English · தமிழ் · हिन्दी'];

  readonly marqueeKeywords = [
    'VOICE ENTRY', 'FAMILY SYNC', 'EMI & DEBT', 'DRIVE BACKUP',
    'SMS DETECTION', 'AI INSIGHTS', '50/30/20 BUDGETS', 'OFFLINE FIRST',
  ];

  readonly steps = [
    { n: '01', title: 'Capture', body: 'Text, voice, or AI smart-fill. Under 5 seconds. Works offline too.' },
    { n: '02', title: 'Process', body: 'On-device categorisation, limit checks, budget alerts — so you know where you stand today.' },
    { n: '03', title: 'Archive', body: 'Private sync to your personal Google Drive. Your data, your account — we never touch it.' },
  ];

  readonly allFeatures = [
    { name: 'Voice Entry', desc: '"Spent ₹82 on groceries yesterday." Gemini parses it into a filled form.', iconD: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3' },
    { name: 'Family Sync', desc: 'Share with a partner in real-time. Shared budgets, individual privacy.', iconD: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { name: 'EMI & Debt', desc: 'Credit cards, personal, vehicle, home loans. Visual payoff progress.', iconD: 'M22 7H2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2ZM2 7V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2M2 10h20' },
    { name: 'Drive Backup', desc: 'Private backup to your own Google Drive. We never see it.', iconD: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' },
    { name: 'AI Insights', desc: 'On-device analysis gives you proactive spending nudges.', iconD: 'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6' },
    { name: 'SMS Detection', desc: 'On-device parsing prompts you to log real spend — never touches your inbox.', iconD: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { name: 'Multilingual', desc: 'English, Tamil, Hindi — including voice entry in all three.', iconD: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20' },
    { name: 'Privacy First', desc: 'No ads. No data selling. Receipts and comments never leave your device.', iconD: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4' },
  ];

  /** Matches the subscribe page + welcome page — single source of truth. */
  readonly freeFeatures = [
    'Unlimited daily expense tracking',
    'All 14 spending categories',
    'Dashboards & spend trends',
    'Private Google Drive backup',
    'Offline mode — Android & Web',
  ];

  readonly proFeatures = [
    'Everything in Free',
    'Advanced spending insights',
    'Family sync mode',
    'Receipt scanner (OCR)',
    'CSV & Sheets export',
    'Custom budget limits',
    'Priority support',
  ];

  constructor() {
    this.loadDisplayFont();
  }

  ngAfterViewInit(): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root: HTMLElement = this.host.nativeElement;

    // Count-up for the hero "today spent" figure.
    const target = 1732;
    if (reduce) {
      this.todaySpent.set(target);
    } else {
      const t0 = performance.now();
      const dur = 1500;
      const tick = (t: number): void => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        this.todaySpent.set(Math.round(target * eased));
        if (p < 1) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    // Rotating live-expense ticker.
    if (!reduce) {
      this.ticker = setInterval(() => this.feedIdx.update((i) => (i + 1) % this.pool.length), 3200);
    }

    // Cursor spotlight on the hero.
    this.heroEl = root.querySelector<HTMLElement>('.acb-hero');
    if (this.heroEl && !reduce) this.heroEl.addEventListener('mousemove', this.onHeroMove);

    // Scroll reveal — progressive enhancement, page readable without JS.
    if (!reduce && 'IntersectionObserver' in window) {
      const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
      this.io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            (en.target as HTMLElement).style.opacity = '1';
            (en.target as HTMLElement).style.transform = 'translateY(0)';
            this.io?.unobserve(en.target);
          }
        }
      }, { threshold: 0.12 });
      for (const el of els) {
        if (el.getBoundingClientRect().top > window.innerHeight) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(28px)';
          el.style.transition = 'opacity 0.7s ease-out, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
        }
        this.io.observe(el);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.ticker) clearInterval(this.ticker);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    if (this.heroEl) this.heroEl.removeEventListener('mousemove', this.onHeroMove);
  }

  // Hash-based routing: href="#section" anchors would be treated as route
  // changes. Scroll manually instead, offset for the sticky nav.
  scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 72,
      behavior: 'smooth',
    });
  }

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

  /**
   * Lazily load the Bricolage Grotesque display font (shared element id with
   * WelcomeComponent — whichever page loads first injects it once).
   */
  private loadDisplayFont(): void {
    const id = 'spenza-landing-display-font';
    if (document.getElementById(id)) return;
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://fonts.gstatic.com';
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700;800&display=swap';
    document.head.appendChild(link);
  }
}
