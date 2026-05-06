import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 class="text-2xl font-semibold">Spenza</h1>

      @if (errorMessage()) {
        <div class="rounded-md bg-red-50 p-4 text-red-700" role="alert">
          <p class="mb-3">{{ errorMessage() }}</p>
          <button
            class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            (click)="onSignIn()"
          >
            Retry
          </button>
        </div>
      }

      @if (!errorMessage()) {
        <button
          class="rounded bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          [disabled]="isLoading()"
          (click)="onSignIn()"
        >
          @if (isLoading()) {
            Signing in…
          } @else {
            Sign in with Google
          }
        </button>
      }
    </div>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  async onSignIn(): Promise<void> {
    this.errorMessage.set(null);
    this.isLoading.set(true);

    try {
      await this.authService.signIn();
      await this.router.navigate(['/daily']);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }
}
