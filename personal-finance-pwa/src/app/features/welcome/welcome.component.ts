import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SpenzaLogoComponent } from '../../shared/components/spenza-logo/spenza-logo.component';

interface LandingFeature {
  title: string;
  body: string;
  bg: string;
  iconD: string;
  iconColor: string;
}

interface LandingStep {
  n: string;
  title: string;
  body: string;
}

interface LandingFaq {
  q: string;
  a: string;
}

/**
 * Public, unauthenticated landing page served at the root URL (`/`).
 *
 * This page exists so that anyone — including a Google OAuth verification
 * reviewer or a search crawler — can read what Spenza is and how it uses the
 * Google account data it requests, WITHOUT signing in. It is intentionally
 * NOT behind authGuard/setupGuard and is rendered shell-less (see app.html).
 *
 * Signed-in users are bounced straight to the app so they never see it.
 *
 * Visual design ported from the "Welcome v2" Claude Design file (2026-07-24):
 * indigo accent, Bricolage Grotesque display font (web-font loaded lazily,
 * system fallback), hero product mockup, marquee, features, numbers strip,
 * how-it-works, pricing, FAQ, Google data-use disclosure, dark footer CTA.
 * The design's testimonials section was deliberately dropped (fabricated
 * quotes — do not ship fake social proof).
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SpenzaLogoComponent],
  styles: [`
    :host {
      display: block;
      --acc: oklch(0.55 0.22 280);
      --acc-glow: oklch(0.65 0.24 305);
      --acc-soft: oklch(0.55 0.22 280 / 0.09);
      --acc-fg: oklch(0.99 0 0);
      --ink: oklch(0.18 0.04 265);
      --ink-soft: oklch(0.45 0.03 260);
      --ink-muted: oklch(0.50 0.03 260);
      --line: oklch(0.92 0.01 270);
      --paper: oklch(0.985 0.005 250);
      --font-display: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
    }
    .lp-root {
      min-height: 100vh;
      color: var(--ink);
      background: var(--paper);
      overflow-x: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .lp-root a { text-decoration: none; }

    /* ---------- nav ---------- */
    .lp-nav {
      position: sticky; top: 0; z-index: 50;
      backdrop-filter: blur(14px);
      background: oklch(0.985 0.005 250 / 0.82);
      border-bottom: 1px solid var(--line);
    }
    .lp-nav-inner {
      max-width: 1120px; margin: 0 auto; padding: 0 24px; height: 60px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
    }
    .lp-brand { display: flex; align-items: center; gap: 10px; }
    .lp-brand-name {
      font-family: var(--font-display);
      font-weight: 800; font-size: 19px; letter-spacing: -0.02em;
    }
    .lp-nav-links {
      display: flex; align-items: center; gap: 4px;
      font-size: 14px; font-weight: 500; color: oklch(0.40 0.03 260);
    }
    .lp-nav-link {
      padding: 8px 12px; border-radius: 10px; color: inherit;
      background: none; border: none; cursor: pointer; font: inherit;
      transition: background 0.15s, color 0.15s;
    }
    .lp-nav-link:hover { background: oklch(0.96 0.01 260); color: var(--ink); }
    .lp-cta-sm {
      display: inline-flex; align-items: center; gap: 7px; border-radius: 12px;
      background: var(--acc); padding: 9px 18px; font-size: 14px; font-weight: 600;
      color: var(--acc-fg); box-shadow: 0 10px 24px -10px var(--acc);
      transition: opacity 0.15s;
    }
    .lp-cta-sm:hover { opacity: 0.92; }

    /* ---------- hero ---------- */
    .lp-hero {
      position: relative; border-bottom: 1px solid var(--line);
      background:
        radial-gradient(at 10% 0%, oklch(0.92 0.08 280 / 0.55) 0px, transparent 50%),
        radial-gradient(at 90% 10%, oklch(0.92 0.08 200 / 0.45) 0px, transparent 50%),
        radial-gradient(at 50% 100%, oklch(0.94 0.06 155 / 0.45) 0px, transparent 50%),
        var(--paper);
    }
    .lp-hero-inner {
      max-width: 1120px; margin: 0 auto; padding: 72px 24px 88px;
      display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center;
    }
    .lp-hero-copy { animation: fadeUp 0.7s ease-out both; }
    .lp-eyebrow {
      display: inline-flex; align-items: center; gap: 8px; border-radius: 9999px;
      border: 1px solid var(--line); background: #ffffff; padding: 7px 16px;
      font-size: 12.5px; font-weight: 500; color: var(--ink-soft); margin-bottom: 26px;
      box-shadow: 0 1px 2px 0 oklch(0.20 0.04 265 / 0.05);
    }
    .lp-eyebrow-dot {
      width: 8px; height: 8px; border-radius: 9999px;
      background: oklch(0.65 0.17 155); display: inline-block;
      animation: pulseDot 2.4s ease-in-out infinite;
    }
    .lp-h1 {
      font-family: var(--font-display);
      font-size: clamp(42px, 5.2vw, 62px); font-weight: 800;
      letter-spacing: -0.03em; line-height: 1.06; margin: 0; text-wrap: balance;
    }
    .lp-grad-text {
      background: linear-gradient(100deg, var(--acc), var(--acc-glow));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lp-sub {
      margin: 22px 0 0; font-size: 18px; color: var(--ink-soft);
      line-height: 1.65; max-width: 480px; text-wrap: pretty;
    }
    .lp-sub em { font-style: normal; font-weight: 600; color: var(--ink); }
    .lp-hero-ctas { margin-top: 34px; display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
    .lp-cta-lg {
      display: inline-flex; align-items: center; gap: 9px; border-radius: 14px;
      background: var(--acc); padding: 15px 30px; font-size: 15px; font-weight: 600;
      color: var(--acc-fg); box-shadow: 0 16px 36px -12px var(--acc);
      transition: transform 0.15s;
    }
    .lp-cta-lg:hover { transform: translateY(-2px); }
    .lp-cta-ghost {
      display: inline-flex; align-items: center; gap: 8px; border-radius: 14px;
      border: 1px solid var(--line); background: #ffffff; padding: 15px 26px;
      font-size: 15px; font-weight: 600; color: var(--ink); cursor: pointer;
      box-shadow: 0 1px 2px 0 oklch(0.20 0.04 265 / 0.05); font-family: inherit;
      transition: background 0.15s;
    }
    .lp-cta-ghost:hover { background: oklch(0.96 0.01 260); }
    .lp-hero-ticks {
      margin-top: 30px; display: flex; align-items: center; gap: 18px;
      font-size: 13px; color: var(--ink-muted); flex-wrap: wrap;
    }
    .lp-tick { display: inline-flex; align-items: center; gap: 6px; }

    /* ---------- hero mockup ---------- */
    .lp-mock-wrap { position: relative; animation: fadeUp 0.7s ease-out 0.15s both; }
    .lp-mock-halo {
      position: absolute; inset: -40px -20px;
      background: radial-gradient(closest-side, var(--acc-soft), transparent);
      border-radius: 50%;
    }
    .lp-mock-card {
      position: relative; border-radius: 28px; background: #ffffff;
      border: 1px solid var(--line);
      box-shadow: 0 40px 80px -30px oklch(0.20 0.04 265 / 0.25);
      padding: 26px; animation: floaty 7s ease-in-out infinite;
    }
    .lp-mock-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .lp-mock-label {
      margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: oklch(0.55 0.03 260);
    }
    .lp-mock-amount {
      margin: 4px 0 0; font-family: var(--font-display);
      font-size: 34px; font-weight: 800; letter-spacing: -0.02em;
    }
    .lp-mock-badge {
      display: inline-flex; align-items: center; gap: 6px; border-radius: 9999px;
      background: oklch(0.65 0.17 155 / 0.12); color: oklch(0.48 0.14 155);
      font-size: 12px; font-weight: 600; padding: 6px 12px;
    }
    .lp-mock-grid { display: grid; grid-template-columns: 116px 1fr; gap: 22px; align-items: center; }
    .lp-donut-active { animation: donutIn 1.2s ease-out both; }
    .lp-bars { display: flex; flex-direction: column; gap: 12px; }
    .lp-bar-row { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 5px; }
    .lp-bar-row .n { font-weight: 600; }
    .lp-bar-row .v { color: var(--ink-muted); }
    .lp-bar-track { height: 7px; border-radius: 9999px; background: oklch(0.96 0.01 260); overflow: hidden; }
    .lp-bar-fill {
      height: 100%; border-radius: 9999px; transform-origin: left;
      animation: growX 0.9s ease-out both;
    }
    .lp-chip {
      position: absolute; display: flex; align-items: center; gap: 9px;
      border-radius: 16px; background: #ffffff; border: 1px solid var(--line);
      box-shadow: 0 16px 40px -10px oklch(0.20 0.04 265 / 0.18);
      padding: 11px 15px; font-size: 13px; font-weight: 600;
    }
    .lp-chip small { font-weight: 400; font-size: 11.5px; color: var(--ink-muted); }
    .lp-chip-top { top: -22px; right: -14px; animation: floaty2 6s ease-in-out infinite; }
    .lp-chip-bottom { bottom: -24px; left: -18px; animation: floaty 5.4s ease-in-out 0.8s infinite; }
    .lp-chip-icon {
      width: 32px; height: 32px; border-radius: 10px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .lp-coin {
      position: absolute; top: 42%; right: -34px;
      filter: drop-shadow(0 10px 20px oklch(0.20 0.04 265 / 0.2));
      animation: floaty2 8s ease-in-out 1.5s infinite;
    }

    /* ---------- marquee ---------- */
    .lp-marquee {
      border-bottom: 1px solid var(--line); background: #ffffff;
      overflow: hidden; padding: 15px 0;
    }
    .lp-marquee-track { display: flex; width: max-content; animation: marquee 32s linear infinite; }
    .lp-marquee-item {
      display: inline-flex; align-items: center; gap: 10px; padding: 0 26px;
      font-size: 13.5px; font-weight: 600; color: oklch(0.42 0.03 260); white-space: nowrap;
    }
    .lp-marquee-dot {
      width: 6px; height: 6px; border-radius: 9999px;
      background: linear-gradient(135deg, #F5D76E, #C49A28); display: inline-block;
    }

    /* ---------- shared section bits ---------- */
    .lp-section { max-width: 1120px; margin: 0 auto; padding: 88px 24px 20px; }
    .lp-section-head { text-align: center; max-width: 620px; margin: 0 auto 52px; }
    .lp-kicker {
      font-size: 13px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: var(--acc); margin: 0 0 14px;
    }
    .lp-h2 {
      font-family: var(--font-display);
      font-size: clamp(30px, 3.6vw, 42px); font-weight: 800;
      letter-spacing: -0.025em; line-height: 1.12; margin: 0; text-wrap: balance;
    }
    .lp-section-sub { margin: 16px 0 0; font-size: 16.5px; color: var(--ink-soft); line-height: 1.65; }
    [data-reveal] { will-change: opacity, transform; }

    /* ---------- features ---------- */
    .lp-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    .lp-feature-card {
      border-radius: 22px; background: #ffffff; border: 1px solid var(--line);
      padding: 26px; box-shadow: 0 1px 2px 0 oklch(0.20 0.04 265 / 0.05);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .lp-feature-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 44px -16px oklch(0.20 0.04 265 / 0.18);
    }
    .lp-feature-icon {
      width: 46px; height: 46px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-bottom: 16px;
    }
    .lp-feature-card h3 { font-weight: 700; margin: 0 0 7px; font-size: 17px; letter-spacing: -0.01em; }
    .lp-feature-card p { font-size: 14.5px; color: oklch(0.48 0.03 260); line-height: 1.6; margin: 0; text-wrap: pretty; }

    /* ---------- numbers strip ---------- */
    .lp-numbers-section { max-width: 1120px; margin: 0 auto; padding: 56px 24px; }
    .lp-numbers {
      border-radius: 26px; border: 1px solid var(--line);
      background: linear-gradient(120deg, #1c1917, #292420); color: oklch(0.97 0.005 250);
      padding: 40px 32px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px;
      box-shadow: 0 30px 60px -24px oklch(0.20 0.04 265 / 0.35);
    }
    .lp-number { text-align: center; }
    .lp-number-value {
      font-family: var(--font-display);
      font-size: 34px; font-weight: 800; margin: 0;
      background: linear-gradient(135deg, #F5D76E, #D6AE33);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lp-number-label { font-size: 13px; color: oklch(0.75 0.01 260); margin: 6px 0 0; }

    /* ---------- how it works ---------- */
    .lp-how-section { max-width: 1120px; margin: 0 auto; padding: 44px 24px 72px; }
    .lp-steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    .lp-step-card {
      position: relative; border-radius: 22px; background: #ffffff;
      border: 1px solid var(--line); padding: 30px 26px 26px;
      box-shadow: 0 1px 2px 0 oklch(0.20 0.04 265 / 0.05);
    }
    .lp-step-n {
      position: absolute; top: -16px; left: 24px; width: 34px; height: 34px;
      border-radius: 12px; background: linear-gradient(135deg, var(--acc), var(--acc-glow));
      color: var(--acc-fg); display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 15px; box-shadow: 0 8px 18px -6px var(--acc);
    }
    .lp-step-card h3 { font-weight: 700; margin: 8px 0 8px; font-size: 17px; }
    .lp-step-card p { font-size: 14.5px; color: oklch(0.48 0.03 260); line-height: 1.6; margin: 0; text-wrap: pretty; }

    /* ---------- pricing ---------- */
    .lp-pricing-section { max-width: 1120px; margin: 0 auto; padding: 88px 24px 72px; }
    .lp-pricing-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
      max-width: 860px; margin: 0 auto; align-items: stretch;
    }
    .lp-plan {
      border-radius: 24px; border: 1px solid var(--line); background: #ffffff;
      padding: 34px 30px; display: flex; flex-direction: column;
      box-shadow: 0 1px 2px 0 oklch(0.20 0.04 265 / 0.05);
    }
    .lp-plan-pro {
      position: relative; border: 1.5px solid var(--acc);
      box-shadow: 0 24px 50px -20px var(--acc);
    }
    .lp-plan-flag {
      position: absolute; top: -13px; right: 26px; border-radius: 9999px;
      background: linear-gradient(135deg, #F5D76E, #C49A28); color: #2A2620;
      font-size: 12px; font-weight: 800; padding: 5px 14px; letter-spacing: 0.02em;
    }
    .lp-plan h3 { margin: 0; font-size: 18px; font-weight: 700; }
    .lp-plan-pro h3 { color: var(--acc); }
    .lp-plan-desc { margin: 6px 0 0; font-size: 14px; color: var(--ink-muted); }
    .lp-plan-price {
      margin: 20px 0 0; font-family: var(--font-display);
      font-size: 40px; font-weight: 800; letter-spacing: -0.02em;
    }
    .lp-plan-price span { font-size: 15px; font-weight: 500; color: var(--ink-muted); }
    .lp-plan-alt { margin: 4px 0 0; font-size: 13px; color: var(--ink-muted); }
    .lp-plan-alt strong { color: oklch(0.48 0.14 155); font-weight: 700; }
    .lp-plan ul {
      list-style: none; margin: 24px 0 28px; padding: 0;
      display: flex; flex-direction: column; gap: 11px;
      font-size: 14.5px; color: oklch(0.35 0.03 260);
    }
    .lp-plan li { display: flex; gap: 10px; align-items: flex-start; }
    .lp-plan li svg { flex-shrink: 0; margin-top: 2px; }
    .lp-plan-cta-free {
      margin-top: auto; display: inline-flex; align-items: center; justify-content: center;
      border-radius: 14px; border: 1px solid var(--line); background: var(--paper);
      padding: 13px 24px; font-size: 14.5px; font-weight: 600; color: var(--ink);
      transition: background 0.15s;
    }
    .lp-plan-cta-free:hover { background: oklch(0.96 0.01 260); }
    .lp-plan-cta-pro {
      margin-top: auto; display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; border-radius: 14px; background: var(--acc); padding: 13px 24px;
      font-size: 14.5px; font-weight: 600; color: var(--acc-fg);
      box-shadow: 0 12px 26px -10px var(--acc); transition: opacity 0.15s;
    }
    .lp-plan-cta-pro:hover { opacity: 0.92; }

    /* ---------- faq ---------- */
    .lp-faq-section { max-width: 760px; margin: 0 auto; padding: 20px 24px 88px; }
    .lp-faq-list { display: flex; flex-direction: column; gap: 12px; }
    .lp-faq-item {
      border-radius: 18px; border: 1px solid var(--line); background: #ffffff;
      padding: 0 22px; box-shadow: 0 1px 2px 0 oklch(0.20 0.04 265 / 0.05);
    }
    .lp-faq-item summary {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      cursor: pointer; padding: 19px 0; font-weight: 600; font-size: 15.5px;
      list-style: none;
    }
    .lp-faq-item summary::-webkit-details-marker { display: none; }
    .lp-faq-chev {
      flex-shrink: 0; width: 26px; height: 26px; border-radius: 9999px;
      background: var(--acc-soft); color: var(--acc);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 500; transition: transform 0.2s;
    }
    .lp-faq-item[open] .lp-faq-chev { transform: rotate(45deg); }
    .lp-faq-item p {
      margin: 0; padding: 0 34px 20px 0;
      font-size: 14.5px; line-height: 1.65; color: var(--ink-soft);
    }

    /* ---------- data use ---------- */
    .lp-datause { background: #ffffff; border-top: 1px solid var(--line); }
    .lp-datause-inner { max-width: 860px; margin: 0 auto; padding: 72px 24px; scroll-margin-top: 72px; }
    .lp-datause-h {
      font-family: var(--font-display);
      font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px;
    }
    .lp-datause-sub { font-size: 15px; color: var(--ink-soft); line-height: 1.65; margin: 0 0 26px; max-width: 640px; }
    .lp-scope-card {
      border-radius: 20px; border: 1px solid var(--line); background: var(--paper); padding: 24px;
    }
    .lp-scope-row { display: flex; align-items: flex-start; gap: 16px; }
    .lp-scope-icon {
      width: 44px; height: 44px; border-radius: 13px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .lp-scope-card h3 { font-weight: 700; margin: 0; font-size: 16px; }
    .lp-scope-tag {
      font-size: 12.5px; color: var(--ink-muted); margin: 2px 0 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .lp-scope-card .lp-scope-body { font-size: 14.5px; color: var(--ink-soft); line-height: 1.65; margin: 0; }

    /* ---------- footer ---------- */
    .lp-footer { background: linear-gradient(180deg, #1c1917, #121009); color: oklch(0.92 0.005 250); }
    .lp-footer-inner { max-width: 1120px; margin: 0 auto; padding: 72px 24px 40px; }
    .lp-footer-cta { text-align: center; max-width: 560px; margin: 0 auto 60px; }
    .lp-footer-h {
      font-family: var(--font-display);
      font-size: clamp(30px, 3.8vw, 44px); font-weight: 800;
      letter-spacing: -0.025em; line-height: 1.1; margin: 0; color: #ffffff;
    }
    .lp-gold-text {
      background: linear-gradient(135deg, #F5D76E, #D6AE33);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lp-footer-btn {
      margin-top: 30px; display: inline-flex; align-items: center; gap: 9px;
      border-radius: 14px; background: linear-gradient(135deg, #F5D76E, #C49A28);
      padding: 15px 32px; font-size: 15px; font-weight: 700; color: #2A2620;
      box-shadow: 0 16px 40px -12px #C49A28; transition: opacity 0.15s;
    }
    .lp-footer-btn:hover { opacity: 0.92; }
    .lp-footer-bar {
      border-top: 1px solid oklch(1 0 0 / 0.12); padding-top: 28px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 16px; font-size: 13.5px; color: oklch(0.70 0.01 260);
    }
    .lp-footer-brand { font-weight: 600; color: #ffffff; }
    .lp-footer-links { display: flex; gap: 22px; }
    .lp-footer-links a, .lp-footer-links button {
      color: oklch(0.80 0.02 90); background: none; border: none;
      cursor: pointer; font: inherit; padding: 0; transition: color 0.15s;
    }
    .lp-footer-links a:hover, .lp-footer-links button:hover { color: #F5D76E; }

    /* ---------- animations ---------- */
    @keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes floaty2 { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-14px) rotate(2deg); } }
    @keyframes growX { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes donutIn { from { stroke-dashoffset: 264; } }
    @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes pulseDot {
      0%, 100% { box-shadow: 0 0 0 0 oklch(0.65 0.17 155 / 0.5); }
      50% { box-shadow: 0 0 0 6px oklch(0.65 0.17 155 / 0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .lp-root *, .lp-root { animation-duration: 0.01s !important; transition-duration: 0.01s !important; }
    }

    /* ---------- responsive (not in the design file — added for mobile) ---------- */
    @media (max-width: 1000px) {
      .lp-features-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 960px) {
      .lp-hero-inner { grid-template-columns: 1fr; gap: 64px; padding: 56px 24px 96px; }
      .lp-mock-wrap { max-width: 480px; margin: 0 auto; }
      .lp-coin { display: none; }
      .lp-chip-top { right: 4px; }
      .lp-chip-bottom { left: 0; }
    }
    @media (max-width: 860px) {
      .lp-steps-grid { grid-template-columns: 1fr; gap: 30px; }
      .lp-pricing-grid { grid-template-columns: 1fr; }
      .lp-numbers { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 760px) {
      .lp-nav-links { display: none; }
    }
    @media (max-width: 640px) {
      .lp-features-grid { grid-template-columns: 1fr; }
      .lp-mock-grid { grid-template-columns: 1fr; justify-items: center; }
      .lp-hero-inner { padding: 48px 20px 88px; }
    }
  `],
  template: `
    <div class="lp-root">

      <!-- ============ NAV ============ -->
      <nav class="lp-nav">
        <div class="lp-nav-inner">
          <div class="lp-brand">
            <app-spenza-logo [size]="34" className="rounded-lg" />
            <span class="lp-brand-name">Spenza</span>
          </div>
          <div class="lp-nav-links">
            <button type="button" class="lp-nav-link" (click)="scrollTo('features')">Features</button>
            <button type="button" class="lp-nav-link" (click)="scrollTo('how')">How it works</button>
            <button type="button" class="lp-nav-link" (click)="scrollTo('pricing')">Pricing</button>
            <button type="button" class="lp-nav-link" (click)="scrollTo('faq')">FAQ</button>
          </div>
          <a routerLink="/daily" class="lp-cta-sm">
            Get Started
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </div>
      </nav>

      <!-- ============ HERO ============ -->
      <header class="lp-hero">
        <div class="lp-hero-inner">
          <div class="lp-hero-copy">
            <div class="lp-eyebrow">
              <span class="lp-eyebrow-dot"></span>
              Personal finance, minus the spreadsheet
            </div>
            <h1 class="lp-h1">
              Every rupee,<br>
              <span class="lp-grad-text">accounted for.</span>
            </h1>
            <p class="lp-sub">
              Spenza turns everyday spending into clear answers — track expenses in seconds,
              scan receipts, set budgets that warn you <em>before</em> you overshoot, and sync
              it all with your family. Your data lives in <strong>your own Google Drive</strong>,
              not on our servers.
            </p>
            <div class="lp-hero-ctas">
              <a routerLink="/daily" class="lp-cta-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                Open Spenza — it's free
              </a>
              <button type="button" class="lp-cta-ghost" (click)="scrollTo('data-use')">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                How your data is used
              </button>
            </div>
            <div class="lp-hero-ticks">
              @for (tick of heroTicks; track tick) {
                <span class="lp-tick">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.65 0.17 155)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{{ tick }}
                </span>
              }
            </div>
          </div>

          <!-- Hero product mockup -->
          <div class="lp-mock-wrap">
            <div class="lp-mock-halo"></div>
            <div class="lp-mock-card">
              <div class="lp-mock-head">
                <div>
                  <p class="lp-mock-label">July spending</p>
                  <p class="lp-mock-amount">₹<span data-count="42350">0</span></p>
                </div>
                <div class="lp-mock-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17V7H7"/><path d="m7 17 10-10" transform="rotate(90 12 12)"/></svg>
                  12% under budget
                </div>
              </div>
              <div class="lp-mock-grid">
                <svg width="116" height="116" viewBox="0 0 100 100" role="img" aria-label="Spending by category donut chart">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(0.96 0.01 260)" stroke-width="12"/>
                  <circle class="lp-donut-active" style="animation-delay: 0.3s" cx="50" cy="50" r="42" fill="none" stroke="oklch(0.66 0.16 155)" stroke-width="12" stroke-linecap="round" stroke-dasharray="100 264" transform="rotate(-90 50 50)"/>
                  <circle class="lp-donut-active" style="animation-delay: 0.5s" cx="50" cy="50" r="42" fill="none" stroke="oklch(0.68 0.16 230)" stroke-width="12" stroke-linecap="round" stroke-dasharray="58 264" transform="rotate(52 50 50)"/>
                  <circle class="lp-donut-active" style="animation-delay: 0.7s" cx="50" cy="50" r="42" fill="none" stroke="oklch(0.70 0.20 350)" stroke-width="12" stroke-linecap="round" stroke-dasharray="52 264" transform="rotate(135 50 50)"/>
                  <circle class="lp-donut-active" style="animation-delay: 0.9s" cx="50" cy="50" r="42" fill="none" stroke="oklch(0.78 0.16 75)" stroke-width="12" stroke-linecap="round" stroke-dasharray="34 264" transform="rotate(210 50 50)"/>
                  <text x="50" y="47" text-anchor="middle" style="font-size: 15px; font-weight: 700; fill: oklch(0.18 0.04 265); font-family: inherit;">14</text>
                  <text x="50" y="61" text-anchor="middle" style="font-size: 7.5px; fill: oklch(0.50 0.03 260); font-family: inherit;">categories</text>
                </svg>
                <div class="lp-bars">
                  @for (bar of mockBars; track bar.label) {
                    <div>
                      <div class="lp-bar-row"><span class="n">{{ bar.label }}</span><span class="v">{{ bar.amount }}</span></div>
                      <div class="lp-bar-track">
                        <div class="lp-bar-fill" [style.width]="bar.width" [style.background]="bar.color" [style.animation-delay]="bar.delay"></div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
            <!-- floating chips -->
            <div class="lp-chip lp-chip-top">
              <span class="lp-chip-icon" style="background: oklch(0.78 0.16 75 / 0.15)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(0.60 0.14 75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </span>
              <span>Dining budget 80% used<br><small>alert · just now</small></span>
            </div>
            <div class="lp-chip lp-chip-bottom">
              <span class="lp-chip-icon" style="background: var(--acc-soft)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/><path d="m2 13 3 3 5-5"/></svg>
              </span>
              <span>Receipt scanned — ₹450<br><small>added to Dining</small></span>
            </div>
            <svg class="lp-coin" width="52" height="52" viewBox="0 0 1024 1024" role="presentation">
              <defs>
                <radialGradient id="lp-coin-g" cx="0.42" cy="0.36" r="0.75"><stop offset="0" stop-color="#FBE79A"/><stop offset="0.45" stop-color="#E6C24E"/><stop offset="0.8" stop-color="#C49A28"/><stop offset="1" stop-color="#8B6F1A"/></radialGradient>
              </defs>
              <circle cx="512" cy="512" r="440" fill="url(#lp-coin-g)"/>
              <circle cx="512" cy="512" r="440" fill="none" stroke="#7A611A" stroke-width="16"/>
              <circle cx="512" cy="512" r="370" fill="none" stroke="#B8911F" stroke-width="14" opacity="0.65"/>
            </svg>
          </div>
        </div>
      </header>

      <!-- ============ SELLING-POINT MARQUEE ============ -->
      <div class="lp-marquee" aria-hidden="true">
        <div class="lp-marquee-track">
          @for (item of marqueeItems; track $index) {
            <span class="lp-marquee-item"><span class="lp-marquee-dot"></span>{{ item }}</span>
          }
        </div>
      </div>

      <!-- ============ FEATURES ============ -->
      <section id="features" class="lp-section">
        <div data-reveal class="lp-section-head">
          <p class="lp-kicker">What you can do</p>
          <h2 class="lp-h2">One app for your whole money life</h2>
          <p class="lp-section-sub">From the morning chai to the monthly rent — logged, categorized, and understood.</p>
        </div>
        <div class="lp-features-grid">
          @for (f of features; track f.title) {
            <div data-reveal class="lp-feature-card">
              <div class="lp-feature-icon" [style.background]="f.bg">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" [attr.stroke]="f.iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="f.iconD"/></svg>
              </div>
              <h3>{{ f.title }}</h3>
              <p>{{ f.body }}</p>
            </div>
          }
        </div>
      </section>

      <!-- ============ NUMBERS STRIP ============ -->
      <section class="lp-numbers-section">
        <div data-reveal class="lp-numbers">
          <div class="lp-number">
            <p class="lp-number-value"><span data-count="100">0</span>%</p>
            <p class="lp-number-label">Your data, your control</p>
          </div>
          <div class="lp-number">
            <p class="lp-number-value">0</p>
            <p class="lp-number-label">Data sold or shared. Ever.</p>
          </div>
          <div class="lp-number">
            <p class="lp-number-value">₹0</p>
            <p class="lp-number-label">To start — free forever plan</p>
          </div>
          <div class="lp-number">
            <p class="lp-number-value"><span data-count="14">0</span></p>
            <p class="lp-number-label">Smart spending categories</p>
          </div>
        </div>
      </section>

      <!-- ============ HOW IT WORKS ============ -->
      <section id="how" class="lp-how-section">
        <div data-reveal class="lp-section-head">
          <p class="lp-kicker">How it works</p>
          <h2 class="lp-h2">Up and running in a minute</h2>
        </div>
        <div class="lp-steps-grid">
          @for (s of steps; track s.n) {
            <div data-reveal class="lp-step-card">
              <div class="lp-step-n">{{ s.n }}</div>
              <h3>{{ s.title }}</h3>
              <p>{{ s.body }}</p>
            </div>
          }
        </div>
      </section>

      <!-- ============ PRICING ============ -->
      <section id="pricing" class="lp-pricing-section">
        <div data-reveal class="lp-section-head">
          <p class="lp-kicker">Pricing</p>
          <h2 class="lp-h2">Start free. Upgrade when it pays for itself.</h2>
        </div>
        <div class="lp-pricing-grid">
          <div data-reveal class="lp-plan">
            <h3>Free</h3>
            <p class="lp-plan-desc">Everything you need to know where your money goes.</p>
            <p class="lp-plan-price">₹0<span> / forever</span></p>
            <ul>
              @for (x of freeFeatures; track x) {
                <li>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(0.65 0.17 155)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{{ x }}
                </li>
              }
            </ul>
            <a routerLink="/daily" class="lp-plan-cta-free">Start free</a>
          </div>
          <div data-reveal class="lp-plan lp-plan-pro">
            <div class="lp-plan-flag">MOST POPULAR</div>
            <h3>Pro</h3>
            <p class="lp-plan-desc">For households that want the full picture, automatically.</p>
            <p class="lp-plan-price">₹499<span> / month</span></p>
            <p class="lp-plan-alt">or ₹3,999/year — <strong>save 33%</strong></p>
            <ul>
              @for (x of proFeatures; track x) {
                <li>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{{ x }}
                </li>
              }
            </ul>
            <a routerLink="/subscribe" class="lp-plan-cta-pro">Upgrade to Pro</a>
          </div>
        </div>
      </section>

      <!-- ============ FAQ ============ -->
      <section id="faq" class="lp-faq-section">
        <div data-reveal class="lp-section-head" style="margin-bottom: 40px;">
          <p class="lp-kicker">FAQ</p>
          <h2 class="lp-h2" style="font-size: clamp(28px, 3.2vw, 38px);">Fair questions, straight answers</h2>
        </div>
        <div class="lp-faq-list">
          @for (item of faqs; track item.q) {
            <details data-reveal class="lp-faq-item">
              <summary>
                {{ item.q }}
                <span class="lp-faq-chev">+</span>
              </summary>
              <p>{{ item.a }}</p>
            </details>
          }
        </div>
      </section>

      <!-- ============ GOOGLE DATA USE (OAuth verification) ============ -->
      <section id="data-use" class="lp-datause">
        <div class="lp-datause-inner">
          <h2 class="lp-datause-h">How Spenza uses your Google account data</h2>
          <p class="lp-datause-sub">
            Spenza only requests the Google permissions it needs to back up and import your own
            financial data. Your data stays yours — Spenza never sells it or shares it for advertising.
          </p>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div class="lp-scope-card">
              <div class="lp-scope-row">
                <div class="lp-scope-icon" style="background: var(--acc-soft)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div>
                  <h3>Google Drive — app data folder</h3>
                  <p class="lp-scope-tag">scope: drive.appdata</p>
                  <p class="lp-scope-body">
                    Used only to store a private backup of your own financial data in a hidden,
                    app-specific folder in your Google Drive. Not visible alongside your normal
                    Drive files, never shared with anyone. Spenza cannot access any other Drive files.
                  </p>
                </div>
              </div>
            </div>
            <div class="lp-scope-card">
              <div class="lp-scope-row">
                <div class="lp-scope-icon" style="background: oklch(0.94 0.04 305)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="oklch(0.30 0.10 305)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <h3>Basic profile &amp; email</h3>
                  <p class="lp-scope-tag">scopes: openid, email, profile</p>
                  <p class="lp-scope-body">
                    Used to sign you in securely and identify your account.
                    Spenza does not use your email for marketing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ FINAL CTA + FOOTER ============ -->
      <footer class="lp-footer">
        <div class="lp-footer-inner">
          <div data-reveal class="lp-footer-cta">
            <app-spenza-logo [size]="58" className="rounded-xl" style="display: inline-block; margin-bottom: 22px;" />
            <h2 class="lp-footer-h">Your money has a story.<br><span class="lp-gold-text">Start reading it.</span></h2>
            <a routerLink="/daily" class="lp-footer-btn">
              Open Spenza — free
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
          <div class="lp-footer-bar">
            <span class="lp-footer-brand">Spenza</span>
            <span class="lp-footer-links">
              <a routerLink="/privacy">Privacy Policy</a>
              <a routerLink="/terms">Terms of Service</a>
              <button type="button" (click)="scrollTo('data-use')">Google data use</button>
            </span>
            <span>© {{ year }} Spenza. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  `,
})
export class WelcomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  private observers: IntersectionObserver[] = [];

  readonly year = new Date().getFullYear();

  readonly heroTicks = ['Free plan forever', 'No card required', 'Works offline'];

  private readonly marqueeBase = [
    'Works offline', 'Private by design', 'Free to start', 'Android + Web',
    'Backed up to your Drive', 'Family sync', 'Receipt scanner', 'Bill splits',
  ];
  /** Doubled so the marquee's -50% translate loops seamlessly. */
  readonly marqueeItems = [...this.marqueeBase, ...this.marqueeBase];

  /** Illustrative hero-mockup bars; labels match real Spenza categories. */
  readonly mockBars = [
    { label: 'Food & Groceries', amount: '₹12,400', width: '72%', color: 'oklch(0.66 0.16 155)', delay: '0.4s' },
    { label: 'Transport', amount: '₹6,850', width: '44%', color: 'oklch(0.68 0.16 230)', delay: '0.55s' },
    { label: 'Shopping', amount: '₹8,200', width: '52%', color: 'oklch(0.70 0.20 350)', delay: '0.7s' },
    { label: 'Utilities', amount: '₹3,100', width: '28%', color: 'oklch(0.78 0.16 75)', delay: '0.85s' },
  ];

  readonly features: LandingFeature[] = [
    {
      title: 'Daily expense tracking',
      body: 'Log a purchase in under five seconds. Fourteen smart categories keep everything sorted without you thinking about it.',
      bg: 'oklch(0.55 0.22 280 / 0.1)', iconColor: 'oklch(0.55 0.22 280)',
      iconD: 'M12 5v14M5 12h14',
    },
    {
      title: 'Budgets that warn you early',
      body: 'Set monthly limits per category. Spenza alerts you at 80% — before the damage is done, not after.',
      bg: 'oklch(0.78 0.16 75 / 0.14)', iconColor: 'oklch(0.60 0.14 75)',
      iconD: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
    },
    {
      title: 'Receipt scanner with AI',
      body: 'Point your camera at a bill. OCR + AI reads the amount, merchant, and category — in English, Tamil, or Hindi.',
      bg: 'oklch(0.65 0.17 155 / 0.12)', iconColor: 'oklch(0.55 0.15 155)',
      iconD: 'M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3M2 13l3 3 5-5',
    },
    {
      title: 'Family sync',
      body: 'One shared ledger for the whole household. Everyone logs, everyone sees the same numbers, nobody argues about who spent what.',
      bg: 'oklch(0.68 0.16 230 / 0.12)', iconColor: 'oklch(0.55 0.14 230)',
      iconD: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    },
    {
      title: 'Bill splits',
      body: 'Split dinners, trips, and rent with friends or family. Spenza tracks who owes whom so the group chat doesn’t have to.',
      bg: 'oklch(0.70 0.20 350 / 0.12)', iconColor: 'oklch(0.60 0.18 350)',
      iconD: 'M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M16 21h5v-5M8 21H3v-5M21 21l-7-7M3 21l7-7',
    },
    {
      title: 'Dashboards & insights',
      body: 'Trends, comparisons, and AI-written monthly summaries that tell you what changed and why it matters.',
      bg: 'oklch(0.94 0.04 305)', iconColor: 'oklch(0.45 0.15 305)',
      iconD: 'M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3',
    },
  ];

  readonly steps: LandingStep[] = [
    {
      n: '1', title: 'Sign in with Google',
      body: 'One tap. Spenza creates a private, hidden backup folder in your own Google Drive — that’s where your data lives.',
    },
    {
      n: '2', title: 'Log it or scan it',
      body: 'Type an amount, speak it, or scan the receipt. Works offline too — everything syncs when you’re back online.',
    },
    {
      n: '3', title: 'Watch the picture form',
      body: 'Dashboards, budget alerts, and monthly insights build themselves. You just keep living — Spenza keeps count.',
    },
  ];

  readonly freeFeatures = [
    'Unlimited daily expense tracking',
    'All 14 spending categories',
    'Dashboards & spend trends',
    'Private Google Drive backup',
    'Offline mode — Android & Web',
  ];

  readonly proFeatures = [
    'Advanced spending insights',
    'Family sync mode',
    'Receipt scanner (OCR)',
    'CSV & Sheets export',
    'Custom budget limits',
    'Priority support',
  ];

  readonly faqs: LandingFaq[] = [
    {
      q: 'Is my financial data private?',
      a: 'Yes — radically so. Spenza stores your data in a hidden, app-specific folder in YOUR Google Drive, not on our servers. We can’t read it, we don’t sell it, and we never share it for advertising. Deleting the app’s Drive folder deletes everything.',
    },
    {
      q: 'Does it work offline?',
      a: 'Fully. Spenza is an offline-first app — log expenses on a flight or in a basement, and everything syncs to your Drive backup the next time you’re online.',
    },
    {
      q: 'What does Pro add?',
      a: 'Pro unlocks family sync, the AI receipt scanner, advanced insights, CSV & Sheets export, custom budget limits, and priority support — ₹499/month or ₹3,999/year (save 33%). The free plan stays free forever.',
    },
    {
      q: 'Can I cancel Pro anytime?',
      a: 'Yes. Subscriptions are handled through Razorpay and can be cancelled in one tap from Settings. You keep Pro until the end of your billing period, and your data is never held hostage.',
    },
    {
      q: 'What Google permissions does Spenza request?',
      a: 'Only two: drive.appdata (to store your private backup in a hidden folder of your own Drive) and basic profile/email (to sign you in). Spenza cannot see your other Drive files, your Gmail, or anything else. Full details are in the section below.',
    },
  ];

  constructor() {
    this.loadDisplayFont();
  }

  async ngOnInit(): Promise<void> {
    // Signed-in visitors go straight to the app; the landing page is only for
    // logged-out visitors (and reviewers/crawlers). The landing markup still
    // renders immediately in the DOM, so it is visible without auth.
    await this.authService.sessionRestored;
    if (this.authService.isAuthenticated()) {
      await this.router.navigate(['/daily']);
    }
  }

  ngAfterViewInit(): void {
    const root: HTMLElement = this.host.nativeElement;

    // Animated counters (₹42,350 hero figure, numbers strip).
    const counters = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
    const seen = new WeakSet<Element>();
    const countObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || seen.has(e.target)) continue;
        seen.add(e.target);
        const target = parseInt((e.target as HTMLElement).getAttribute('data-count') ?? '0', 10);
        const start = performance.now();
        const dur = 1400;
        const tick = (now: number): void => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          (e.target as HTMLElement).textContent = Math.round(target * eased).toLocaleString('en-IN');
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    counters.forEach((c) => countObs.observe(c));

    // Scroll reveal — progressive enhancement: only below-fold elements are
    // hidden, so the page is fully readable without JS/observers (crawlers).
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const revealObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = '1';
          (e.target as HTMLElement).style.transform = 'translateY(0)';
          revealObs.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    for (const el of els) {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(28px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
      }
      revealObs.observe(el);
    }

    this.observers = [countObs, revealObs];
  }

  ngOnDestroy(): void {
    this.observers.forEach((o) => o.disconnect());
    this.observers = [];
  }

  // The app uses hash-based routing, so `href="#section"` anchors would be
  // treated as route changes (and fall through to the `**` redirect). Scroll
  // manually instead, offset for the sticky nav.
  scrollTo(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 72,
      behavior: 'smooth',
    });
  }

  /**
   * Lazily load the Bricolage Grotesque display font from Google Fonts.
   * Landing-page only (web visitors); the in-app UI and native builds never
   * hit this. `font-display: swap` in the served CSS means the system-font
   * fallback renders immediately if the CDN is slow or unreachable.
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
