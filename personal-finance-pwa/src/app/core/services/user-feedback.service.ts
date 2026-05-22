import { Injectable, signal } from '@angular/core';

export type UserFeedbackTone = 'success' | 'error' | 'warning' | 'info';

export interface UserFeedbackMessage {
  id: number;
  tone: UserFeedbackTone;
  title: string;
  detail?: string;
  persistent: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserFeedbackService {
  readonly message = signal<UserFeedbackMessage | null>(null);

  private nextId = 1;
  private dismissTimer?: ReturnType<typeof setTimeout>;

  success(title: string, detail?: string): void {
    this.show({ tone: 'success', title, detail, persistent: false });
  }

  info(title: string, detail?: string): void {
    this.show({ tone: 'info', title, detail, persistent: false });
  }

  warning(title: string, detail?: string, persistent = false): void {
    this.show({ tone: 'warning', title, detail, persistent });
  }

  error(title: string, detail?: string, persistent = true): void {
    this.show({ tone: 'error', title, detail, persistent });
  }

  dismiss(): void {
    this.message.set(null);
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
  }

  private show(message: Omit<UserFeedbackMessage, 'id'>): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }

    this.message.set({ ...message, id: this.nextId++ });

    if (!message.persistent) {
      this.dismissTimer = setTimeout(() => this.dismiss(), 4500);
    }
  }
}
