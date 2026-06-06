import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export class FamilyApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FamilyApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class FamilyApiService {
  private readonly authService = inject(AuthService);

  private get functionsBase(): string {
    return 'https://us-central1-spenza-notifications.cloudfunctions.net';
  }

  async createFamily(): Promise<{ familyId: string }> {
    const idToken = await this.authService.getFirebaseIdToken();
    const response = await fetch(`${this.functionsBase}/createFamily`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new FamilyApiError(response.status, `createFamily failed (${response.status}): ${text}`);
    }
    return response.json() as Promise<{ familyId: string }>;
  }

  async createFamilyInvite(familyId: string): Promise<{ inviteCode: string; expiresAt: string }> {
    const idToken = await this.authService.getFirebaseIdToken();
    const response = await fetch(`${this.functionsBase}/createFamilyInvite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ familyId }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new FamilyApiError(response.status, `createFamilyInvite failed (${response.status}): ${text}`);
    }
    return response.json() as Promise<{ inviteCode: string; expiresAt: string }>;
  }

  async dissolveFamily(familyId: string): Promise<{ success: boolean }> {
    const idToken = await this.authService.getFirebaseIdToken();
    const response = await fetch(`${this.functionsBase}/dissolveFamily`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ familyId }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new FamilyApiError(response.status, `dissolveFamily failed (${response.status}): ${text}`);
    }
    return response.json() as Promise<{ success: boolean }>;
  }

  async redeemFamilyInvite(inviteCode: string): Promise<{ familyId: string }> {
    const idToken = await this.authService.getFirebaseIdToken();
    const response = await fetch(`${this.functionsBase}/redeemFamilyInvite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inviteCode }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new FamilyApiError(response.status, `redeemFamilyInvite failed (${response.status}): ${text}`);
    }
    return response.json() as Promise<{ familyId: string }>;
  }
}
