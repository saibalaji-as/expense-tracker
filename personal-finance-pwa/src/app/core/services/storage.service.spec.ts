import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { StorageService } from './storage.service';

// In-memory store backing the mock
const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) =>
      Promise.resolve({ value: store.get(key) ?? null })
    ),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    remove: vi.fn(({ key }: { key: string }) => {
      store.delete(key);
      return Promise.resolve();
    }),
  },
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    store.clear();
    service = new StorageService();
  });

  // Feature: capacitor-preferences-migration, Property 1: set-then-get round-trip
  // Validates: Requirements 2.6
  it('set then get returns the stored value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // key
        fc.string(),                  // value
        async (key, value) => {
          store.clear();
          await service.set(key, value);
          const result = await service.get(key);
          expect(result).toBe(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: capacitor-preferences-migration, Property 2: remove clears the key
  // Validates: Requirements 2.7
  it('set then remove then get returns null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string(),
        async (key, value) => {
          store.clear();
          await service.set(key, value);
          await service.remove(key);
          const result = await service.get(key);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: capacitor-preferences-migration, Property 3: last write wins
  // Validates: Requirements 2.8
  it('second set overwrites the first', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.string(),
        async (key, v1, v2) => {
          store.clear();
          await service.set(key, v1);
          await service.set(key, v2);
          const result = await service.get(key);
          expect(result).toBe(v2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
