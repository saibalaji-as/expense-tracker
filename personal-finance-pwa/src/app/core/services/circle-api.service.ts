import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export class CircleApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'CircleApiError';
  }
}

/**
 * Thin HTTP wrapper for the Circle Splits Firebase Functions
 * (docs/circle-splits-plan.md §5). Mirrors FamilyApiService.
 */
@Injectable({ providedIn: 'root' })
export class CircleApiService {
  private readonly authService = inject(AuthService);

  private get functionsBase(): string {
    return 'https://us-central1-spenza-notifications.cloudfunctions.net';
  }

  private async post<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const idToken = await this.authService.getFirebaseIdToken();
    const response = await fetch(`${this.functionsBase}/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new CircleApiError(response.status, `${fn} failed (${response.status}): ${text}`);
    }
    return response.json() as Promise<T>;
  }

  createCircle(input: {
    name: string;
    currency: string;
    memberNames: string[];
    ownerDisplayName?: string;
  }): Promise<{ circleId: string }> {
    return this.post('createCircle', input);
  }

  createCircleInvite(circleId: string): Promise<{ inviteCode: string; expiresAt: string }> {
    return this.post('createCircleInvite', { circleId });
  }

  previewCircleInvite(inviteCode: string): Promise<{
    circleId: string;
    name: string;
    currency: string;
    status: 'active' | 'settled';
    memberCount: number;
    alreadyMember: boolean;
    unclaimedMembers: { memberId: string; name: string }[];
  }> {
    return this.post('previewCircleInvite', { inviteCode });
  }

  redeemCircleInvite(input: {
    inviteCode: string;
    claimMemberId?: string;
    displayName?: string;
  }): Promise<{ circleId: string }> {
    return this.post('redeemCircleInvite', input);
  }

  updateCircle(input: {
    circleId: string;
    name?: string;
    addMemberNames?: string[];
    /**
     * With addMemberNames: retro-include the new members in existing bills.
     * Server adds them ONLY to "everyone" splits (participant set == full
     * member set before the add); custom splits are never widened.
     */
    shareExistingForNewMembers?: boolean;
    /** Owner-only. Server rejects removal when the member has any live expense. */
    removeMemberId?: string;
    /**
     * Owner-only partial family patch: memberId → head memberId (null clears).
     * Server keeps families flat (head always points to self) and 409s on
     * orphaned/nested heads ('Invalid family head', 'Head has family members').
     */
    assignFamilies?: Record<string, string | null>;
  }): Promise<{ success: boolean }> {
    return this.post('updateCircle', input);
  }

  settleCircle(circleId: string): Promise<{ success: boolean }> {
    return this.post('settleCircle', { circleId });
  }

  /** Owner-only. Permanently removes the circle, its expenses, and invites. */
  deleteCircle(circleId: string): Promise<{ success: boolean }> {
    return this.post('deleteCircle', { circleId });
  }
}
