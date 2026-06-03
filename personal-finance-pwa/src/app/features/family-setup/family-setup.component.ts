import { ChangeDetectionStrategy, Component, inject, signal, isDevMode } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule, LucideIconProvider, LUCIDE_ICONS,
  Crown, Users, Copy, Check, ExternalLink, Loader2, AlertCircle
} from 'lucide-angular';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { GoogleDriveService, DriveApiError, DriveParseError } from '../../core/services/google-drive.service';
import { TranslatePipe } from '../../shared/pipes';
import { ClearableInputDirective } from '../../shared/components';

type SetupStep = 'role-select' | 'owner-setup' | 'owner-done' | 'partner-setup';

@Component({
  selector: 'app-family-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ClearableInputDirective, LucideAngularModule, TranslatePipe],
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
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.title' | translate }}</h1>
            <p class="text-muted-foreground text-sm">{{ 'family.description' | translate }}</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <button type="button" (click)="onSelectOwner()"
              class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="crown" class="h-7 w-7" />
              </span>
              <div class="text-center">
                <p class="font-semibold text-base mb-1">{{ 'family.owner.title' | translate }}</p>
                <p class="text-xs text-muted-foreground">{{ 'family.owner.description' | translate }}</p>
              </div>
            </button>
            <button type="button" (click)="onSelectPartner()"
              class="glass-card flex flex-col items-center gap-4 p-6 rounded-2xl transition-all hover:border-primary hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span class="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                <lucide-icon name="users" class="h-7 w-7" />
              </span>
              <div class="text-center">
                <p class="font-semibold text-base mb-1">{{ 'family.partner.title' | translate }}</p>
                <p class="text-xs text-muted-foreground">{{ 'family.partner.description' | translate }}</p>
              </div>
            </button>
          </div>
        }

        <!-- Step: Owner — checking for existing file -->
        @if (step() === 'owner-setup') {
          <div class="text-center">
            <lucide-icon name="loader-2" class="h-10 w-10 animate-spin mx-auto mb-4 text-primary" />
            <p class="text-muted-foreground text-sm">{{ 'family.checking' | translate }}</p>
          </div>
        }

        <!-- Step: Owner — done, show folder ID -->
        @if (step() === 'owner-done') {
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.created.title' | translate }}</h1>
            <p class="text-muted-foreground text-sm mb-4">{{ 'family.created.description' | translate }}</p>

            <!-- Family folder ID display -->
            <div class="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3 mb-3">
              <code class="flex-1 font-mono text-xs break-all text-foreground">{{ createdFileId() }}</code>
              <button type="button" (click)="onCopyFileId()"
                class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                [attr.aria-label]="'family.copyFileId' | translate">
                @if (copied()) {
                  <lucide-icon name="check" class="h-4 w-4" style="color: var(--success)" />
                } @else {
                  <lucide-icon name="copy" class="h-4 w-4" />
                }
              </button>
            </div>

            <!-- Instructions -->
            <div class="glass-card p-4 rounded-2xl mb-4 text-sm text-muted-foreground space-y-2">
              <p>1. {{ 'family.instruction1' | translate }}</p>
              <p>2. {{ 'family.instruction2' | translate }}</p>
              <p>3. {{ 'family.instruction3' | translate }}</p>
            </div>

            <!-- Open in Drive link -->
            <a [href]="createdDriveUrl()"
              target="_blank" rel="noreferrer"
              class="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6">
              <lucide-icon name="external-link" class="h-4 w-4" />
              {{ 'family.openDrive' | translate }}
            </a>
          </div>

          <button type="button" (click)="onProceedToApp()"
            class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold">
            {{ 'family.continueApp' | translate }}
          </button>
        }

        <!-- Step: Partner — enter Family Folder ID -->
        @if (step() === 'partner-setup') {
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight mb-2">{{ 'family.join.title' | translate }}</h1>
            <p class="text-muted-foreground text-sm mb-4">{{ 'family.join.description' | translate }}</p>

            @if (errorMessage()) {
              <div class="glass-card border-destructive/40 bg-destructive/10 p-4 mb-4 rounded-2xl" role="alert">
                <div class="flex items-start gap-3">
                  <lucide-icon name="alert-circle" class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p class="text-sm text-destructive">{{ errorMessage() }}</p>
                </div>
              </div>
            }

            <input appClearable
              type="text"
              [(ngModel)]="partnerFileIdInput"
              [placeholder]="'family.fileIdPlaceholder' | translate"
              class="w-full rounded-2xl border border-border bg-card/60 px-4 py-3 font-mono text-xs text-foreground outline-none focus:border-primary mb-3"
              aria-label="Shared Family Folder ID"
            />

            <button type="button" (click)="onPartnerConnect()"
              [disabled]="isLoading() || !partnerFileIdInput.trim()"
              class="w-full gradient-primary text-primary-foreground shadow-glow rounded-2xl px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              @if (isLoading()) {
                <lucide-icon name="loader-2" class="h-4 w-4 animate-spin inline mr-2" />
                {{ 'family.connecting' | translate }}
              } @else {
                {{ 'common.connect' | translate }}
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
  readonly copied = signal(false);
  partnerFileIdInput = '';

  async onSelectOwner(): Promise<void> {
    this.step.set('owner-setup');
    this.errorMessage.set(null);
    this.isLoading.set(true);
    try {
      await this.#createAndFinish();
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

  async onPartnerConnect(): Promise<void> {
    const sharedId = this.partnerFileIdInput.trim();
    if (!sharedId) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // New family-folder flow: partner enters the shared folder ID.
      let fileId = await this.googleDriveService.findBackupFileInFolder(sharedId);
      let familyFolderId: string | null = sharedId;

      // Backward compatibility: old users may still paste a shared backup file ID.
      if (!fileId) {
        fileId = sharedId;
        familyFolderId = null;
      }

      // Validate by reading the backup file
      const doc = await this.googleDriveService.readBackupFile(fileId);

      if (familyFolderId && !doc.metadata.receiptFolderId) {
        const receiptFolderId = await this.googleDriveService.findOrCreateReceiptsFolderInFamilyFolder(familyFolderId);
        await this.googleDriveService.writeBackupFile(fileId, {
          ...doc,
          metadata: {
            ...doc.metadata,
            receiptFolderId,
          },
        });
      }

      await this.backupModeService.setFamilyConfig(fileId, familyFolderId, 'partner');
      await this.router.navigate(['/daily']);
    } catch (err: unknown) {
      const status = (err as DriveApiError)?.status;
      if (status === 403) {
        this.errorMessage.set('Access denied. Ask the Owner to share the file with your Google account in Google Drive.');
      } else if (status === 404 || err instanceof DriveParseError) {
        this.errorMessage.set('Folder not found or invalid. Please check the Family Folder ID and try again.');
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

  createdDriveUrl(): string {
    const id = this.createdFileId();
    if (!id) return '#';
    return this.googleDriveService.getDriveFolderUrl(id);
  }

  async #createAndFinish(): Promise<void> {
    // Create the new shared family folder in My Drive.
    // It contains spenza-backup.json and Receipts/, so the user shares one folder.
    const bundle = await this.googleDriveService.createFamilyFolderBundle();
    const newFileId = bundle.backupFileId;

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
            metadata: {
              ...privateDoc.metadata,
              receiptFolderId: privateDoc.metadata.receiptFolderId ?? bundle.receiptFolderId,
            },
          });
        } else {
          const emptyDoc = await this.googleDriveService.readBackupFile(newFileId);
          await this.googleDriveService.writeBackupFile(newFileId, {
            ...emptyDoc,
            metadata: {
              ...emptyDoc.metadata,
              receiptFolderId: bundle.receiptFolderId,
            },
          });
        }
      }
    } catch (err) {
      // Non-critical — if migration fails, the shared file starts empty
      // The user's private data is still safe in appDataFolder
      if (isDevMode()) { console.warn('[FamilySetup] Could not copy private backup to shared file:', err); }
    }

    try {
      const familyDoc = await this.googleDriveService.readBackupFile(newFileId);
      if (!familyDoc.metadata.receiptFolderId) {
        await this.googleDriveService.writeBackupFile(newFileId, {
          ...familyDoc,
          metadata: {
            ...familyDoc.metadata,
            receiptFolderId: bundle.receiptFolderId,
          },
        });
      }
    } catch (err) {
      if (isDevMode()) { console.warn('[FamilySetup] Could not stamp receipt folder on family backup:', err); }
    }

    await this.backupModeService.setFamilyConfig(newFileId, bundle.familyFolderId, 'owner');
    this.createdFileId.set(bundle.familyFolderId);
    this.step.set('owner-done');
  }

  #extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return (err as { message: string }).message;
    }
    return 'An unexpected error occurred. Please try again.';
  }
}
