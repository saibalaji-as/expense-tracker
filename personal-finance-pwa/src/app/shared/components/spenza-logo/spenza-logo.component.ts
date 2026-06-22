import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextLogoId = 0;

@Component({
  selector: 'app-spenza-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Spenza brand mark: gold coin + 75% progress ring on a dark tile.
         Mirrors the app/launcher icon (public/icons + Android mipmaps). -->
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      [attr.class]="className()"
      aria-label="Spenza Logo"
      role="img"
    >
      <defs>
        <linearGradient [attr.id]="'spz-tile-' + uid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"   stop-color="#2A2620"/>
          <stop offset="1"   stop-color="#121009"/>
        </linearGradient>
        <radialGradient [attr.id]="'spz-disc-' + uid" cx="0.42" cy="0.36" r="0.75">
          <stop offset="0"    stop-color="#FBE79A"/>
          <stop offset="0.45" stop-color="#E6C24E"/>
          <stop offset="0.8"  stop-color="#C49A28"/>
          <stop offset="1"    stop-color="#8B6F1A"/>
        </radialGradient>
        <linearGradient [attr.id]="'spz-ring-' + uid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0"   stop-color="#F5D76E"/>
          <stop offset="0.5" stop-color="#D6AE33"/>
          <stop offset="1"   stop-color="#A07F1C"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1024" height="1024" rx="224" [attr.fill]="ref('spz-tile')"/>

      <!-- track (unfilled ring) -->
      <circle cx="512" cy="512" r="300" fill="none" stroke="#3a3024" stroke-width="54"/>
      <!-- progress ring: 75% of circumference, gap at top -->
      <circle cx="512" cy="512" r="300" fill="none" [attr.stroke]="ref('spz-ring')" stroke-width="54"
              stroke-linecap="round" stroke-dasharray="1413 1885"
              transform="rotate(-90 512 512)"/>

      <!-- coin -->
      <circle cx="512" cy="512" r="204" [attr.fill]="ref('spz-disc')"/>
      <circle cx="512" cy="512" r="204" fill="none" stroke="#7A611A" stroke-width="7"/>
      <!-- milling rings -->
      <circle cx="512" cy="512" r="174" fill="none" stroke="#B8911F" stroke-width="6" opacity="0.65"/>
      <circle cx="512" cy="512" r="150" fill="none" stroke="#B8911F" stroke-width="4" opacity="0.4"/>
    </svg>
  `,
})
export class SpenzaLogoComponent {
  readonly size = input<number>(40);
  readonly className = input<string>('');

  /** Unique per instance — the logo renders in multiple places (desktop +
   *  mobile headers). With shared IDs, url(#...) resolves to the FIRST
   *  instance in the DOM; when that copy sits inside a display:none header,
   *  some engines refuse to paint the referenced gradients/filters, leaving
   *  the visible logo blank. */
  readonly uid = `i${nextLogoId++}`;

  ref(id: string): string {
    return `url(#${id}-${this.uid})`;
  }
}
