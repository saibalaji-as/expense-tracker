import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  BadgeIndianRupee,
  Check,
  ChevronDown,
  CreditCard,
  Landmark,
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  WalletCards,
} from 'lucide-angular';

export interface ThemedSelectOption {
  value: string;
  label: string;
  icon?: string;
}

@Component({
  selector: 'app-themed-select',
  standalone: true,
  imports: [LucideAngularModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ThemedSelectComponent),
      multi: true,
    },
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ BadgeIndianRupee, Check, ChevronDown, CreditCard, Landmark, WalletCards }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-2.5 text-left text-sm outline-none transition hover:bg-accent/50 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        [class.rounded-xl]="size === 'sm'"
        [class.px-3]="size === 'sm'"
        [class.py-2]="size === 'sm'"
        [disabled]="disabled"
        (click)="toggle()"
        (blur)="onTouched()"
        [attr.aria-expanded]="isOpen()"
      >
        <span class="flex min-w-0 items-center gap-3">
          @if (selectedOption()?.icon; as icon) {
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" [class.h-7]="size === 'sm'" [class.w-7]="size === 'sm'">
              <lucide-icon [name]="icon" class="h-4 w-4" [class.h-3.5]="size === 'sm'" [class.w-3.5]="size === 'sm'" />
            </span>
          }
          <span class="truncate font-medium text-foreground" [class.text-xs]="size === 'xs'">
            {{ selectedOption()?.label || placeholder }}
          </span>
        </span>
        <lucide-icon
          name="chevron-down"
          class="h-4 w-4 shrink-0 text-muted-foreground transition"
          [class.rotate-180]="isOpen()"
        />
      </button>

      @if (isOpen()) {
        <div class="absolute inset-x-0 top-full z-[60] mt-2 max-h-64 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-xl">
          @for (option of options; track option.value) {
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-accent"
              [class.bg-primary]="option.value === selectedValue"
              [class.text-primary-foreground]="option.value === selectedValue"
              [class.text-foreground]="option.value !== selectedValue"
              (click)="choose(option.value)"
            >
              <span class="flex min-w-0 items-center gap-3">
                @if (option.icon; as icon) {
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <lucide-icon [name]="icon" class="h-4 w-4" />
                  </span>
                }
                <span class="truncate font-medium" [class.text-xs]="size === 'xs'">{{ option.label }}</span>
              </span>
              @if (option.value === selectedValue) {
                <lucide-icon name="check" class="h-4 w-4 shrink-0" />
              }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class ThemedSelectComponent implements ControlValueAccessor {
  @Input() options: ThemedSelectOption[] = [];
  @Input() placeholder = '';
  @Input() size: 'xs' | 'sm' | 'md' = 'md';
  @Input() set value(value: string | null | undefined) {
    this.selectedValue = value ?? '';
  }

  @Output() valueChange = new EventEmitter<string>();

  readonly isOpen = signal(false);
  selectedValue = '';
  disabled = false;

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  closeFromOutside(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  writeValue(value: string | null | undefined): void {
    this.selectedValue = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.isOpen.set(false);
    }
  }

  selectedOption(): ThemedSelectOption | undefined {
    return this.options.find((option) => option.value === this.selectedValue);
  }

  toggle(): void {
    if (this.disabled) return;
    this.isOpen.update((open) => !open);
  }

  choose(value: string): void {
    this.selectedValue = value;
    this.onChange(value);
    this.valueChange.emit(value);
    this.onTouched();
    this.isOpen.set(false);
  }
}
