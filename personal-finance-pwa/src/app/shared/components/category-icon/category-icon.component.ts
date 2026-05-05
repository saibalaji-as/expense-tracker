import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  LucideAngularModule,
  LucideIconData,
  LucideIconProvider,
  LUCIDE_ICONS,
  House,
  ShoppingBasket,
  Car,
  Plug,
  HeartPulse,
  Clapperboard,
  UtensilsCrossed,
  ShoppingBag,
  PiggyBank,
  TrendingUp,
  GraduationCap,
  Sparkles,
  Repeat,
  Shapes,
  Tag,
} from 'lucide-angular';
import { getCategoryDef } from '../../../core/models/category-definitions';

/** Maps kebab-case icon names (from category-definitions) to Lucide icon data objects. */
const ICON_MAP: Record<string, LucideIconData> = {
  'home':              House,
  'shopping-basket':   ShoppingBasket,
  'car':               Car,
  'plug':              Plug,
  'heart-pulse':       HeartPulse,
  'clapperboard':      Clapperboard,
  'utensils-crossed':  UtensilsCrossed,
  'shopping-bag':      ShoppingBag,
  'piggy-bank':        PiggyBank,
  'trending-up':       TrendingUp,
  'graduation-cap':    GraduationCap,
  'sparkles':          Sparkles,
  'repeat':            Repeat,
  'shapes':            Shapes,
  'tag':               Tag,
};

const SIZE_MAP = {
  sm: { box: 'h-8 w-8 rounded-lg',    icon: 'h-4 w-4' },
  md: { box: 'h-10 w-10 rounded-xl',  icon: 'h-5 w-5' },
  lg: { box: 'h-12 w-12 rounded-2xl', icon: 'h-6 w-6' },
} as const;

@Component({
  selector: 'app-category-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        House,
        ShoppingBasket,
        Car,
        Plug,
        HeartPulse,
        Clapperboard,
        UtensilsCrossed,
        ShoppingBag,
        PiggyBank,
        TrendingUp,
        GraduationCap,
        Sparkles,
        Repeat,
        Shapes,
        Tag,
      }),
    },
  ],
  // color-mix() is supported in Safari 15.4+ and all modern browsers.
  // If the browser does not support color-mix(), background-color falls back to
  // transparent (the second argument), which is an acceptable degradation.
  template: `
    <span
      class="inline-grid place-items-center {{ sizeClasses.box }}"
      [style.background-color]="'color-mix(in oklab, var(' + colorVar + ') 18%, transparent)'"
      [style.color]="'var(' + colorVar + ')'">
      <lucide-icon [img]="iconData" [class]="sizeClasses.icon" />
    </span>
  `,
})
export class CategoryIconComponent {
  readonly categoryId = input<string>('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  get colorVar(): string {
    return getCategoryDef(this.categoryId()).colorVar;
  }

  get iconData(): LucideIconData {
    const iconName = getCategoryDef(this.categoryId()).icon;
    return ICON_MAP[iconName] ?? Tag;
  }

  get sizeClasses(): { box: string; icon: string } {
    return SIZE_MAP[this.size()];
  }
}
