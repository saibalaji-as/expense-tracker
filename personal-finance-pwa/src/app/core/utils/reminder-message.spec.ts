import { describe, expect, it } from 'vitest';
import { getDailyReminderContent } from './reminder-message';

describe('getDailyReminderContent', () => {
  it('returns a money tip reminder that still asks the user to log expenses', () => {
    const content = getDailyReminderContent(new Date(2026, 4, 20));

    expect(content.title).toBe('Spenza money tip');
    expect(content.body).toContain("Add today's expenses now.");
    expect(content.body.length).toBeGreaterThan(40);
  });

  it('rotates content by local calendar day', () => {
    const today = getDailyReminderContent(new Date(2026, 4, 20));
    const tomorrow = getDailyReminderContent(new Date(2026, 4, 21));

    expect(tomorrow.body).not.toBe(today.body);
  });
});
