# Quick Start Guide - Edit & Delete Expenses

## 🚀 How to Use

### Delete an Expense
1. Find the expense in "Today's Entries"
2. Click the 🗑️ (trash) icon
3. Confirm deletion
4. Done! ✅

### Edit an Expense
1. Find the expense in "Today's Entries"
2. Click the ✏️ (pencil) icon
3. Form fills with expense data
4. Modify amount, category, or comment
5. Click "Update [Category]"
6. Done! ✅

### Cancel an Edit
1. While editing, click the ✖️ in the blue banner
2. Form resets
3. Back to normal mode

## 📱 Visual Guide

### Normal View
```
┌─────────────────────────────────────────┐
│ Today's Entries                         │
│ 3 logged                                │
├─────────────────────────────────────────┤
│ 🏠 Housing              ₹5,000    ✏️ 🗑️ │
│    14:30 · Rent      lim ₹6,000        │
│                        +₹1,000          │
├─────────────────────────────────────────┤
│ 🍔 Food                 ₹500      ✏️ 🗑️ │
│    12:15 · Lunch     lim ₹1,000        │
│                        +₹500            │
└─────────────────────────────────────────┘
```

### Edit Mode
```
┌─────────────────────────────────────────┐
│ Log Expense                             │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ ✏️ Editing expense              ✖️  │ │
│ └──────────────────────────??? 🍔 Food                 ₹500      ✏️ ?                               │
│ EXPENSE TYPE                            │
│ [🏠 Housing] [🍔 Food] [🚗 Transport]  │
│      ↑ selected                         │
│                                         │
│ AMOUNT                                  │
│ ₹ [5000] ← filled                       │
│                                         │
│ COMMENT                                 │
│ [Rent payment] ← filled                 │
│                                         │
│ [✏️ Update Housing]                     │
└─────────────────────────────────────────┘
```

## 🌐 Offline Mode

### What Happens Offline?
- ✅ Changes appear immediately in UI
- ✅ Operations saved to local queue
- ✅ Yellow toast notification appears
- ✅ Auto-syncs when back online

### Offline Toast
```
┌─────────────────────────────────────────┐
│ ⚠️ Entry saved locally — will sync     │
│    when online                          │
└─────────────────────────────────────────┘
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Navigate between buttons |
| Enter/Space | Activate button |
| Escape | (Future) Cancel edit |

## 🎯 Tips & Tricks

### Tip 1: Quick Edit
On desktop, hover over any entry to reveal edit/delete buttons

### Tip 2: Cancel Anytime
Click the ✖️ in the edit banner to cancel without saving

### Tip 3: Offline Friendly
Don't worry about internet - all changes sync automatically

### Tip 4: Confirmation
Only delete asks for confirmation - edit can be cancelled

## ❓ FAQ

### Q: Can I edit old expenses?
A: Yes! Edit works for any expense in the current view.

### Q: What if I delete by mistake?
A: Deletion requires confirmation. If confirmed, it's permanent.

### Q: Can I edit while offline?
A: Yes! Changes save locally and sync when you're back online.

### Q: How do I know if I'm in edit mode?
A: Look for the blue "Editing expense" banner at the top of the form.

### Q: Can I edit multiple expenses at once?
A: Not yet - edit one at a time for now.

### Q: What happens if sync fails?
A: The app retries up to 5 times. You'll see an error if all retries fail.

## 🐛 Troubleshooting

### Edit button not appearing?
- Try hovering over the expense entry (desktop)
- On mobile, buttons should always be visible
- Check if you're logged in

### Form not populating?
- Refresh the page
- Check browser console for errors
- Verify expense data is loaded

### Changes not syncing?
- Check internet connection
- Verify Google Sheets permissions
- Look for error notifications

### Can't cancel edit?
- Click the ✖️ button in the blue banner
- Refresh page as last resort

## 📞 Support

If you encounter issues:
1. Check the browser console for errors
2. Verify you're logged in to Google
3. Check Google Sheets permissions
4. Review the detailed documentation files

## 📚 More Information

- **DELETE_EXPENSE_IMPLEMENTATION.md** - Delete feature details
- **EDIT_EXPENSE_IMPLEMENTATION.md** - Edit feature details
- **EXPENSE_CRUD_SUMMARY.md** - Complete CRUD overview
- **EDIT_FEATURE_UI_GUIDE.md** - Visual UI guide
- **IMPLEMENTATION_SUMMARY.md** - Technical overview

---

**Happy expense tracking! 💰**
