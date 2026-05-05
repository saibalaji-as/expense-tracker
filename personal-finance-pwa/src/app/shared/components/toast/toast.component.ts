import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { GoogleSheetsService } from '../../../core/services/google-sheets.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    @if (currentMessage()) {
      <div
        class="fixed bottom-16 left-0 right-0 mx-4 bg-red-600 text-white rounded-lg p-3 flex justify-between items-center z-50"
        role="alert"
        aria-live="assertive"
      >
        <span class="text-sm">{{ currentMessage() }}</span>
        <button
          class="ml-3 text-white hover:text-red-200 focus:outline-none"
          aria-label="Dismiss notification"
          (click)="dismiss()"
        >
          ✕
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent implements OnInit, OnDestroy {
  readonly currentMessage = signal<string>('');

  private readonly sheetsService = inject(GoogleSheetsService);
  private subscription?: Subscription;
  private dismissTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.subscription = this.sheetsService.apiError$.subscribe((error) => {
      this.showMessage(error.message);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
  }

  dismiss(): void {
    this.currentMessage.set('');
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
  }

  private showMessage(message: string): void {
    this.currentMessage.set(message);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }

    this.dismissTimer = setTimeout(() => {
      this.currentMessage.set('');
      this.dismissTimer = undefined;
    }, 5000);
  }
}
