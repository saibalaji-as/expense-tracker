/**
 * Type-aware quick comment suggestions for the expense log forms
 * (Notifications inbox log sheet; mirrored for the native widget form in
 * `android/.../WidgetCommentSuggestions.java` — keep the two tables in sync).
 *
 * Suggestions are written for everyday South/South-East Asian household
 * spending (kirana, chai, auto fare, EB bill, school fees, chit fund, gold,
 * festival and family obligations) rather than a generic Western list.
 *
 * Order of the final list:
 *   1. the user's own most-used comments for that category (personal history),
 *   2. a time-of-day meal pick for Dining Out (breakfast / lunch / chai / dinner),
 *   3. the curated per-category catalogue.
 * Duplicates (case-insensitive) are removed and the list is capped.
 */

export interface CommentSuggestion {
  /** Text inserted into the comment field. */
  label: string;
  /** Decorative emoji shown on the chip only (never saved into the comment). */
  emoji: string;
}

const s = (emoji: string, label: string): CommentSuggestion => ({ emoji, label });

export const COMMENT_SUGGESTIONS: Readonly<Record<string, readonly CommentSuggestion[]>> = {
  'Housing': [
    s('🏠', 'House rent'), s('🧹', 'Maid salary'), s('🏢', 'Maintenance charges'),
    s('🔧', 'Plumber / electrician'), s('🛋️', 'Furniture'), s('🪣', 'Water can'),
    s('🔥', 'Gas cylinder'), s('🛠️', 'Home repair'), s('🔑', 'Rent advance'),
  ],
  'Food & Groceries': [
    s('🛒', 'Kirana / monthly groceries'), s('🥬', 'Vegetables (sabzi)'), s('🥛', 'Milk'),
    s('🍚', 'Rice & dal'), s('🍎', 'Fruits'), s('🐟', 'Fish / meat'), s('🥚', 'Eggs'),
    s('🫓', 'Atta / flour'), s('🧂', 'Masala & oil'), s('🍞', 'Bakery'), s('🛍️', 'Supermarket'),
  ],
  'Transportation': [
    s('⛽', 'Petrol'), s('🛺', 'Auto fare'), s('🚕', 'Cab (Ola / Uber)'), s('🚌', 'Bus ticket'),
    s('🚇', 'Metro'), s('🚆', 'Train ticket'), s('🅿️', 'Parking'), s('🛣️', 'Toll / FASTag'),
    s('🔧', 'Bike / car service'), s('✈️', 'Flight ticket'), s('🛵', 'Rapido'),
  ],
  'Utilities': [
    s('💡', 'EB / electricity bill'), s('📱', 'Mobile recharge'), s('🌐', 'Wi-Fi / broadband'),
    s('🚰', 'Water bill'), s('🔥', 'Gas bill'), s('📺', 'DTH recharge'), s('🧺', 'Ironing / laundry'),
  ],
  'Healthcare': [
    s('💊', 'Medicines (pharmacy)'), s('🩺', 'Doctor consultation'), s('🧪', 'Lab test'),
    s('🦷', 'Dental'), s('👓', 'Eye checkup / glasses'), s('🛡️', 'Health insurance'),
    s('🌿', 'Ayurveda / siddha'), s('👵', 'Parents\' medicines'),
  ],
  'Entertainment': [
    s('🎬', 'Movie tickets'), s('🍿', 'Popcorn & snacks'), s('🎳', 'Outing with friends'),
    s('🏏', 'Cricket match'), s('🎮', 'Gaming'), s('🎡', 'Family outing'), s('🎤', 'Concert / event'),
    s('🏖️', 'Weekend trip'),
  ],
  'Dining Out': [
    s('☕', 'Chai & snacks'), s('🍛', 'Lunch'), s('🍽️', 'Dinner'), s('🥘', 'Biryani'),
    s('🥞', 'Tiffin (idli / dosa)'), s('🛵', 'Swiggy / Zomato'), s('🍜', 'Street food'),
    s('🧋', 'Juice / bubble tea'), s('🍰', 'Sweets / mithai'), s('🎉', 'Treat for friends'),
  ],
  'Shopping/Clothing': [
    s('👗', 'Clothes'), s('🥻', 'Saree / ethnic wear'), s('🪔', 'Festival shopping'),
    s('👟', 'Footwear'), s('📦', 'Amazon / Flipkart'), s('🎒', 'Kids\' items'),
    s('📱', 'Gadgets'), s('🏺', 'Household items'), s('🎁', 'Gift'),
  ],
  'Savings/Emergency Fund': [
    s('🏦', 'RD / FD deposit'), s('🪙', 'Gold savings scheme'), s('🤝', 'Chit fund'),
    s('🐷', 'Emergency fund'), s('📮', 'Post office savings'), s('👪', 'Sent to parents'),
  ],
  'Investments': [
    s('📈', 'SIP / mutual fund'), s('📊', 'Stocks'), s('🪙', 'Gold / SGB'), s('🏛️', 'PPF'),
    s('🛡️', 'LIC premium'), s('👧', 'Sukanya Samriddhi'), s('🧓', 'NPS'), s('🏘️', 'Land / plot EMI'),
  ],
  'Education': [
    s('🏫', 'School fees'), s('📚', 'Tuition fees'), s('📖', 'Books & stationery'),
    s('🚐', 'School van'), s('👔', 'Uniform'), s('💻', 'Online course'), s('📝', 'Exam fees'),
    s('🎨', 'Extra classes (music / dance)'),
  ],
  'Personal Care': [
    s('💇', 'Haircut / salon'), s('💅', 'Parlour'), s('🧴', 'Toiletries'), s('🏋️', 'Gym'),
    s('🧘', 'Yoga class'), s('💄', 'Cosmetics'), s('🪒', 'Grooming'),
  ],
  'Subscriptions': [
    s('🎬', 'Netflix'), s('📺', 'Hotstar / JioCinema'), s('🎵', 'Spotify'), s('📦', 'Amazon Prime'),
    s('▶️', 'YouTube Premium'), s('☁️', 'Cloud storage'), s('📰', 'Newspaper'),
  ],
  'Miscellaneous': [
    s('🪔', 'Pooja / temple offering'), s('🙏', 'Donation'), s('💍', 'Wedding gift (moi / shagun)'),
    s('🎂', 'Birthday gift'), s('👪', 'Sent to family'), s('🧧', 'Festival gifts'),
    s('🧑‍🔧', 'Tips'), s('📄', 'Documents / xerox'), s('🐄', 'Pet / animal care'),
  ],
  'Debt Payment': [
    s('💳', 'Credit card bill'), s('🏠', 'Home loan EMI'), s('🚗', 'Vehicle loan EMI'),
    s('📱', 'Phone EMI'), s('🤝', 'Repaid friend / relative'), s('🪙', 'Gold loan interest'),
  ],
};

/** Meal suggestion for the given local hour (Dining Out only). */
export function mealOfTheDay(hour: number): CommentSuggestion {
  if (hour >= 5 && hour < 11) return s('🥞', 'Breakfast');
  if (hour >= 11 && hour < 16) return s('🍛', 'Lunch');
  if (hour >= 16 && hour < 19) return s('☕', 'Chai & snacks');
  return s('🍽️', 'Dinner');
}

export interface SuggestionHistoryEntry {
  type: string;
  comment?: string;
  date?: string;
}

export interface CommentSuggestionOptions {
  /** Local hour 0–23 (defaults to now). */
  hour?: number;
  /** Past expenses; the user's frequent comments for the type are surfaced first. */
  history?: readonly SuggestionHistoryEntry[];
  /** Max personal-history chips (default 3). */
  maxPersonal?: number;
  /** Max total chips (default 10). */
  limit?: number;
}

/** Comments that look like raw SMS/bank text are never re-suggested. */
function isReusableComment(comment: string): boolean {
  if (comment.length < 2 || comment.length > 40) return false;
  if (/\d{4,}/.test(comment)) return false; // account / ref numbers, amounts
  if (/(debited|credited|a\/c|acct|upi|ref|txn|avl bal|rs\.?\s?\d|inr\s?\d)/i.test(comment)) return false;
  return true;
}

/** The user's most frequently used short comments for `type` (most-used first). */
export function personalSuggestions(
  type: string,
  history: readonly SuggestionHistoryEntry[],
  max = 3,
): CommentSuggestion[] {
  const counts = new Map<string, { label: string; count: number; latest: string }>();
  for (const entry of history) {
    if (entry.type !== type) continue;
    const label = (entry.comment ?? '').trim().replace(/\s+/g, ' ');
    if (!isReusableComment(label)) continue;
    const key = label.toLowerCase();
    const current = counts.get(key);
    const date = entry.date ?? '';
    if (current) {
      current.count += 1;
      if (date > current.latest) current.latest = date;
    } else {
      counts.set(key, { label, count: 1, latest: date });
    }
  }
  return [...counts.values()]
    .filter((candidate) => candidate.count >= 2)
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
    .slice(0, max)
    .map((candidate) => s('⭐', candidate.label));
}

/** Ordered, de-duplicated suggestion chips for an expense category. */
export function commentSuggestionsFor(
  type: string | null | undefined,
  options: CommentSuggestionOptions = {},
): CommentSuggestion[] {
  const category = type && COMMENT_SUGGESTIONS[type] ? type : 'Miscellaneous';
  const hour = options.hour ?? new Date().getHours();
  const limit = options.limit ?? 10;

  const ordered: CommentSuggestion[] = [];
  if (options.history && type) {
    ordered.push(...personalSuggestions(type, options.history, options.maxPersonal ?? 3));
  }
  if (category === 'Dining Out') {
    ordered.push(mealOfTheDay(hour));
  }
  ordered.push(...COMMENT_SUGGESTIONS[category]);

  const seen = new Set<string>();
  const result: CommentSuggestion[] = [];
  for (const suggestion of ordered) {
    const key = suggestion.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length >= limit) break;
  }
  return result;
}
