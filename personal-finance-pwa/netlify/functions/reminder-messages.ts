export interface ReminderMessage {
  title: string;
  body: string;
}

const HOURLY_REMINDER_TIPS = [
  'Tiny spends count. Log the last one before it hides in your balance.',
  'A quick expense check now can save a budget surprise later.',
  'Pause before the next non-essential purchase and keep one goal in view.',
  'Prices and rates can shift; your best defense is knowing today’s cash flow.',
  'Small daily records make weekly money decisions much easier.',
  'Check your recent payments and keep Spenza in sync.',
  'If a spend felt optional, tag it honestly and learn from the pattern.',
  'A clean expense log is a quiet win for future you.',
];

export function getHourlyReminderMessage(slotKey: string): ReminderMessage {
  const tip = HOURLY_REMINDER_TIPS[stableIndex(slotKey, HOURLY_REMINDER_TIPS.length)];
  return {
    title: 'Spenza money tip',
    body: `${tip} Add your latest expenses now.`,
  };
}

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}
