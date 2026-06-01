import { AfterViewInit, Directive, DoCheck, ElementRef, HostListener, inject } from '@angular/core';

const CLEAR_ICON =
  'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2218%22 height=%2218%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M18 6 6 18M6 6l12 12%22/%3E%3C/svg%3E")';

@Directive({
  selector: 'input[appClearable]',
  standalone: true,
})
export class ClearableInputDirective implements AfterViewInit, DoCheck {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private lastValue = '';

  ngAfterViewInit(): void {
    if (!this.supportsClear) return;
    this.element.style.paddingRight = `${this.clearIconRightOffset + 28}px`;
    this.refreshIcon();
  }

  ngDoCheck(): void {
    if (this.element.value !== this.lastValue) this.refreshIcon();
  }

  @HostListener('input')
  @HostListener('change')
  @HostListener('focus')
  refreshIcon(): void {
    if (!this.supportsClear) return;
    const hasValue = this.element.value.length > 0;
    this.lastValue = this.element.value;
    this.element.style.backgroundImage = hasValue ? CLEAR_ICON : '';
    this.element.style.backgroundPosition = `right ${this.clearIconRightOffset}px center`;
    this.element.style.backgroundRepeat = 'no-repeat';
    this.element.style.backgroundSize = '1rem';
    this.element.style.cursor = hasValue ? 'text' : '';
  }

  @HostListener('click', ['$event'])
  clearFromIcon(event: MouseEvent): void {
    if (!this.supportsClear) return;
    const clearZoneStart = this.element.clientWidth - this.clearIconRightOffset - 26;
    const clearZoneEnd = this.element.clientWidth - this.clearIconRightOffset + 8;
    if (!this.element.value || event.offsetX < clearZoneStart || event.offsetX > clearZoneEnd) return;
    event.preventDefault();
    event.stopPropagation();
    this.clear();
  }

  @HostListener('keydown.escape')
  clear(): void {
    if (!this.supportsClear) return;
    if (!this.element.value) return;
    this.element.value = '';
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
    this.element.dispatchEvent(new Event('change', { bubbles: true }));
    this.refreshIcon();
    this.element.focus();
  }

  private get hasNativePicker(): boolean {
    return this.element.type === 'time';
  }

  private get supportsClear(): boolean {
    return this.element.type !== 'date';
  }

  private get clearIconRightOffset(): number {
    if (this.hasNativePicker) return 40;
    if (this.element.type === 'password') return 32;
    return 12;
  }
}
