import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { setupGuard } from './core/guards/setup.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';

export const routes: Routes = [
  {
    path: 'daily',
    loadComponent: () =>
      import('./features/daily-expense/daily-expense.component').then(
        (m) => m.DailyExpenseComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    path: 'monthly',
    loadComponent: () =>
      import('./features/monthly-expense/monthly-expense.component').then(
        (m) => m.MonthlyExpenseComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    path: 'limits',
    loadComponent: () =>
      import('./features/expense-limit/expense-limit.component').then(
        (m) => m.ExpenseLimitComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    path: 'finances',
    loadComponent: () =>
      import('./features/finances/finances.component').then(
        (m) => m.FinancesComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    // Public routes — no AuthGuard
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/auth-callback.component').then(
        (m) => m.AuthCallbackComponent
      ),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/privacy/privacy.component').then(
        (m) => m.PrivacyComponent
      ),
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./features/terms/terms.component').then(
        (m) => m.TermsComponent
      ),
  },
  {
    path: 'subscribe',
    loadComponent: () =>
      import('./features/subscribe/subscribe.component').then(
        (m) => m.SubscribeComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'mode-select',
    loadComponent: () =>
      import('./features/mode-selection/mode-selection.component').then(
        (m) => m.ModeSelectionComponent
      ),
    canActivate: [authGuard, setupGuard],
  },
  {
    path: 'family-setup',
    loadComponent: () =>
      import('./features/family-setup/family-setup.component').then(
        (m) => m.FamilySetupComponent
      ),
    canActivate: [authGuard, setupGuard, subscriptionGuard],
  },
  { path: '', redirectTo: '/daily', pathMatch: 'full' },
  { path: '**', redirectTo: '/daily' },
];
