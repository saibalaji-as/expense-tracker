import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-spenza-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 680 680"
      xmlns="http://www.w3.org/2000/svg"
      [attr.class]="className()"
      aria-label="Spenza Logo"
      role="img"
    >
      <defs>
        <linearGradient id="spz-squircleG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="var(--logo-primary)"/>
          <stop offset="50%"  stop-color="var(--logo-primary)"/>
          <stop offset="100%" stop-color="var(--logo-accent)"/>
        </linearGradient>
        <linearGradient id="spz-shineG" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.18"/>
          <stop offset="55%"  stop-color="#ffffff" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="spz-rimG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="var(--logo-primary-glow)" stop-opacity="1"/>
          <stop offset="100%" stop-color="var(--logo-accent)"       stop-opacity="0.6"/>
        </linearGradient>
        <linearGradient id="spz-rupeeG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="#ede9fe"/>
          <stop offset="100%" stop-color="#bae6fd"/>
        </linearGradient>
        <linearGradient id="spz-trendG" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="var(--logo-primary-glow)"/>
          <stop offset="100%" stop-color="var(--logo-accent)"/>
        </linearGradient>
        <linearGradient id="spz-dotG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="#e0f2fe"/>
          <stop offset="100%" stop-color="#ffffff"/>
        </linearGradient>
        <filter id="spz-ambientBloom">
          <feGaussianBlur stdDeviation="22" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="spz-lineBloom">
          <feGaussianBlur stdDeviation="7" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="spz-dotBloom">
          <feGaussianBlur stdDeviation="14" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="spz-rupeeBloom">
          <feGaussianBlur stdDeviation="10" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="spz-sq">
          <rect x="120" y="120" width="440" height="440" rx="110" ry="110"/>
        </clipPath>
      </defs>

      <g filter="url(#spz-ambientBloom)">
        <rect x="120" y="120" width="440" height="440" rx="110" ry="110"
              fill="url(#spz-squircleG)" opacity="0.35"/>
      </g>

      <rect x="120" y="120" width="440" height="440" rx="110" ry="110"
            fill="url(#spz-squircleG)" opacity="0.72"/>
      <rect x="120" y="120" width="440" height="440" rx="110" ry="110"
            fill="url(#spz-shineG)"/>

      <g clip-path="url(#spz-sq)">
        <ellipse cx="255" cy="188" rx="190" ry="55" fill="#ffffff" opacity="0.06"/>
        <text font-family="Georgia,serif" font-weight="900" font-size="320"
              fill="#ffffff" text-anchor="middle" x="344" y="475" opacity="0.06">₹</text>
      </g>

      <rect x="120" y="120" width="440" height="440" rx="110" ry="110"
            fill="none" stroke="url(#spz-rimG)" stroke-width="2"/>
      <rect x="124" y="124" width="432" height="432" rx="108" ry="108"
            fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.12"/>

      <g filter="url(#spz-rupeeBloom)">
        <text font-family="Georgia,serif" font-weight="900" font-size="232"
              fill="url(#spz-rupeeG)" text-anchor="middle" x="338" y="442" opacity="0.18">₹</text>
      </g>
      <text font-family="Georgia,serif" font-weight="900" font-size="232"
            fill="url(#spz-rupeeG)" text-anchor="middle" x="338" y="442" opacity="0.95">₹</text>

      <g filter="url(#spz-lineBloom)">
        <polyline points="178,495  244,418  306,446  374,336  440,276  504,192"
                  fill="none" stroke="url(#spz-trendG)" stroke-width="10"
                  stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
      </g>
      <polyline points="178,495  244,418  306,446  374,336  440,276  504,192"
                fill="none" stroke="url(#spz-trendG)" stroke-width="4.5"
                stroke-linecap="round" stroke-linejoin="round"/>

      <circle cx="374" cy="336" r="16" fill="var(--logo-primary-glow)" opacity="0.22"/>
      <circle cx="374" cy="336" r="7"  fill="var(--logo-primary-glow)"/>

      <g filter="url(#spz-dotBloom)">
        <circle cx="504" cy="192" r="22" fill="url(#spz-dotG)" opacity="0.45"/>
      </g>
      <circle cx="504" cy="192" r="12" fill="url(#spz-dotG)"/>
      <circle cx="504" cy="192" r="5"  fill="#3b0764"/>
      <polygon points="504,163  518,192  504,182  490,192" fill="url(#spz-dotG)" opacity="0.95"/>
    </svg>
  `,
})
export class SpenzaLogoComponent {
  readonly size = input<number>(40);
  readonly className = input<string>('');
}
