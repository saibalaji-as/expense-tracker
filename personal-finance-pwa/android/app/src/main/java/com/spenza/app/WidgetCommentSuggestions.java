package com.spenza.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Type-aware quick comment chips for the widget expense form.
 *
 * MIRROR of {@code src/app/core/utils/comment-suggestions.ts} (used by the
 * in-app Notifications log sheet) — keep both tables in sync. Suggestions are
 * tuned for everyday South/South-East Asian household spending.
 *
 * Order: the user's own repeated comments for the type (from the local backup
 * snapshot), a time-of-day meal for Dining Out, then the curated list.
 */
final class WidgetCommentSuggestions {

    private WidgetCommentSuggestions() {}

    /** One chip: emoji is decorative and never saved into the comment. */
    static final class Chip {
        final String emoji;
        final String label;
        Chip(String emoji, String label) { this.emoji = emoji; this.label = label; }
        String display() { return emoji + " " + label; }
    }

    private static final int LIMIT = 10;
    private static final int MAX_PERSONAL = 3;
    private static final int HISTORY_DAYS = 120;
    private static final Pattern SMS_LIKE = Pattern.compile(
        "(debited|credited|a/c|acct|upi|ref|txn|avl bal|rs\\.?\\s?\\d|inr\\s?\\d)",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern LONG_NUMBER = Pattern.compile("\\d{4,}");

    private static final Map<String, Chip[]> CATALOGUE = new HashMap<>();

    /** Matches the app's DEBT_PAYMENT_EXPENSE_TYPE. */
    static final String TYPE_DEBT_PAYMENT = "Debt Payment";

    private static Chip c(String emoji, String label) { return new Chip(emoji, label); }

    static {
        CATALOGUE.put(WidgetExpenseConstants.TYPE_HOUSING, new Chip[] {
            c("🏠", "House rent"), c("🧹", "Maid salary"), c("🏢", "Maintenance charges"),
            c("🔧", "Plumber / electrician"), c("🛋️", "Furniture"), c("🪣", "Water can"),
            c("🔥", "Gas cylinder"), c("🛠️", "Home repair"), c("🔑", "Rent advance"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_FOOD, new Chip[] {
            c("🛒", "Kirana / monthly groceries"), c("🥬", "Vegetables (sabzi)"), c("🥛", "Milk"),
            c("🍚", "Rice & dal"), c("🍎", "Fruits"), c("🐟", "Fish / meat"), c("🥚", "Eggs"),
            c("🫓", "Atta / flour"), c("🧂", "Masala & oil"), c("🍞", "Bakery"), c("🛍️", "Supermarket"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_TRANSPORT, new Chip[] {
            c("⛽", "Petrol"), c("🛺", "Auto fare"), c("🚕", "Cab (Ola / Uber)"), c("🚌", "Bus ticket"),
            c("🚇", "Metro"), c("🚆", "Train ticket"), c("🅿️", "Parking"), c("🛣️", "Toll / FASTag"),
            c("🔧", "Bike / car service"), c("✈️", "Flight ticket"), c("🛵", "Rapido"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_UTILITIES, new Chip[] {
            c("💡", "EB / electricity bill"), c("📱", "Mobile recharge"), c("🌐", "Wi-Fi / broadband"),
            c("🚰", "Water bill"), c("🔥", "Gas bill"), c("📺", "DTH recharge"), c("🧺", "Ironing / laundry"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_HEALTHCARE, new Chip[] {
            c("💊", "Medicines (pharmacy)"), c("🩺", "Doctor consultation"), c("🧪", "Lab test"),
            c("🦷", "Dental"), c("👓", "Eye checkup / glasses"), c("🛡️", "Health insurance"),
            c("🌿", "Ayurveda / siddha"), c("👵", "Parents' medicines"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_ENTERTAINMENT, new Chip[] {
            c("🎬", "Movie tickets"), c("🍿", "Popcorn & snacks"), c("🎳", "Outing with friends"),
            c("🏏", "Cricket match"), c("🎮", "Gaming"), c("🎡", "Family outing"), c("🎤", "Concert / event"),
            c("🏖️", "Weekend trip"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_DINING, new Chip[] {
            c("☕", "Chai & snacks"), c("🍛", "Lunch"), c("🍽️", "Dinner"), c("🥘", "Biryani"),
            c("🥞", "Tiffin (idli / dosa)"), c("🛵", "Swiggy / Zomato"), c("🍜", "Street food"),
            c("🧋", "Juice / bubble tea"), c("🍰", "Sweets / mithai"), c("🎉", "Treat for friends"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_SHOPPING, new Chip[] {
            c("👗", "Clothes"), c("🥻", "Saree / ethnic wear"), c("🪔", "Festival shopping"),
            c("👟", "Footwear"), c("📦", "Amazon / Flipkart"), c("🎒", "Kids' items"),
            c("📱", "Gadgets"), c("🏺", "Household items"), c("🎁", "Gift"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_SAVINGS, new Chip[] {
            c("🏦", "RD / FD deposit"), c("🪙", "Gold savings scheme"), c("🤝", "Chit fund"),
            c("🐷", "Emergency fund"), c("📮", "Post office savings"), c("👪", "Sent to parents"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_INVESTMENTS, new Chip[] {
            c("📈", "SIP / mutual fund"), c("📊", "Stocks"), c("🪙", "Gold / SGB"), c("🏛️", "PPF"),
            c("🛡️", "LIC premium"), c("👧", "Sukanya Samriddhi"), c("🧓", "NPS"), c("🏘️", "Land / plot EMI"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_EDUCATION, new Chip[] {
            c("🏫", "School fees"), c("📚", "Tuition fees"), c("📖", "Books & stationery"),
            c("🚐", "School van"), c("👔", "Uniform"), c("💻", "Online course"), c("📝", "Exam fees"),
            c("🎨", "Extra classes (music / dance)"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_PERSONAL, new Chip[] {
            c("💇", "Haircut / salon"), c("💅", "Parlour"), c("🧴", "Toiletries"), c("🏋️", "Gym"),
            c("🧘", "Yoga class"), c("💄", "Cosmetics"), c("🪒", "Grooming"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_SUBSCRIPTIONS, new Chip[] {
            c("🎬", "Netflix"), c("📺", "Hotstar / JioCinema"), c("🎵", "Spotify"), c("📦", "Amazon Prime"),
            c("▶️", "YouTube Premium"), c("☁️", "Cloud storage"), c("📰", "Newspaper"),
        });
        CATALOGUE.put(WidgetExpenseConstants.TYPE_MISC, new Chip[] {
            c("🪔", "Pooja / temple offering"), c("🙏", "Donation"), c("💍", "Wedding gift (moi / shagun)"),
            c("🎂", "Birthday gift"), c("👪", "Sent to family"), c("🧧", "Festival gifts"),
            c("🧑‍🔧", "Tips"), c("📄", "Documents / xerox"), c("🐄", "Pet / animal care"),
        });
        CATALOGUE.put(TYPE_DEBT_PAYMENT, new Chip[] {
            c("💳", "Credit card bill"), c("🏠", "Home loan EMI"), c("🚗", "Vehicle loan EMI"),
            c("📱", "Phone EMI"), c("🤝", "Repaid friend / relative"), c("🪙", "Gold loan interest"),
        });
    }

    static Chip mealOfTheDay(int hour) {
        if (hour >= 5 && hour < 11) return c("🥞", "Breakfast");
        if (hour >= 11 && hour < 16) return c("🍛", "Lunch");
        if (hour >= 16 && hour < 19) return c("☕", "Chai & snacks");
        return c("🍽️", "Dinner");
    }

    /** Suggestions for the type, personalised from the local backup snapshot. */
    static List<Chip> forType(Context context, String type) {
        JSONArray history = null;
        try {
            SharedPreferences prefs = WidgetExpenseQueue.prefs(context);
            history = WidgetCategoryPredictor.snapshotExpenses(prefs);
        } catch (RuntimeException ignored) {
            // Personal history is optional.
        }
        return forType(type, Calendar.getInstance().get(Calendar.HOUR_OF_DAY), history);
    }

    static List<Chip> forType(String type, int hour, JSONArray history) {
        String category = type != null && CATALOGUE.containsKey(type) ? type : WidgetExpenseConstants.TYPE_MISC;
        List<Chip> ordered = new ArrayList<>();
        if (type != null && history != null) ordered.addAll(personal(type, history));
        if (WidgetExpenseConstants.TYPE_DINING.equals(category)) ordered.add(mealOfTheDay(hour));
        Collections.addAll(ordered, CATALOGUE.get(category));

        Set<String> seen = new HashSet<>();
        List<Chip> result = new ArrayList<>();
        for (Chip chip : ordered) {
            if (!seen.add(chip.label.toLowerCase(Locale.ROOT))) continue;
            result.add(chip);
            if (result.size() >= LIMIT) break;
        }
        return result;
    }

    private static boolean isReusable(String comment) {
        if (comment.length() < 2 || comment.length() > 40) return false;
        if (LONG_NUMBER.matcher(comment).find()) return false;
        return !SMS_LIKE.matcher(comment).find();
    }

    /** The user's own comments used at least twice for this type (recent window). */
    static List<Chip> personal(String type, JSONArray history) {
        Calendar since = Calendar.getInstance();
        since.add(Calendar.DAY_OF_YEAR, -HISTORY_DAYS);
        String sinceDate = String.format(Locale.US, "%04d-%02d-%02d",
            since.get(Calendar.YEAR), since.get(Calendar.MONTH) + 1, since.get(Calendar.DAY_OF_MONTH));

        Map<String, String> labels = new LinkedHashMap<>();
        Map<String, Integer> counts = new HashMap<>();
        Map<String, String> latest = new HashMap<>();
        for (int i = 0; i < history.length(); i++) {
            JSONObject entry = history.optJSONObject(i);
            if (entry == null || !type.equals(entry.optString("type", ""))) continue;
            String date = entry.optString("date", "");
            if (!date.isEmpty() && date.compareTo(sinceDate) < 0) continue;
            String label = entry.optString("comment", "").trim().replaceAll("\\s+", " ");
            if (!isReusable(label)) continue;
            String key = label.toLowerCase(Locale.ROOT);
            if (!labels.containsKey(key)) labels.put(key, label);
            counts.put(key, (counts.containsKey(key) ? counts.get(key) : 0) + 1);
            String prev = latest.get(key);
            if (prev == null || date.compareTo(prev) > 0) latest.put(key, date);
        }

        List<String> keys = new ArrayList<>();
        for (String key : labels.keySet()) {
            if (counts.get(key) >= 2) keys.add(key);
        }
        Collections.sort(keys, (a, b) -> {
            int byCount = Integer.compare(counts.get(b), counts.get(a));
            return byCount != 0 ? byCount : latest.get(b).compareTo(latest.get(a));
        });

        List<Chip> result = new ArrayList<>();
        for (String key : keys) {
            result.add(c("⭐", labels.get(key)));
            if (result.size() >= MAX_PERSONAL) break;
        }
        return result;
    }
}
