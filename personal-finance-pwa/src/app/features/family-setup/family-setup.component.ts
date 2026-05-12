import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule, LucideIconProvider, LUCIDE_ICONS,
  Crown, Users, Copy, Check, ExternalLink, Loader2, AlertCircle
} from 'lucide-angular';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { GoogleDriveService, DriveApiError, DriveParseError } from '../../core/services/google-drive.service';

type SetupStep = 'role-select' | 'owner-setup' | 'owner-existing' | 'owner-done' | 'partner-setup';

@Component({
  selector: 'app-family-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Crown, Users, Copy, Check, ExternalLink, Loader2, AlertCircle }),
    },
  ],
  template: `
    <div class="min-h-[50vh] flex items-center justify-center p-6">
      <div class="w-full max-w-lg">

        <!-- Step: Role Selection -->
        @if (step() === 'role-select') {
          <div class="mb-8 text-center">
            <h1 class="text-2xl font-bold tracking-tight mb-2">Set up Family Backup</h1>
            <p class="text-muted-foreground text-sm">Are you creating the shared backup or joining one?</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <button type="button" (click)="onSelectOwner()"
              class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="crown" class="h-7 w-7" />
              </span>
              <div class="text-center">
                <p class="font-semibold text-base mb-1">I am the Owner</p>
                <p class="text-xs text-muted-foreground">Create a new shared backup and invite your partner.</p>
              </div>
            </button>
            <button type="button" (click)="onSelectPartner()"
              class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="users" class="h-7 w-7" />
              </span>
              <div class="text-center">
                <p class="font-semibold text-base mb-1">I am a Partner</p>
                <p class="text-xs text-muted-foreground">Join an existing shared backup using a File ID.</p>
              </div>
            </button>
          </div>
        }

        <!-- Step: Owner — checking for existing file -->
        @if (step() === 'owner-setup') {
          <div class="text-center">
            <lucide-icon name="loader-2" class="h-10 w-10 animate-spin mx-auto mb-4 text-primary" />
            <p class="text-muted-foreground text-sm">Checking for existing backup…</p>
          </div>
        }

        <!-- Step: Owner — existing file found -->
        @if (step() === 'owner-existing') {
          <div class="mb-6 text-center">
            <h1 class="text-2xl font-bold tracking-tight mb-2">Existing Backup Found</h1>
            <p class="text-muted-foreground text-sm">A shared backup file already exists in your Google Drive.</p>
          </div>
          @if (errorMessage()) {
            <div class="glass-card border-destructive/40 bg-destructive/10 p-4 mb-4 rounded-2xl" role="alert">
              <p class="text-sm text-destructive">{{ errorMessage() }}</p>
            </div>
          }
          <div class="grid gap-3 sm:grid-cols-2">
            <button type="button" (click)="onOwnerReuseExisting()" [disabled]="isLoading()"
              class="glass-card flex items-center justify-center gap-2 p-4 rounded-2xl font-semibold text-sm hover:border-primary hover:shadow-glow disabled:opacity-50">
              Reuse existing
            </button>
            <button type="button" (click)="onOwnerCreateNew()" [disabled]="isLoading()"
              class="gradient-primary text-primary-foreground shadow-glow rounded-2xl p-4 font-semibold text-sm disabled:opacity-50">
              @if (isLoading()) {
                <lucide-icon name="loader-2" class="h-4 w-4 animate-spin inline mr-2" />
              }
              Create new
            </button>
          </div>
        }

        <!-- Step: Owner — done, show file ID -->
        @if (step() === 'owner-done') {
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight mb-2">Backup Created!</h1>
            <p class="text-muted-foreground text-sm mb-4">Share this File ID with your partner, then share the file in Google Drive.</p>

            <!-- File ID display -->
            <div class="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3 mb-3">
              <code class="flex-1 font-mono text-xs break-all text-foreground">{{ createdFileId() }}</code>
              <button type="button" (click)="onCopyFileId()"
                class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Copy File ID">
                @if (copied()) {
                  <lucide-icon name="check" class="h-4 w-4" style="color: var(--success)" />
                } @else {
                  <lucide-icon name="copy" class="h-4 w-4" />
                }
              </button>
            </div>

            <!-- Instructions -->
            <div class="glass-card p-4 rounded-2xl mb-4 text-sm text-muted-foreground space-y-2">
              <p>1. Share this file in Google Drive with your partner's Google account.</p>
              <p>2. Give them the File ID above.</p>
              <p>3. They open Spenza, choose "Family / Shared", then "I am a Partner", and paste the File ID.</p>
            </div>

            <!-- Open in Drive link -->
            <a [href]="'https://drive.google.com/file/d/' + createdFileId() + '/view'"
              target="_blank" rel="noreferrer"
              class="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6">
              <lucide-icon name="external-link" class="h-4 w-4" />
              Open file in Google Drive to share
            </a>
          </div>

          <button type="button" (click)="onProceedToApp()"
            class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold">
            Continue to app
          </button>
        }

        <!-- Step: Partner — enter File ID -->
        @if (step() === 'partner-setup') {
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight mb-2">Join Family Backup</h1>
            <p class="text-muted-foreground text-sm mb-4">Paste the File ID your partner shared with you.</p>

            @if (errorMessage()) {
              <div class="glass-card border-destructive/40 bg-destructive/10 p-4 mb-4 rounded-2xl" role="alert">
                <div class="flex items-start gap-3">
                  <lucide-icon name="alert-circle" class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p class="text-sm text-destructive">{{ errorMessage() }}</p>
                </div>
              </div>
            }

            <input
              type="text"
              [(ngModel)]="partnerFileIdInput"
              placeholder="Paste File ID here"
              class="w-full rounded-2xl border border-border bg-card/60 px-4 py-3 font-mono text-xs text-foreground outline-none focus:border-primary mb-3"
              aria-label="Shared File ID"
            />

            <button type="button" (click)="onPartnerConnect()"
              [disabled]="isLoading() || !partnerFileIdInput.trim()"
              class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              @if (isLoading()) {
                <lucide-icon name="loader-2" class="h-4 w-4 animate-spin inline mr-2" />
                Connecting…
              } @else {
                Connect
              }
            </button>
          </div>
        }

      </div>
    </div>
  `,
})
export class FamilySetupComponent {
  private readonly backupModeService = inject(BackupModeService);
  private readonly googleDriveService = inject(GoogleDriveService);
  private readonly router = inject(Router);

  readonly step = signal<SetupStep>('role-select');
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly createdFileId = signal<string | null>(null);
  readonly existingFileFound = signal<string | null>(null);
  readonly copied = signal(false);
  partnerFileIdInput = '';

  async onSelectOwner(): Promise<void> {
    this.step.set('owner-setup');
    this.errorMessage.set(null);
    this.isLoading.set(true);
    try {
      const existingId = await this.googleDriveService.findBackupFileInMyDrive();
      if (existingId) {
        this.existingFileFound.set(existingId);
        this.step.set('owner-existing');
      } else {
        await this.#createAndFinish();
      }
    } catch (err) {
      this.errorMessage.set(this.#extractErrorMessage(err));
      this.step.set('role-select');
    } finally {
      this.isLoading.set(false);
    }
  }

  onSelectPartner(): void {
    this.step.set('partner-setup');
    this.errorMessage.set(null);
  }

  async onOwnerReuseExisting(): Promise<void> {
    const fileId = this.existingFileFound();
    if (!fileId) return;
    await this.backupModeService.setSharedFileId(fileId);
    await this.backupModeService.setOwnerRole('owner');
    this.createdFileId.set(fileId);
    this.step.set('owner-done');
  }

  async onOwnerCreateNew(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.#createAndFinish();
    } catch (err) {
      this.errorMessage.set(this.#extractErrorMessage(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onPartnerConnect(): Promise<void> {
    const fileId = this.partnerFileIdInput.trim();
    if (!fileId) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // Validate by reading the file
      await this.googleDriveService.readBackupFile(fileId);
      await this.backupModeService.setSharedFileId(fileId);
      await this.backupModeService.setOwnerRole('partner');
      await this.router.navigate(['/daily']);
    } catch (err: unknown) {
      const status = (err as DriveApiError)?.status;
      if (status === 403) {
        this.errorMessage.set('Access denied. Ask the Owner to share the file with your Google account in Google Drive.');
      } else if (status === 404 || err instanceof DriveParseError) {
        this.errorMessage.set('File not found or invalid. Please check the File ID and try again.');
      } else {
        this.errorMessage.set('Connection failed. Please try again.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onCopyFileId(): Promise<void> {
    const id = this.createdFileId();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard not available — user can manually select the text
    }
  }

  async onProceedToApp(): Promise<void> {
    await this.router.navigate(['/daily']);
  }

  async #createAndFinish(): Promise<void> {
    // Create the new shared file in My Drive
    const newFileId = await this.googleDriveService.createBackupFileInMyDrive();

    // ── Single → Family migration: copy private backup data into the new shared file ──
    // This ensures years of single-user data are not lost when switching to family mode.
    try {
      const privateFileId = await this.googleDriveService.findBackupFile();
      if (privateFileId) {
        const privateDoc = await this.googleDriveService.readBackupFile(privateFileId);
        if (privateDoc.expenses.length > 0 || privateDoc.limits.length > 0) {
          // Write private data into the new shared file as the starting point
          await this.googleDriveService.writeBackupFile(newFileId, {
            ...privateDoc,
            version: '1.0',
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      // Non-critical — if migration fails, the shared file starts empty
      // The user's private data is still safe in appDataFolder
      console.warn('[FamilySetup] Could not copy private backup to shared file:', err);
    }

    await this.backupModeService.setSharedFileId(newFileId);
    await this.backupModeService.setOwnerRole('owner');
    this.createdFileId.set(newFileId);
    this.step.set('owner-done');
  }

  #extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return (err as { message: string }).message;
    }
    return 'An unexpected error occurred. Please try again.';
  }
}
