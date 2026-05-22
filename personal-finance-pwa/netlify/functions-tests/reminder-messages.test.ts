import { describe, expect, it } from 'vitest';
import { getHourlyReminderMessage } from '../functions/reminder-messages';

describe('getHourlyReminderMessage', () => {
  it('returns an expense reminder with a finance tip', () => {
    const message = getHourlyReminderMessage('2026-05-20T08:00');

    expect(message.title).toBe('Spenza money tip');
    expect(message.body).toContain('Add your latest expenses now.');
    expect(message.body.length).toBeGreaterThan(40);
  });

  it('is stable for the same reminder slot', () => {
    const first = getHourlyReminderMessage('2026-05-20T09:00');
    const second = getHourlyReminderMessage('2026-05-20T09:00');

    expect(second).toEqual(first);
  });
});
