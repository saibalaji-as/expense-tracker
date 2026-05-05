import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [ButtonComponent],
  template: `
    @if (isOpen) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-40 bg-black/50"
        (click)="onCancel()"
        aria-hidden="true"
      ></div>

      <!-- Dialog -->
      <div
        #dialogRef
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title"
        class="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
        (keydown.escape)="onCancel()"
        tabindex="-1"
      >
        <h2 class="mb-4 text-lg font-semibold text-gray-900">{{ title }}</h2>
        <ng-content />
        <div class="mt-6 flex justify-end gap-3">
          <app-button variant="ghost" (click)="onCancel()">Cancel</app-button>
          <app-button variant="primary" (click)="onConfirm()">Confirm</app-button>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent implements OnChanges, OnDestroy {
  @Input() title = '';
  @Input() isOpen = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('dialogRef') dialogRef?: ElementRef<HTMLDivElement>;

  private previouslyFocused: HTMLElement | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) {
        this.previouslyFocused = document.activeElement as HTMLElement;
        // Focus the dialog after the view updates
        setTimeout(() => this.focusFirstElement(), 0);
      } else if (this.previouslyFocused) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    }
  }

  ngOnDestroy(): void {
    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
    }
  }

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  private focusFirstElement(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    if (first) {
      first.focus();
    } else {
      dialog.focus();
    }
  }
}
