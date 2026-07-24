import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Users,
  Plus,
  Link2,
  Share2,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Download,
  HandCoins,
  Paperclip,
  Receipt,
  Scale,
  UserPlus,
  UserMinus,
  Settings2,
  X,
} from 'lucide-angular';
import {
  buildCircleLink,
  type CircleDocument,
  type CircleExpense,
  type CircleExpenseBill,
  type CircleMember,
} from '../../core/models/circle.model';
import { BillImageTooLargeError, compressBillImage, compressedBillToFile } from '../../core/utils/bill-image';
import { GoogleDriveService } from '../../core/services/google-drive.service';
import { ReceiptExtractionService } from '../../core/services/receipt-extraction.service';
import {
  buildShareSummaryText,
  circleHasFamilies,
  computeFamilyBalances,
  computeFamilySettlementTransfers,
  computeMemberBalances,
  computeSettlementTransfers,
} from '../../core/utils/circle-settlement';
import { toLocalDateString } from '../../core/utils/local-date';
import { AuthService } from '../../core/services/auth.service';
import { CircleApiService, CircleApiError } from '../../core/services/circle-api.service';
import { CircleSyncService } from '../../core/services/circle-sync.service';
import { I18nService } from '../../core/services/i18n.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import {
  ThemedSelectComponent,
  type ThemedSelectOption,
} from '../../shared/components/themed-select/themed-select.component';
import { TranslatePipe } from '../../shared/pipes';

type Tab = 'expenses' | 'balances' | 'settle';

/**
 * Circle detail — expenses, balances, Settle Up (docs/circle-splits-plan.md §7).
 * Budget rule: circle spends never touch personal expenses; only the member's
 * own per-head share is posted on Settle Up (source: 'circle-settle').
 */
@Component({
  selector: 'app-circle-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ModalComponent, ThemedSelectComponent, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({
        Users, Plus, Link2, Share2, Pencil, Trash2, ArrowLeft, ArrowRight, Camera, Check,
        CheckCircle2, Download, HandCoins, Paperclip, Receipt, Scale, UserPlus, UserMinus,
        Settings2, X,
      }),
    },
  ],
  template: `
    @if (circle(); as c) {
      <div class="space-y-5">

        <!-- Sticky header: title row + tabs stay reachable while scrolling.
             FULL-BLEED bar (negative margins cancel the shell container's
             px-4/px-6 + top padding) so scrolling cards vanish beneath it —
             a floating rounded card here lets cards peek through the side
             gaps and translucent corners (2026-07-24 overlap bug). top
             offsets clear the app-shell bars (mobile 61px, desktop 65px). -->
        <div class="sticky top-[61px] z-30 -mx-4 -mt-6 space-y-3 border-b border-border/50 bg-background/95 px-4 pb-3 pt-3 backdrop-blur-xl min-[887px]:top-[65px] min-[887px]:-mx-6 min-[887px]:-mt-8 min-[887px]:px-6 min-[887px]:pt-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <button (click)="goBack()" class="shrink-0 rounded-xl p-2 hover:bg-accent" [attr.aria-label]="'common.back' | translate">
                <lucide-icon name="arrow-left" class="h-5 w-5" />
              </button>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h1 class="truncate text-xl font-bold tracking-tight">{{ c.name }}</h1>
                  @if (c.status === 'settled') {
                    <span class="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                      {{ 'splits.settledChip' | translate }}
                    </span>
                  }
                </div>
                <p class="truncate text-xs text-muted-foreground">
                  {{ i18n.t('splits.detail.total', { amount: fmt(totalSpent()), count: activeExpenses().length }) }}
                </p>
              </div>
            </div>
            @if (c.status === 'active') {
              <div class="flex shrink-0 items-center gap-1.5">
                @if (isOwner()) {
                  <button
                    (click)="openManageMembers()"
                    class="rounded-xl border border-border p-2 hover:bg-accent"
                    [attr.aria-label]="'splits.members.manage' | translate"
                  >
                    <lucide-icon name="settings-2" class="h-4 w-4" />
                  </button>
                }
                <button
                  (click)="shareInvite()"
                  class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <lucide-icon name="link-2" class="h-4 w-4" />
                  {{ 'splits.detail.invite' | translate }}
                </button>
              </div>
            }
          </div>

          <!-- Segmented tabs — matches the app's pill nav (active = primary + glow) -->
          <div class="flex gap-1 rounded-full border border-border/60 bg-muted/60 p-1" role="tablist">
            @for (tab of tabs; track tab) {
              <button
                role="tab"
                [attr.aria-selected]="activeTab() === tab"
                (click)="activeTab.set(tab)"
                [class]="activeTab() === tab
                  ? 'flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground shadow-glow transition-all'
                  : 'flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium text-muted-foreground transition-all hover:text-foreground'"
              >
                <lucide-icon [name]="tabIcon(tab)" class="h-3.5 w-3.5" />
                {{ ('splits.tab.' + tab) | translate }}
              </button>
            }
          </div>
        </div>

        <!-- My position banner -->
        @if (myBalance(); as mine) {
          <div class="glass-card rounded-xl p-4">
            <p class="text-xs text-muted-foreground">{{ 'splits.detail.myPosition' | translate }}</p>
            <p class="mt-1 text-lg font-bold"
               [class.text-emerald-500]="mine.net > 0"
               [class.text-red-500]="mine.net < 0">
              @if (mine.net > 0) {
                {{ i18n.t('splits.detail.getBack', { amount: fmt(mine.net) }) }}
              } @else if (mine.net < 0) {
                {{ i18n.t('splits.detail.owe', { amount: fmt(-mine.net) }) }}
              } @else {
                {{ 'splits.detail.evenSteven' | translate }}
              }
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ i18n.t('splits.detail.paidShare', { paid: fmt(mine.paid), share: fmt(mine.share) }) }}
            </p>
          </div>
        }

        <!-- ── Expenses tab ── -->
        @if (activeTab() === 'expenses') {
          @if (c.status === 'active') {
            <button
              (click)="openAddExpense()"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90"
            >
              <lucide-icon name="plus" class="h-4 w-4" />
              {{ 'splits.expense.add' | translate }}
            </button>
          }

          <div class="space-y-3">
            @if (activeExpenses().length === 0) {
              <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                {{ 'splits.expense.empty' | translate }}
              </div>
            }
            @for (expense of activeExpenses(); track expense.expenseId) {
              <div class="glass-card rounded-xl p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{{ expense.description }}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {{ expense.date }} ·
                      {{ i18n.t('splits.expense.paidBy', { name: memberName(expense.paidByMemberId) }) }} ·
                      {{ i18n.t('splits.expense.splitAmong', { count: expense.participantMemberIds.length }) }}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-semibold">{{ fmt(expense.amount) }}</p>
                    <div class="mt-1 flex justify-end gap-1">
                      @if (expense.hasBill) {
                        <button (click)="openBillViewer(expense)" class="rounded-lg p-1.5 text-primary hover:bg-primary/10" [attr.aria-label]="'splits.bill.view' | translate">
                          <lucide-icon name="paperclip" class="h-3.5 w-3.5" />
                        </button>
                      }
                      @if (canEdit(expense) && c.status === 'active') {
                        <button (click)="openEditExpense(expense)" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" [attr.aria-label]="'common.edit' | translate">
                          <lucide-icon name="pencil" class="h-3.5 w-3.5" />
                        </button>
                        <button (click)="confirmDelete(expense)" class="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10" [attr.aria-label]="'common.delete' | translate">
                          <lucide-icon name="trash-2" class="h-3.5 w-3.5" />
                        </button>
                      }
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <!-- ── Balances tab ── -->
        @if (activeTab() === 'balances') {
          <div class="space-y-3">
            @if (hasFamilies()) {
              @for (family of familyBalances(); track family.headMemberId) {
                <div class="glass-card rounded-xl p-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <p class="font-medium">{{ memberName(family.headMemberId) }}</p>
                      @if (family.memberIds.length > 1) {
                        <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {{ i18n.t('splits.family.chip', { count: family.memberIds.length }) }}
                        </span>
                      } @else if (!isClaimed(family.headMemberId)) {
                        <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {{ 'splits.balances.notJoined' | translate }}
                        </span>
                      }
                    </div>
                    <p class="font-semibold"
                       [class.text-emerald-500]="family.net > 0"
                       [class.text-red-500]="family.net < 0">
                      {{ family.net > 0 ? '+' : '' }}{{ fmt(family.net) }}
                    </p>
                  </div>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ i18n.t('splits.detail.paidShare', { paid: fmt(family.paid), share: fmt(family.share) }) }}
                  </p>
                  @if (family.memberIds.length > 1) {
                    <div class="mt-2 space-y-1 border-t border-border pt-2">
                      @for (mid of family.memberIds; track mid) {
                        @if (memberBalance(mid); as mb) {
                          <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {{ memberName(mid) }}
                              @if (mid === family.headMemberId) {
                                · {{ 'splits.family.headBadge' | translate }}
                              }
                            </span>
                            <span>{{ i18n.t('splits.detail.paidShare', { paid: fmt(mb.paid), share: fmt(mb.share) }) }}</span>
                          </div>
                        }
                      }
                    </div>
                  }
                </div>
              }
            } @else {
            @for (balance of balances(); track balance.memberId) {
              <div class="glass-card rounded-xl p-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ memberName(balance.memberId) }}</p>
                    @if (!isClaimed(balance.memberId)) {
                      <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {{ 'splits.balances.notJoined' | translate }}
                      </span>
                    }
                  </div>
                  <p class="font-semibold"
                     [class.text-emerald-500]="balance.net > 0"
                     [class.text-red-500]="balance.net < 0">
                    {{ balance.net > 0 ? '+' : '' }}{{ fmt(balance.net) }}
                  </p>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ i18n.t('splits.detail.paidShare', { paid: fmt(balance.paid), share: fmt(balance.share) }) }}
                </p>
              </div>
            }
            }
          </div>
        }

        <!-- ── Settle Up tab ── -->
        @if (activeTab() === 'settle') {
          <div class="space-y-3">
            @if (transfers().length === 0) {
              <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
                {{ 'splits.settle.allSquare' | translate }}
              </div>
            }
            @for (transfer of transfers(); track $index) {
              <div class="glass-card flex items-center justify-between rounded-xl p-4">
                <div class="flex min-w-0 items-center gap-2 text-sm">
                  <span class="truncate font-medium">{{ memberName(transfer.fromMemberId) }}</span>
                  <lucide-icon name="arrow-right" class="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span class="truncate font-medium">{{ memberName(transfer.toMemberId) }}</span>
                </div>
                <p class="shrink-0 font-semibold">{{ fmt(transfer.amount) }}</p>
              </div>
            }

            <button
              (click)="shareSummary()"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              <lucide-icon name="share-2" class="h-4 w-4" />
              {{ 'splits.settle.share' | translate }}
            </button>

            @if (c.status === 'active' && isOwner()) {
              <button
                (click)="isSettleConfirmOpen.set(true)"
                class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow"
              >
                <lucide-icon name="check-circle-2" class="h-4 w-4" />
                {{ 'splits.settle.action' | translate }}
              </button>
            }

            @if (c.status === 'settled') {
              @if (myFamilyAck(); as ack) {
                <div class="glass-card flex items-start gap-2.5 rounded-xl p-4">
                  <lucide-icon name="users" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p class="text-xs text-muted-foreground">
                    {{ i18n.t('splits.family.coveredBy', { amount: fmt(ack.share), name: ack.headName }) }}
                  </p>
                </div>
              } @else {
                <div class="glass-card flex items-start gap-2.5 rounded-xl p-4">
                  <lucide-icon name="hand-coins" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <p class="text-xs text-muted-foreground">{{ 'splits.settle.autoLogged' | translate }}</p>
                </div>
              }
            }

            @if (isOwner()) {
              <button
                (click)="isDeleteCircleOpen.set(true)"
                class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
              >
                <lucide-icon name="trash-2" class="h-4 w-4" />
                {{ 'splits.circle.delete' | translate }}
              </button>
            }
          </div>
        }

        <!-- ── Add/edit expense modal ── -->
        <app-modal
          [title]="(editingExpenseId() ? 'splits.expense.editTitle' : 'splits.expense.addTitle') | translate"
          [isOpen]="isExpenseModalOpen()"
          [showActions]="false"
          (cancelled)="isExpenseModalOpen.set(false)"
        >
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium" for="exp-desc">{{ 'splits.expense.description' | translate }}</label>
              <input id="exp-desc" [(ngModel)]="formDescription" maxlength="80"
                [placeholder]="'splits.expense.descriptionPlaceholder' | translate"
                class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium" for="exp-amount">{{ 'splits.expense.amount' | translate }}</label>
                <input id="exp-amount" type="number" inputmode="decimal" min="0.01" step="0.01" [(ngModel)]="formAmount"
                  class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium" for="exp-date">{{ 'splits.expense.date' | translate }}</label>
                <input id="exp-date" type="date" [(ngModel)]="formDate"
                  class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium" for="exp-paidby">{{ 'splits.expense.paidByLabel' | translate }}</label>
              <select id="exp-paidby" [(ngModel)]="formPaidBy"
                class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                @for (member of membersList(); track member.memberId) {
                  <option [value]="member.memberId">{{ member.name }}</option>
                }
              </select>
            </div>
            <div>
              <p class="mb-1 text-sm font-medium">{{ 'splits.expense.participants' | translate }}</p>
              <p class="mb-2 text-xs text-muted-foreground">{{ 'splits.expense.participantsHint' | translate }}</p>
              <div class="flex flex-wrap gap-2">
                @for (member of membersList(); track member.memberId) {
                  <button
                    (click)="toggleParticipant(member.memberId)"
                    [class]="formParticipants().includes(member.memberId)
                      ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                      : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground'"
                  >{{ member.name }}</button>
                }
              </div>
            </div>

            <!-- Bill attachment: shared compressed preview for all members;
                 the original also archives to the uploader's own Drive. -->
            <div class="rounded-xl border border-dashed border-border px-3 py-2.5">
              <input #billInput type="file" accept="image/*,application/pdf" class="hidden" (change)="onBillFilePicked($event)" />
              <input #billCameraInput type="file" accept="image/*" capture="environment" class="hidden" (change)="onBillFilePicked($event)" />
              @if (pendingBillFile(); as file) {
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2 text-sm">
                    <lucide-icon name="paperclip" class="h-4 w-4 shrink-0 text-primary" />
                    <span class="truncate">{{ file.name }}</span>
                  </div>
                  <button (click)="pendingBillFile.set(null)" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" [attr.aria-label]="'common.cancel' | translate">
                    <lucide-icon name="x" class="h-4 w-4" />
                  </button>
                </div>
              } @else {
                <div class="flex gap-2">
                  <button
                    (click)="billCameraInput.click()"
                    class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <lucide-icon name="camera" class="h-4 w-4" />
                    {{ 'splits.bill.camera' | translate }}
                  </button>
                  <button
                    (click)="billInput.click()"
                    class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <lucide-icon name="paperclip" class="h-4 w-4" />
                    {{ (editingHasBill() ? 'splits.bill.replace' : 'splits.bill.attach') | translate }}
                  </button>
                </div>
              }
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button (click)="isExpenseModalOpen.set(false)"
                class="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent">
                {{ 'common.cancel' | translate }}
              </button>
              <button (click)="saveExpense()" [disabled]="isSaving() || !formValid()"
                class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                {{ 'common.save' | translate }}
              </button>
            </div>
          </div>
        </app-modal>

        <!-- ── Bill viewer ── -->
        <app-modal
          [title]="'splits.bill.title' | translate"
          [isOpen]="billViewerExpense() !== null"
          [showActions]="false"
          (cancelled)="closeBillViewer()"
        >
          <div class="space-y-3">
            @if (billLoading()) {
              <p class="py-6 text-center text-sm text-muted-foreground">{{ 'splits.bill.loading' | translate }}</p>
            } @else if (billData(); as bill) {
              <img
                [src]="bill.dataUrl"
                [alt]="'splits.bill.title' | translate"
                class="max-h-[60vh] w-full rounded-xl border border-border object-contain"
              />
              <p class="text-[11px] text-muted-foreground">
                {{ i18n.t('splits.bill.uploadedBy', { name: memberName(bill.uploadedByMemberId) }) }}
              </p>
              <div class="flex gap-2">
                <button
                  (click)="downloadBill()"
                  class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <lucide-icon name="download" class="h-4 w-4" />
                  {{ 'splits.bill.save' | translate }}
                </button>
                @if (canRemoveBill()) {
                  <button
                    (click)="removeBill()"
                    [disabled]="isSaving()"
                    class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <lucide-icon name="trash-2" class="h-4 w-4" />
                    {{ 'splits.bill.remove' | translate }}
                  </button>
                }
              </div>
            } @else {
              <p class="py-6 text-center text-sm text-muted-foreground">{{ 'splits.bill.loadFailed' | translate }}</p>
            }
          </div>
        </app-modal>

        <!-- ── Delete confirm ── -->
        <app-modal
          [title]="'splits.expense.deleteTitle' | translate"
          [isOpen]="deleteTarget() !== null"
          (confirmed)="deleteExpense()"
          (cancelled)="deleteTarget.set(null)"
        >
          <p class="text-sm text-muted-foreground">{{ 'splits.expense.deleteBody' | translate }}</p>
        </app-modal>

        <!-- ── Settle confirm ── -->
        <app-modal
          [title]="'splits.settle.confirmTitle' | translate"
          [isOpen]="isSettleConfirmOpen()"
          (confirmed)="settleCircle()"
          (cancelled)="isSettleConfirmOpen.set(false)"
        >
          <p class="text-sm text-muted-foreground">{{ 'splits.settle.confirmBody' | translate }}</p>
        </app-modal>

        <!-- ── Manage members (owner) ── -->
        <app-modal
          [title]="'splits.members.manage' | translate"
          [isOpen]="isManageMembersOpen()"
          [showActions]="false"
          (cancelled)="isManageMembersOpen.set(false)"
        >
          <div class="space-y-4">
            <p class="text-xs text-muted-foreground">{{ 'splits.members.hint' | translate }}</p>
            <div class="space-y-2">
              @for (member of membersList(); track member.memberId) {
                <div class="rounded-xl border border-border px-3 py-2.5">
                  @if (editingMemberId() === member.memberId) {
                    <div class="flex items-center gap-1.5">
                      <input
                        [(ngModel)]="editingMemberName"
                        (keydown.enter)="saveMemberName(member)"
                        maxlength="40"
                        class="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        (click)="saveMemberName(member)"
                        [disabled]="isSaving() || editingMemberName().trim().length === 0"
                        class="rounded-lg p-2 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-30"
                        [attr.aria-label]="'common.save' | translate"
                      >
                        <lucide-icon name="check" class="h-4 w-4" />
                      </button>
                      <button
                        (click)="editingMemberId.set(null)"
                        class="rounded-lg p-2 text-muted-foreground hover:bg-accent"
                        [attr.aria-label]="'common.cancel' | translate"
                      >
                        <lucide-icon name="x" class="h-4 w-4" />
                      </button>
                    </div>
                  } @else {
                    <div class="flex items-center justify-between">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium">{{ member.name }}</p>
                        <p class="text-[11px] text-muted-foreground">
                          {{ (member.uid !== null ? 'splits.members.joined' : 'splits.balances.notJoined') | translate }}
                          @if (memberPaid(member.memberId)) {
                            · {{ 'splits.members.removeBlocked' | translate }}
                          }
                          @if (isHeadWithMembers(member.memberId)) {
                            · {{ 'splits.family.removeBlocked' | translate }}
                          }
                        </p>
                      </div>
                      <div class="flex shrink-0 items-center">
                        <button
                          (click)="startEditMember(member)"
                          [disabled]="isSaving()"
                          class="rounded-lg p-2 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          [attr.aria-label]="'splits.members.rename' | translate"
                        >
                          <lucide-icon name="pencil" class="h-4 w-4" />
                        </button>
                        @if (member.uid !== c.ownerUid) {
                          <button
                            (click)="removeMember(member)"
                            [disabled]="isSaving() || memberPaid(member.memberId) || isHeadWithMembers(member.memberId)"
                            class="rounded-lg p-2 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                            [attr.aria-label]="'splits.members.remove' | translate"
                          >
                            <lucide-icon name="user-minus" class="h-4 w-4" />
                          </button>
                        }
                      </div>
                    </div>
                  }
                  <div class="mt-2 flex items-center gap-2">
                    <span class="w-14 shrink-0 text-[11px] text-muted-foreground">{{ 'splits.family.label' | translate }}</span>
                    <div class="min-w-0 flex-1">
                      <app-themed-select
                        size="sm"
                        [options]="familyOptionsFor(member.memberId)"
                        [value]="member.familyHeadMemberId ?? ''"
                        (valueChange)="assignFamily(member, $event)"
                      />
                    </div>
                  </div>
                </div>
              }
            </div>
            <div class="flex gap-2">
              <input
                [(ngModel)]="newMemberName"
                (keydown.enter)="addMember()"
                [placeholder]="'splits.members.addPlaceholder' | translate"
                maxlength="40"
                class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                (click)="addMember()"
                [disabled]="isSaving() || newMemberName().trim().length === 0"
                class="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                <lucide-icon name="user-plus" class="h-4 w-4" />
                {{ 'splits.members.add' | translate }}
              </button>
            </div>
            <p class="text-[11px] text-muted-foreground">{{ 'splits.members.retroNote' | translate }}</p>
          </div>
        </app-modal>

        <!-- ── New member: share existing bills or only upcoming? ── -->
        <app-modal
          [title]="i18n.t('splits.members.retroTitle', { name: pendingAddName() })"
          [isOpen]="isRetroChoiceOpen()"
          [showActions]="false"
          (cancelled)="cancelAddMember()"
        >
          <div class="space-y-3">
            <p class="text-sm text-muted-foreground">
              {{ i18n.t('splits.members.retroBody', { name: pendingAddName() }) }}
            </p>
            <button
              (click)="confirmAddMember(true)"
              [disabled]="isSaving()"
              class="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {{ 'splits.members.retroAll' | translate }}
            </button>
            <button
              (click)="confirmAddMember(false)"
              [disabled]="isSaving()"
              class="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {{ 'splits.members.retroUpcoming' | translate }}
            </button>
            <p class="text-[11px] text-muted-foreground">{{ 'splits.members.retroCustomNote' | translate }}</p>
          </div>
        </app-modal>

        <!-- ── Delete circle (owner) ── -->
        <app-modal
          [title]="'splits.circle.deleteTitle' | translate"
          [isOpen]="isDeleteCircleOpen()"
          [showActions]="false"
          (cancelled)="isDeleteCircleOpen.set(false)"
        >
          <div class="space-y-3">
            <p class="text-sm text-muted-foreground">
              {{ i18n.t('splits.circle.deleteBody', { name: c.name, count: activeExpenses().length }) }}
            </p>
            <button
              (click)="deleteCircle()"
              [disabled]="isSaving()"
              class="w-full rounded-xl bg-red-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {{ 'splits.circle.deleteConfirm' | translate }}
            </button>
            <button
              (click)="isDeleteCircleOpen.set(false)"
              [disabled]="isSaving()"
              class="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium"
            >
              {{ 'common.cancel' | translate }}
            </button>
          </div>
        </app-modal>

      </div>
    } @else {
      <div class="glass-card rounded-xl p-6 text-center text-sm text-muted-foreground">
        {{ 'splits.loading' | translate }}
      </div>
    }
  `,
})
export class CircleDetailComponent implements OnInit, OnDestroy {
  readonly circleSync = inject(CircleSyncService);
  readonly i18n = inject(I18nService);
  private readonly circleApi = inject(CircleApiService);
  private readonly googleDrive = inject(GoogleDriveService);
  private readonly receiptExtraction = inject(ReceiptExtractionService);
  private readonly authService = inject(AuthService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly tabs: Tab[] = ['expenses', 'balances', 'settle'];
  readonly activeTab = signal<Tab>('expenses');
  readonly #tabIcons: Record<Tab, string> = {
    expenses: 'receipt',
    balances: 'scale',
    settle: 'hand-coins',
  };

  tabIcon(tab: Tab): string {
    return this.#tabIcons[tab];
  }

  private readonly circleId = signal<string>('');

  readonly circle = computed<CircleDocument | null>(
    () => this.circleSync.circles().find((c) => c.circleId === this.circleId()) ?? null,
  );
  readonly membersList = computed<CircleMember[]>(() => {
    const c = this.circle();
    return c ? Object.values(c.members).sort((a, b) => a.name.localeCompare(b.name)) : [];
  });
  readonly activeExpenses = computed(() =>
    this.circleSync.activeCircleExpenses().filter((e) => !e.deleted),
  );
  readonly totalSpent = computed(() =>
    Math.round(this.activeExpenses().reduce((sum, e) => sum + e.amount * 100, 0)) / 100,
  );
  readonly balances = computed(() =>
    computeMemberBalances(this.membersList(), this.circleSync.activeCircleExpenses()),
  );
  readonly hasFamilies = computed(() => circleHasFamilies(this.membersList()));
  readonly familyBalances = computed(() =>
    computeFamilyBalances(this.membersList(), this.circleSync.activeCircleExpenses()),
  );
  /** Family circles settle head-to-head; plain circles member-to-member. */
  readonly transfers = computed(() =>
    this.hasFamilies()
      ? computeFamilySettlementTransfers(this.membersList(), this.circleSync.activeCircleExpenses())
      : computeSettlementTransfers(this.balances()),
  );
  readonly myMember = computed<CircleMember | null>(() => {
    const c = this.circle();
    return c ? this.circleSync.memberForUid(c, this.authService.firebaseUid()) : null;
  });
  readonly myBalance = computed(() => {
    const mine = this.myMember();
    return mine ? this.balances().find((b) => b.memberId === mine.memberId) ?? null : null;
  });
  readonly isOwner = computed(() => this.circle()?.ownerUid === this.authService.firebaseUid());
  /**
   * Settled + I'm a NON-HEAD family member → my share was carried by my head.
   * Drives the acknowledgment card instead of the "auto-logged" note.
   */
  readonly myFamilyAck = computed<{ headName: string; share: number } | null>(() => {
    const c = this.circle();
    const mine = this.myMember();
    if (!c || c.status !== 'settled' || !mine) return null;
    const headId = mine.familyHeadMemberId;
    if (headId == null || headId === mine.memberId) return null;
    return { headName: this.memberName(headId), share: this.myBalance()?.share ?? 0 };
  });

  // Expense form state
  readonly isExpenseModalOpen = signal(false);
  readonly editingExpenseId = signal<string | null>(null);
  readonly formDescription = signal('');
  readonly formAmount = signal<number | null>(null);
  readonly formDate = signal(toLocalDateString());
  readonly formPaidBy = signal('');
  readonly formParticipants = signal<string[]>([]);
  readonly isSaving = signal(false);

  readonly deleteTarget = signal<CircleExpense | null>(null);
  readonly isSettleConfirmOpen = signal(false);

  // Manage members (owner)
  readonly isManageMembersOpen = signal(false);
  readonly newMemberName = signal('');
  /** Name parked while the retro/upcoming choice modal is open ('' = none). */
  readonly pendingAddName = signal('');
  readonly isRetroChoiceOpen = signal(false);
  readonly isDeleteCircleOpen = signal(false);
  /** Member whose name is being edited inline in Manage members. */
  readonly editingMemberId = signal<string | null>(null);
  readonly editingMemberName = signal('');

  // Bill attachment state
  readonly pendingBillFile = signal<File | null>(null);
  readonly billViewerExpense = signal<CircleExpense | null>(null);
  readonly billData = signal<CircleExpenseBill | null>(null);
  readonly billLoading = signal(false);
  readonly editingHasBill = computed(() => {
    const id = this.editingExpenseId();
    return !!id && !!this.activeExpenses().find((e) => e.expenseId === id)?.hasBill;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.circleId.set(id);
    void this.circleSync.startListening();
    void this.circleSync.openCircle(id);
  }

  ngOnDestroy(): void {
    this.circleSync.closeCircle();
  }

  goBack(): void {
    void this.router.navigate(['/splits']);
  }

  fmt(amount: number): string {
    const currency = this.circle()?.currency || 'INR';
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  memberName(memberId: string): string {
    return this.circle()?.members[memberId]?.name ?? '?';
  }

  memberBalance(memberId: string) {
    return this.balances().find((b) => b.memberId === memberId) ?? null;
  }

  /** A head with family members can't be removed until the family is disbanded. */
  isHeadWithMembers(memberId: string): boolean {
    return this.membersList().some(
      (m) => m.memberId !== memberId && m.familyHeadMemberId === memberId,
    );
  }

  isClaimed(memberId: string): boolean {
    return this.circle()?.members[memberId]?.uid !== null;
  }

  canEdit(expense: CircleExpense): boolean {
    const uid = this.authService.firebaseUid();
    return !!uid && (expense.authorUid === uid || this.isOwner());
  }

  // ── Expense CRUD ──
  openAddExpense(): void {
    this.editingExpenseId.set(null);
    this.formDescription.set('');
    this.formAmount.set(null);
    this.formDate.set(toLocalDateString());
    this.formPaidBy.set(this.myMember()?.memberId ?? this.membersList()[0]?.memberId ?? '');
    this.formParticipants.set(this.membersList().map((m) => m.memberId));
    this.pendingBillFile.set(null);
    this.isExpenseModalOpen.set(true);
  }

  openEditExpense(expense: CircleExpense): void {
    this.editingExpenseId.set(expense.expenseId);
    this.formDescription.set(expense.description);
    this.formAmount.set(expense.amount);
    this.formDate.set(expense.date);
    this.formPaidBy.set(expense.paidByMemberId);
    this.formParticipants.set([...expense.participantMemberIds]);
    this.pendingBillFile.set(null);
    this.isExpenseModalOpen.set(true);
  }

  toggleParticipant(memberId: string): void {
    const current = this.formParticipants();
    this.formParticipants.set(
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  formValid(): boolean {
    const amount = Number(this.formAmount());
    return (
      this.formDescription().trim().length > 0 &&
      Number.isFinite(amount) &&
      amount > 0 &&
      !!this.formDate() &&
      !!this.formPaidBy() &&
      this.formParticipants().length > 0
    );
  }

  async saveExpense(): Promise<void> {
    if (!this.formValid() || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      const input = {
        description: this.formDescription().trim(),
        amount: Math.round(Number(this.formAmount()) * 100) / 100,
        date: this.formDate(),
        paidByMemberId: this.formPaidBy(),
        participantMemberIds: this.formParticipants(),
      };
      const editingId = this.editingExpenseId();
      let expenseId = editingId;
      if (editingId) {
        await this.circleSync.updateExpense(this.circleId(), editingId, input);
      } else {
        expenseId = await this.circleSync.addExpense(this.circleId(), input);
      }
      this.isExpenseModalOpen.set(false);
      this.feedback.success(this.i18n.t('splits.expense.saved'));
      // Bill upload AFTER the expense is safe — its failure never loses the bill's expense.
      const billFile = this.pendingBillFile();
      if (billFile && expenseId) {
        this.pendingBillFile.set(null);
        await this.#uploadBill(billFile, expenseId, input.date);
      }
    } catch (error) {
      console.warn('[Splits] saveExpense failed:', error);
      this.feedback.error(this.i18n.t('splits.expense.saveFailed'));
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Bill attachment ──
  onBillFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) this.pendingBillFile.set(file);
    input.value = ''; // allow re-picking the same file
  }

  async #uploadBill(file: File, expenseId: string, date: string): Promise<void> {
    try {
      // PRODUCT RULE: bills are stored as IMAGES only. PDFs render to a
      // stacked-page image first (first 4 pages); the raw PDF never leaves
      // the device.
      const sourceFile =
        file.type === 'application/pdf'
          ? await this.receiptExtraction.convertPdfToCompressedImage(file)
          : file;
      const image = await compressBillImage(sourceFile);
      await this.circleSync.uploadExpenseBill(
        this.circleId(),
        expenseId,
        image,
        this.myMember()?.memberId ?? '',
      );
      this.feedback.success(this.i18n.t('splits.bill.uploaded'));
      // Archive to the uploader's own Drive appdata — private, free,
      // best-effort. Camera/gallery images archive at original resolution;
      // PDFs archive as the converted image (image-only rule).
      const archiveFile = file.type === 'application/pdf' ? compressedBillToFile(image, `bill_${expenseId}`) : file;
      void this.googleDrive
        .uploadReceiptFile(archiveFile, `circle_${expenseId}`, date)
        .catch((err) => console.warn('[Splits] bill Drive archive failed:', err));
    } catch (error) {
      const key =
        error instanceof BillImageTooLargeError ? 'splits.bill.tooLarge' : 'splits.bill.uploadFailed';
      this.feedback.error(this.i18n.t(key));
    }
  }

  openBillViewer(expense: CircleExpense): void {
    this.billViewerExpense.set(expense);
    this.billData.set(null);
    this.billLoading.set(true);
    void this.circleSync
      .fetchExpenseBill(this.circleId(), expense.expenseId)
      .then((bill) => this.billData.set(bill))
      .catch(() => this.billData.set(null))
      .finally(() => this.billLoading.set(false));
  }

  closeBillViewer(): void {
    this.billViewerExpense.set(null);
    this.billData.set(null);
  }

  canRemoveBill(): boolean {
    const expense = this.billViewerExpense();
    return (
      !!expense && this.circle()?.status === 'active' && this.canEdit(expense)
    );
  }

  downloadBill(): void {
    const bill = this.billData();
    const expense = this.billViewerExpense();
    if (!bill || !expense) return;
    const ext = bill.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const anchor = document.createElement('a');
    anchor.href = bill.dataUrl;
    anchor.download = `spenza-bill-${expense.date}-${expense.description.slice(0, 24).replace(/[^\w-]+/g, '_')}.${ext}`;
    anchor.click();
  }

  async removeBill(): Promise<void> {
    const expense = this.billViewerExpense();
    if (!expense || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.circleSync.removeExpenseBill(this.circleId(), expense.expenseId);
      this.closeBillViewer();
      this.feedback.success(this.i18n.t('splits.bill.removed'));
    } catch (error) {
      console.warn('[Splits] removeBill failed:', error);
      this.feedback.error(this.i18n.t('splits.bill.uploadFailed'));
    } finally {
      this.isSaving.set(false);
    }
  }

  confirmDelete(expense: CircleExpense): void {
    this.deleteTarget.set(expense);
  }

  async deleteExpense(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleteTarget.set(null);
    try {
      await this.circleSync.removeExpense(this.circleId(), target.expenseId);
      this.feedback.success(this.i18n.t('splits.expense.deleted'));
    } catch (error) {
      console.warn('[Splits] deleteExpense failed:', error);
      this.feedback.error(this.i18n.t('splits.expense.saveFailed'));
    }
  }

  // ── Manage members (owner) ──
  openManageMembers(): void {
    this.newMemberName.set('');
    this.isManageMembersOpen.set(true);
  }

  /** True when the member PAID any live bill — their money must stay
   *  attributed, so removal is blocked (server re-checks). Participant-only
   *  members are removable: the server strips them from every split and
   *  balances re-tally automatically. */
  memberPaid(memberId: string): boolean {
    return this.circleSync
      .activeCircleExpenses()
      .some((e) => !e.deleted && e.paidByMemberId === memberId);
  }

  async addMember(): Promise<void> {
    const name = this.newMemberName().trim();
    if (!name || this.isSaving()) return;
    // With live bills on the board, the owner must decide whether the new
    // member shares them or only upcoming ones. No bills yet → nothing to
    // decide, add directly.
    const hasLiveExpenses = this.circleSync.activeCircleExpenses().some((e) => !e.deleted);
    if (hasLiveExpenses) {
      this.pendingAddName.set(name);
      this.isRetroChoiceOpen.set(true);
      return;
    }
    await this.#submitAddMember(name, false);
  }

  async confirmAddMember(shareExisting: boolean): Promise<void> {
    const name = this.pendingAddName();
    if (!name || this.isSaving()) return;
    await this.#submitAddMember(name, shareExisting);
    this.isRetroChoiceOpen.set(false);
    this.pendingAddName.set('');
  }

  cancelAddMember(): void {
    this.isRetroChoiceOpen.set(false);
    this.pendingAddName.set('');
  }

  async #submitAddMember(name: string, shareExisting: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.circleApi.updateCircle({
        circleId: this.circleId(),
        addMemberNames: [name],
        ...(shareExisting ? { shareExistingForNewMembers: true } : {}),
      });
      this.newMemberName.set('');
      this.feedback.success(this.i18n.t('splits.members.added'));
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.members.failed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  async removeMember(member: CircleMember): Promise<void> {
    if (this.isSaving() || this.memberPaid(member.memberId)) return;
    this.isSaving.set(true);
    try {
      await this.circleApi.updateCircle({ circleId: this.circleId(), removeMemberId: member.memberId });
      this.feedback.success(this.i18n.t('splits.members.removed'));
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.members.failed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** ThemedSelect options for a member's family assignment. */
  familyOptionsFor(memberId: string): ThemedSelectOption[] {
    return [
      { value: '', label: this.i18n.t('splits.family.individual') },
      ...this.membersList().map((head) => ({
        value: head.memberId,
        label:
          head.memberId === memberId
            ? this.i18n.t('splits.family.headSelf')
            : this.i18n.t('splits.family.inFamilyOf', { name: head.name }),
      })),
    ];
  }

  startEditMember(member: CircleMember): void {
    this.editingMemberId.set(member.memberId);
    this.editingMemberName.set(member.name);
  }

  async saveMemberName(member: CircleMember): Promise<void> {
    const name = this.editingMemberName().trim();
    if (!name || this.isSaving()) return;
    if (name === member.name) {
      this.editingMemberId.set(null);
      return;
    }
    this.isSaving.set(true);
    try {
      await this.circleApi.updateCircle({
        circleId: this.circleId(),
        renameMember: { memberId: member.memberId, name },
      });
      this.editingMemberId.set(null);
      this.feedback.success(this.i18n.t('splits.members.renamed'));
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.members.failed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Owner assigns/clears a member's family from the Manage members sheet. */
  async assignFamily(member: CircleMember, headValue: string): Promise<void> {
    const headId = headValue === '' ? null : headValue;
    if ((member.familyHeadMemberId ?? null) === headId || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.circleApi.updateCircle({
        circleId: this.circleId(),
        assignFamilies: { [member.memberId]: headId },
      });
      this.feedback.success(this.i18n.t('splits.family.updated'));
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.family.failed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Delete circle (owner) ──
  async deleteCircle(): Promise<void> {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.circleApi.deleteCircle(this.circleId());
      this.isDeleteCircleOpen.set(false);
      this.feedback.success(this.i18n.t('splits.circle.deleted'));
      void this.router.navigate(['/splits']);
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.circle.deleteFailed'), detail);
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Invite ──
  async shareInvite(): Promise<void> {
    try {
      const { inviteCode } = await this.circleApi.createCircleInvite(this.circleId());
      const link = buildCircleLink(inviteCode);
      const text = this.i18n.t('splits.detail.inviteText', {
        circle: this.circle()?.name ?? '',
        link,
        code: inviteCode,
      });
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        this.feedback.success(this.i18n.t('splits.detail.inviteCopied'));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return; // user closed share sheet
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.detail.inviteFailed'), detail);
    }
  }

  // ── Share summary ──
  async shareSummary(): Promise<void> {
    const c = this.circle();
    if (!c) return;
    const text = buildShareSummaryText(
      c.name,
      this.membersList(),
      this.circleSync.activeCircleExpenses(),
      (n) => this.fmt(n),
    );
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        this.feedback.success(this.i18n.t('splits.settle.summaryCopied'));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      console.warn('[Splits] shareSummary failed:', error);
    }
  }

  // ── Settle Up ──
  async settleCircle(): Promise<void> {
    this.isSettleConfirmOpen.set(false);
    try {
      await this.circleApi.settleCircle(this.circleId());
      // The per-head share is auto-logged into Daily by CircleSyncService the
      // moment the listener sees the settled status — no user action needed.
      this.feedback.success(
        this.i18n.t('splits.settle.done'),
        this.i18n.t('splits.settle.autoLogged'),
      );
    } catch (error) {
      const detail = error instanceof CircleApiError ? error.message : undefined;
      this.feedback.error(this.i18n.t('splits.settle.failed'), detail);
    }
  }
}
