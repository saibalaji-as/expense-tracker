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
import { TranslatePipe } from '../../pipes';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [ButtonComponent, TranslatePipe],
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
        class="fixed inset-x-4 top-1/2 z-50 max-h-[calc(100vh-2rem)] -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl sm:mx-auto sm:max-w-2xl"
        (keydown.escape)="onCancel()"
        tabindex="-1"
      >
        <h2 class="mb-4 text-lg font-semibold text-foreground">{{ title }}</h2>
        <ng-content />
        @if (showActions) {
          <div class="mt-6 flex justify-end gap-3">
            <app-button variant="ghost" (click)="onCancel()">{{ 'common.cancel' | translate }}</app-button>
            <app-button variant="primary" (click)="onConfirm()">{{ 'common.confirm' | translate }}</app-button>
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent implements OnChanges, OnDestroy {
  @Input() title = '';
  @Input() isOpen = false;
  @Input() showActions = true;

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
