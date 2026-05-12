# Backdate Expense Entry - Quick Reference

## 🎯 What It Does

Allows users to log expenses for **previous dates**, not just today.

## 🚀 Quick Start

### Log Today's Expense (Default)
1. Enter category, amount, comment
2. Click "Log [Category]"
3. Done! ✅

### Log Previous Date Expense
1. **Click date picker**
2. **Select past date**
3. Enter category, amount, comment
4. Click "Log [Category]"
5. Done! ✅

### Quick Reset to Today
- Click **"Today"** button next to date picker

## 📅 Date Picker

```
┌─────────────────────────────────────┐
│ 📅  2026-05-08        [Today]       │
└─────────────────────────────────────┘
     ↑                    ↑
  Select date        Quick reset
```

## ✅ What You Can Do

- Log expenses for **any past date**
- Edit an entry's date
- Backfill expense history
- Correct date mistakes

## ❌ What You Cannot Do

- Log **future expenses** (blocked by date picker)

## 🎨 Visual States

| State | Display |
|-------|---------|
| **Today** | `📅 2026-05-09` |
| **Past Date** | `📅 2026-05-08 [Today]` |
| **Focused** | Blue border around picker |

## 💡 Common Use Cases

### Forgot Yesterday's Expense
```
1. Click date picker
2. Select yesterday
3. Log expense
✅ Appears on yesterday's date
```

### Backfill Last Week
```
For each expense:
1. Select its date
2. Log details
3. Submit
✅ Complete history
```

### Fix Wrong Date
```
1. Edit entry
2. Change date
3. Update
✅ Entry moves to correct date
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Tab** | Navigate to date picker |
| **Enter** | Open calendar |
| **Arrows** | Navigate dates |
| **Escape** | Close calendar |

## 📱 Mobile

- Native date picker (iOS/Android style)
- Touch-friendly interface
- Easy month navigation

## 🔍 Finding Backdated Entries

1. Go to "Today's Entries" section
2. Click date picker
3. Select the date
4. View entries for that date

## ⚡ Tips

1. **Default is Today**: No need to touch date picker for today's expenses
2. **Resets After Submit**: Date goes back to today after each entry
3. **Use Comments**: Add context to backdated entries
4. **Double-Check**: Verify date before submitting

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't select date | Make sure it's not in the future |
| Date keeps resetting | Normal - resets to today after submit |
| Entry not showing | Navigate to that date to view it |

## 📊 Budget Impact

- Backdated expenses count toward **that date's budget**
- Not today's budget
- Each date has its own budget

## 🎓 Examples

### Example 1: Yesterday's Coffee
```
Date: Yesterday
Category: Dining Out
Amount: ₹50
Comment: Morning coffee
```

### Example 2: Last Week's Groceries
```
Date: May 2, 2026
Category: Food & Groceries
Amount: ₹500
Comment: Weekly shopping
```

### Example 3: Correcting Today's Entry
```
1. Edit entry
2. Change date to yesterday
3. Update
✅ Entry moves to yesterday
```

## 📋 Form Fields

```
┌─────────────────────────────────────┐
│ Expense Type: [Food]                │
│ Amount: ₹ [300]                     │
│ Date: 📅 [2026-05-08] [Today]      │ ← NEW
│ Comment: [Optional]                 │
│ [Log Food & Groceries]              │
└─────────────────────────────────────┘
```

## ✨ Key Features

- ✅ **Flexible**: Any past date
- ✅ **Safe**: No future dates
- ✅ **Convenient**: Quick "Today" button
- ✅ **Accurate**: Correct budget per date
- ✅ **Easy**: Native date picker

## 📚 More Info

- **Full Guide**: BACKDATE_EXPENSE_USER_GUIDE.md
- **Technical**: BACKDATE_EXPENSE_FEATURE.md
- **Summary**: BACKDATE_EXPENSE_SUMMARY.md

---

**Quick Tip**: For most entries, just ignore the date picker - it defaults to today! 🎯
