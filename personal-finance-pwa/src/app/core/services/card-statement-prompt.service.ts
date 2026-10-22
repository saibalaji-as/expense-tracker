import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { CardStatementSource } from '../models';
import { toLocalDateString } from '../utils/local-date';

/** Figures to start the statement dialog with (e.g. read from a bank PDF). */
export interface StatementPrefill {
  amount: number;
  minDue?: number;
  dueDateStr?: string;
  source: CardStatementSource;
}

/** Local-only: which statement prompts the user answered "Not yet" to, and when. */
const STATEMENT_PROMPT_SNOOZE_KEY = 'spenza_card_statement_prompt_v1';

/**
 * UI state for the credit-card statement dialog (`<app-card-statement-prompt>`,
 * mounted once in the app shell).
 *
 * - `open(cardId)` — the user asked for the dialog (Finances card buttons).
 * - Snoozes — "Not yet" hides the automatic prompt for that card and bill
 *   until the next day. Device-local preference; never synced.
 */
@Injectable({ providedIn: 'root' })
export class CardStatementPromptService {
  private readonly storage = inject(StorageService);

  /** Card the user explicitly opened the dialog for, or null. */
  readonly requestedCardId = signal<string | null>(null);
  /** Optional figures for the requested dialog; cleared when it closes. */
  readonly requestedPrefill = signal<StatementPrefill | null>(null);
  /** `${cardId}|${billDateStr}` → local date the prompt was snoozed on. */
  private readonly snoozes = signal<Record<string, string>>({});
  /** False until the persisted snoozes are read — no automatic prompt before that. */
  readonly loaded = signal(false);

  constructor() {
    void this.load();
  }

  open(cardId: string, prefill: StatementPrefill | null = null): void {
    this.requestedPrefill.set(prefill);
    this.requestedCardId.set(cardId);
  }

  close(): void {
    this.requestedCardId.set(null);
    this.requestedPrefill.set(null);
  }

  isSnoozed(cardId: string, billDateStr: string): boolean {
    return this.snoozes()[`${cardId}|${billDateStr}`] === toLocalDateString();
  }

  async snooze(cardId: string, billDateStr: string): Promise<void> {
    const today = toLocalDateString();
    // Keep only today's snoozes — older ones can never match again.
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.snoozes())) {
      if (value === today) next[key] = value;
    }
    next[`${cardId}|${billDateStr}`] = today;
    this.snoozes.set(next);
    await this.storage.set(STATEMENT_PROMPT_SNOOZE_KEY, JSON.stringify(next));
  }

  private async load(): Promise<void> {
    try {
      const raw = await this.storage.get(STATEMENT_PROMPT_SNOOZE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const snoozes: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string') snoozes[key] = value;
        }
        this.snoozes.set(snoozes);
      }
    } catch {
      // Corrupt payload — start clean; the worst case is one extra prompt.
    } finally {
      this.loaded.set(true);
    }
  }
}
