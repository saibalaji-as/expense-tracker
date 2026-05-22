const INCOME_GATED_ROUTES = new Set(['/daily', '/monthly', '/dashboard']);

export function shouldRedirectToIncomeSetup(
  url: string,
  driveFileId: string | null,
  monthlyIncome: number
): boolean {
  const path = url.split('?')[0].split('#')[0];
  return !!driveFileId && INCOME_GATED_ROUTES.has(path) && monthlyIncome <= 0;
}
