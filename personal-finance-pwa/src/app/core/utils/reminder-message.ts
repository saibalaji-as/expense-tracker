export interface ReminderContent {
  title: string;
  body: string;
}

const DAILY_REMINDER_TIPS = [
  'Log today, then spot one small spend you can skip tomorrow.',
  'Quick money move: record each spend before bed so leaks stay visible.',
  'Before your next checkout, pause once and ask if it still matters tomorrow.',
  'Track the tiny spends too. They are usually where the budget gets blurry.',
  'Move any leftover wants money toward savings before it disappears.',
  'Compare your payment alerts with Spenza today. Clean records make better choices.',
  'Prices and rates can move fast; a steady daily budget habit keeps you ready.',
  'One honest expense log today beats a perfect budget you never update.',
];

export function getDailyReminderContent(date = new Date()): ReminderContent {
  const tip = DAILY_REMINDER_TIPS[dayOfYear(date) % DAILY_REMINDER_TIPS.length];
  return {
    title: 'Spenza money tip',
    body: `${tip} Add today's expenses now.`,
  };
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}
