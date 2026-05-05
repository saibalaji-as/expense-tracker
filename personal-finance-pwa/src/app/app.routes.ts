import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'daily',
    loadComponent: () =>
      import('./features/daily-expense/daily-expense.component').then(
        (m) => m.DailyExpenseComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'monthly',
    loadComponent: () =>
      import('./features/monthly-expense/monthly-expense.component').then(
        (m) => m.MonthlyExpenseComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'limits',
    loadComponent: () =>
      import('./features/expense-limit/expense-limit.component').then(
        (m) => m.ExpenseLimitComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
    canActivate: [authGuard],
  },
  {
    // Public route — no AuthGuard
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/auth-callback.component').then(
        (m) => m.AuthCallbackComponent
      ),
  },
  { path: '', redirectTo: '/daily', pathMatch: 'full' },
  { path: '**', redirectTo: '/daily' },
];
