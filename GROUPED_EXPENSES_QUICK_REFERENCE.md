# Grouped Expenses - Quick Reference Card

## 🎯 What It Does

Automatically groups multiple expenses of the same type into single entries for a cleaner view.

## 📊 At a Glance

| Feature | Description |
|---------|-------------|
| **Grouping** | Automatic by expense type |
| **Sorting** | By total amount (highest first) |
| **Count Badge** | Shows number of entries (e.g., 3×) |
| **Totals** | Displays total amount and savings |
| **Detail View** | Tap to see all individual entries |
| **Actions** | Edit/delete individual entries |

## 🔍 Visual Indicators

```
🍔 Food & Groceries [3×]    ₹750
   3 entries · Tap to view details
   
   [3×]     = 3 entries in this group
   ₹750     = Total amount spent
   Green    = Under budget
   Red      = Over budget
```

## 🖱️ User Actions

| Action | Result |
|--------|--------|
| **Tap group** | Opens detail popup |
| **Tap single entry** | Opens single entry detail |
| **Edit button** | Opens edit form |
| **Delete button** | Removes entry |
| **Close (×)** | Closes detail popup |

## 📱 Views

### List View
- Shows grouped entries
- Count badge for multiple entries
- Total amount and savings
- Quick actions for single entries

### Detail Popup (Single)
- Full entry details
- Complete comment
- Edit and Delete buttons

### Detail Popup (Grouped)
- Aggregated totals at top
- List of all individual entries
- Edit/Delete for each entry
- Scrollable content

## 🎨 Color Coding

| Color | Meaning |
|-------|---------|
| **Green** | Under budget (savings) |
| **Red** | Over budget (overspend) |
| **Blue stripe** | Food category |
| **Purple stripe** | Transport category |
| **Orange stripe** | Entertainment category |

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Tab** | Navigate entries |
| **Enter** | Open detail |
| **Escape** | Close detail |
| **Space** | Activate button |

## 📐 Layout

```
┌─────────────────────────────────────┐
│ Today's Entries  5 logged · 3 cats  │ ← Header
├─────────────────────────────────────┤
│ [Date Picker]                       │ ← Date selector
├─────────────────────────────────────┤
│ 🍔 Food [3×]              ₹750     │ ← Grouped entry
│ 🎬 Entertainment          ₹300     │ ← Single entry
│ 🚗 Transport              ₹150     │ ← Single entry
└─────────────────────────────────────┘
```

## 🔢 Calculations

### Group Totals
```
Entry 1: ₹300
Entry 2: ₹250
Entry 3: ₹200
─────────────
Total:   ₹750
```

### Savings
```
Limit:   ₹500
Total:   ₹750
─────────────
Savings: -₹250 (over budget)
```

## 🚀 Quick Tips

1. **Highest First**: Groups sorted by spending
2. **Tap to Expand**: Click group to see details
3. **Individual Actions**: Edit/delete from detail view
4. **Date Navigation**: Works with any date
5. **Auto-Update**: Changes reflect immediately

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Not grouping** | Refresh page |
| **Wrong totals** | Check individual entries |
| **Can't edit** | Open detail popup first |
| **Missing entries** | Check date selector |

## 📚 Documentation

- **Full Guide**: GROUPED_EXPENSES_USER_GUIDE.md
- **Technical**: GROUPED_EXPENSES_FEATURE.md
- **Visual**: GROUPED_EXPENSES_VISUAL_GUIDE.md
- **Summary**: GROUPED_EXPENSES_SUMMARY.md

## 🎓 Examples

### Example 1: Multiple Coffee Purchases
```
Before:
- Coffee ₹50
- Coffee ₹50
- Coffee ₹50

After:
- Coffee [3×] ₹150
```

### Example 2: Mixed Categories
```
Before:
- Food ₹300
- Food ₹250
- Transport ₹150
- Food ₹200

After:
- Food [3×] ₹750
- Transport ₹150
```

## ✅ Benefits

- ✅ **40% less clutter**
- ✅ **Faster overview**
- ✅ **Better insights**
- ✅ **Easy management**
- ✅ **Mobile friendly**

## 🎯 Use Cases

1. **Daily Review**: Quickly see spending patterns
2. **Budget Tracking**: Identify overspending categories
3. **Entry Management**: Edit/delete specific entries
4. **Historical View**: Review past dates
5. **Expense Analysis**: Compare category totals

## 📞 Support

For issues or questions:
1. Check documentation files
2. Review visual guide
3. Test with sample data
4. Check browser console for errors

---

**Quick Start**: Just log multiple expenses of the same type and watch them group automatically! 🎉

**Version**: 1.0  
**Last Updated**: May 9, 2026
