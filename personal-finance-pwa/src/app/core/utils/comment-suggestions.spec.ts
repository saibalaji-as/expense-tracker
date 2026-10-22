import { describe, expect, it } from 'vitest';
import {
  COMMENT_SUGGESTIONS,
  commentSuggestionsFor,
  mealOfTheDay,
  personalSuggestions,
} from './comment-suggestions';
import { PREDEFINED_EXPENSE_TYPES } from '../models/category-definitions';

describe('comment suggestions', () => {
  it('has a curated list for every predefined category', () => {
    for (const type of PREDEFINED_EXPENSE_TYPES) {
      expect(COMMENT_SUGGESTIONS[type]?.length, type).toBeGreaterThanOrEqual(5);
    }
  });

  it('returns category-specific chips', () => {
    const transport = commentSuggestionsFor('Transportation', { hour: 9 }).map((c) => c.label);
    expect(transport).toContain('Auto fare');
    expect(transport).not.toContain('School fees');
  });

  it('falls back to Miscellaneous for unknown / custom categories', () => {
    const labels = commentSuggestionsFor('My custom type', { hour: 9 }).map((c) => c.label);
    expect(labels).toContain('Pooja / temple offering');
  });

  it('puts the meal of the day first for Dining Out', () => {
    expect(commentSuggestionsFor('Dining Out', { hour: 8 })[0].label).toBe('Breakfast');
    expect(commentSuggestionsFor('Dining Out', { hour: 13 })[0].label).toBe('Lunch');
    expect(mealOfTheDay(17).label).toBe('Chai & snacks');
    expect(mealOfTheDay(22).label).toBe('Dinner');
    expect(mealOfTheDay(2).label).toBe('Dinner');
  });

  it('surfaces repeated personal comments first and skips SMS-like text', () => {
    const history = [
      { type: 'Dining Out', comment: 'Office canteen', date: '2026-10-01' },
      { type: 'Dining Out', comment: 'office canteen', date: '2026-10-02' },
      { type: 'Dining Out', comment: 'Rs 250 debited from a/c XX1234', date: '2026-10-02' },
      { type: 'Dining Out', comment: 'Rs 250 debited from a/c XX1234', date: '2026-10-03' },
      { type: 'Transportation', comment: 'Office canteen', date: '2026-10-02' },
      { type: 'Dining Out', comment: 'Once only', date: '2026-10-02' },
    ];
    expect(personalSuggestions('Dining Out', history).map((c) => c.label)).toEqual(['Office canteen']);
    const chips = commentSuggestionsFor('Dining Out', { hour: 13, history }).map((c) => c.label);
    expect(chips[0]).toBe('Office canteen');
    expect(chips).not.toContain('Once only');
  });

  it('de-duplicates and caps the list', () => {
    const chips = commentSuggestionsFor('Dining Out', { hour: 13, limit: 4 });
    expect(chips).toHaveLength(4);
    const labels = chips.map((c) => c.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length); // 'Lunch' appears once
  });
});
