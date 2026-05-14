import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type AppCurrency = 'INR' | 'USD' | 'AED';

export interface CurrencyOption {
  code: AppCurrency;
  symbol: string;
  nameKey: string;
  regionKey: string;
  hintKey: string;
  sampleAmount: number;
}

const STORAGE_KEY = 'spenza_currency';

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  readonly currencyOptions: CurrencyOption[] = [
    {
      code: 'INR',
      symbol: '₹',
      nameKey: 'currency.INR.name',
      regionKey: 'currency.INR.region',
      hintKey: 'currency.INR.hint',
      sampleAmount: 12500,
    },
    {
      code: 'USD',
      symbol: '$',
      nameKey: 'currency.USD.name',
      regionKey: 'currency.USD.region',
      hintKey: 'currency.USD.hint',
      sampleAmount: 150,
    },
    {
      code: 'AED',
      symbol: 'د.إ',
      nameKey: 'currency.AED.name',
      regionKey: 'currency.AED.region',
      hintKey: 'currency.AED.hint',
      sampleAmount: 550,
    },
  ];

  readonly currency = signal<AppCurrency>('INR');

  constructor(private readonly storageService: StorageService) {
    void this.load();
  }

  async setCurrency(currency: AppCurrency): Promise<void> {
    this.currency.set(currency);
    await this.storageService.set(STORAGE_KEY, currency);
  }

  symbol(currency = this.currency()): string {
    return this.option(currency).symbol;
  }

  option(currency = this.currency()): CurrencyOption {
    return this.currencyOptions.find((option) => option.code === currency) ?? this.currencyOptions[0];
  }

  format(value: number | null | undefined, locale = 'en-IN', currency = this.currency()): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));
  }

  private async load(): Promise<void> {
    const saved = await this.storageService.get(STORAGE_KEY);
    if (this.isCurrency(saved)) {
      this.currency.set(saved);
    }
  }

  private isCurrency(value: string | null): value is AppCurrency {
    return value === 'INR' || value === 'USD' || value === 'AED';
  }
}
