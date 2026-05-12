# Overspending Alert Feature

## Overview

A smart behavioral nudge system that alerts users when they're about to log an expense in a category they overspent in the previous month. This helps users learn from past spending patterns and make more conscious financial decisions.

## The Problem

**Scenario**: User bought a gas stove for ₹5,190 in April, but their monthly utility budget was only ₹2,900. They overspent by ₹2,290.

**Without This Feature**: In May, when logging another utility expense, the user has no reminder of last month's overspending and might repeat the pattern.

**With This Feature**: When the user selects "Utilities" in May, they immediately see:
```
⚠️ Budget Alert: Utilities
You overspent on Utilities last month by ₹2,290.

Last Month Spent: ₹5,190  •  Monthly Limit: ₹2,900

💡 Consider if this expense is necessary to avoid overspending again this month.
```

## Key Features

### 1. **Automatic Detection**
- Monitors previous month's spending by category
- Compares against monthly budget limits
- Identifies overspending automatically

### 2. **Smart Timing**
- Alert shows when user selects a category
- Appears before they enter the amount
- Gives them a chance to reconsider

### 3. **Detailed Information**
- Shows exact overspent amount
- Displays last month's total spending
- Shows the monthly limit for context

### 4. **Session-Based Acknowledgment**
- User can dismiss the warning
- Won't show again for that category in the same session
- Reappears in next session as a gentle reminder

### 5. **Non-Blocking**
- User can still proceed with the expense
- Not a hard block, just a nudge
- Respects user's final decision

## User Experience

### Visual Design

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  ⚠️ Budget Alert: Utilities                    [×]  │
│                                                         │
│ You overspent on Utilities last month by ₹2,290.       │
│                                                         │
│ Last Month Spent: ₹5,190  •  Monthly Limit: ₹2,900    │
│                                                         │
│ 💡 Consider if this expense is necessary to avoid      │
│    overspending again this month.                      │
└─────────────────────────────────────────────────────────┘
```

### Color Scheme
- **Orange/Amber**: Warning color (not red/error, not green/success)
- **Soft Background**: Orange with low opacity
- **Clear Icons**: Alert triangle for visibility
- **Dismissible**: X button to close

### Interaction Flow

```
Step 1: User Opens Form
┌─────────────────────────┐
│ Log Expense             │
│ [Select Category]       │
└─────────────────────────┘

Step 2: User Selects "Utilities"
┌─────────────────────────┐
│ ⚠️ Budget Alert         │ ← Warning appears
│ You overspent last      │
│ month by ₹2,290         │
└─────────────────────────┘

Step 3: User Reads Warning
- Sees overspent amount
- Sees last month's spending
- Sees monthly limit
- Considers the expense

Step 4: User Decides
Option A: Dismisses and proceeds
Option B: Changes category
Option C: Cancels expense entry
```

## Implementation Details

### Data Loading

#### On Component Init
```typescript
ngOnInit(): void {
  // Load current month
  const currentMonth = new Date().toISOString().slice(0, 7);
  this.expenseStore.loadMonth(currentMonth);
  
  // Load previous month for overspending checks
  const lastMonth = this.getPreviousMonth();
  this.expenseStore.loadMonth(lastMonth, false); // Don't update selectedMonth
}
```

### Detection Logic

#### When Category Selected
```typescript
expenseTypeControl.valueChanges.subscribe((type) => {
  if (type) {
    // ... existing limit calculation ...
    
    // Check for previous month overspending
    this.checkPreviousMonthOverspending(type, monthlyLimit);
  }
});
```

#### Overspending Check
```typescript
private checkPreviousMonthOverspending(type: string, monthlyLimit: number): void {
  // Skip if already acknowledged this session
  if (this.acknowledgedWarnings.has(type)) {
    return;
  }

  const lastMonth = this.getPreviousMonth();
  const lastMonthEntries = this.expenseStore.entries().filter(
    e => e.date.startsWith(lastMonth) && e.type === type
  );

  if (lastMonthEntries.length === 0) {
    return; // No data for last month
  }

  const lastMonthSpent = lastMonthEntries.reduce((sum, e) => sum + e.amount, 0);
  const overspentAmount = lastMonthSpent - monthlyLimit;

  if (overspentAmount > 0) {
    // Show warning
    this.overspendWarningData.set({
      type,
      lastMonthSpent,
      lastMonthLimit: monthlyLimit,
      overspentAmount,
    });
    this.showOverspendWarning.set(true);
  }
}
```

### State Management

```typescript
// Warning visibility
readonly showOverspendWarning = signal(false);

// Warning data
readonly overspendWarningData = signal<{
  type: string;
  lastMonthSpent: number;
  lastMonthLimit: number;
  overspentAmount: number;
} | null>(null);

// Session-based acknowledgment tracking
private readonly acknowledgedWarnings = new Set<string>();
```

### Dismissal Logic

```typescript
dismissOverspendWarning(): void {
  const warning = this.overspendWarningData();
  if (warning) {
    // Mark as acknowledged for this session
    this.acknowledgedWarnings.add(warning.type);
  }
  this.showOverspendWarning.set(false);
  this.overspendWarningData.set(null);
}
```

## Example Scenarios

### Scenario 1: Gas Stove Purchase (Your Example)

**April (Last Month)**:
- Utilities Budget: ₹2,900/month
- Spent: ₹5,190 (gas stove + regular utilities)
- Overspent: ₹2,290

**May (Current Month)**:
```
User: Selects "Utilities" category
System: Shows warning
┌─────────────────────────────────────┐
│ ⚠️ Budget Alert: Utilities          │
│ You overspent on Utilities last     │
│ month by ₹2,290.                    │
│                                     │
│ Last Month: ₹5,190 • Limit: ₹2,900 │
│                                     │
│ 💡 Consider if this expense is      │
│    necessary to avoid overspending  │
│    again this month.                │
└─────────────────────────────────────┘

User: "Oh right, I bought that expensive stove last month.
       This is just a regular ₹200 electricity bill, I'll proceed."
       
User: Dismisses warning, logs ₹200 expense
```

### Scenario 2: Dining Out Habit

**April**:
- Dining Out Budget: ₹3,000/month
- Spent: ₹4,500 (multiple restaurant visits)
- Overspent: ₹1,500

**May**:
```
User: Selects "Dining Out"
System: Shows warning about ₹1,500 overspending

User: "I did eat out too much last month. Maybe I should
       cook at home tonight instead."
       
User: Changes category to "Food & Groceries" or cancels entry
```

### Scenario 3: One-Time vs Recurring

**April**:
- Entertainment Budget: ₹2,000/month
- Spent: ₹3,500 (bought concert tickets)
- Overspent: ₹1,500

**May**:
```
User: Selects "Entertainment"
System: Shows warning

User: "That was a one-time concert. This is just a ₹300
       movie ticket, which is within budget."
       
User: Dismisses warning, proceeds with expense
```

## Behavioral Psychology

### Nudge Theory
- **Gentle Reminder**: Not a hard block
- **Information**: Provides context for decision
- **Choice Architecture**: Presents info at decision point
- **Autonomy**: User retains final control

### Learning Mechanism
- **Pattern Recognition**: User sees spending patterns
- **Consequence Awareness**: Understands past overspending
- **Future Planning**: Encourages better decisions
- **Habit Formation**: Repeated nudges build awareness

### Effectiveness Factors
1. **Timing**: Shows at moment of decision
2. **Relevance**: Category-specific information
3. **Clarity**: Clear numbers and context
4. **Non-Punitive**: Helpful, not judgmental
5. **Actionable**: User can act on the information

## Edge Cases Handled

### 1. No Previous Month Data
```typescript
if (lastMonthEntries.length === 0) {
  return; // Skip warning
}
```
**Result**: No warning shown if no data available

### 2. Under Budget Last Month
```typescript
if (overspentAmount > 0) {
  // Show warning
}
```
**Result**: Only warns if actually overspent

### 3. Multiple Selections Same Session
```typescript
if (this.acknowledgedWarnings.has(type)) {
  return; // Skip if already acknowledged
}
```
**Result**: Won't annoy user with repeated warnings

### 4. Month Boundary
```typescript
const lastMonth = this.getPreviousMonth();
// Handles year boundary correctly
```
**Result**: Works across year boundaries (Dec → Jan)

### 5. New User (First Month)
- No previous month data exists
- No warning shown
- Natural onboarding experience

### 6. Category Change
- Warning updates when category changes
- Shows relevant warning for new category
- Previous acknowledgments persist

## Configuration

### Session-Based Acknowledgment
- Warnings reset when user closes/refreshes app
- Provides gentle recurring reminders
- Not persistent across sessions

### Future Enhancement: Persistent Acknowledgment
```typescript
// Could store in localStorage
localStorage.setItem('acknowledged_warnings_may_2026', JSON.stringify([...acknowledgedWarnings]));
```

## Performance Considerations

### Data Loading
- Previous month loaded once on init
- Cached in expense store
- No repeated API calls

### Calculation
- O(n) where n = entries in previous month
- Runs only when category selected
- Minimal performance impact

### Memory
- Small Set for acknowledged warnings
- Single warning data object
- Negligible memory footprint

## Accessibility

### Screen Readers
```html
<div role="alert" aria-live="assertive">
  ⚠️ Budget Alert: Utilities
  You overspent on Utilities last month by ₹2,290.
  ...
</div>
```

### Keyboard Navigation
- Dismiss button is keyboard accessible
- Tab navigation works
- Enter/Space to dismiss

### Visual
- High contrast orange/amber colors
- Clear icon (alert triangle)
- Readable font sizes
- Sufficient spacing

## Testing Checklist

### Functional Tests
- [ ] Warning shows when overspent category selected
- [ ] Warning shows correct amounts
- [ ] Warning dismisses when X clicked
- [ ] Warning doesn't show again same session
- [ ] Warning shows again in new session
- [ ] No warning for under-budget categories
- [ ] No warning when no previous month data

### UI Tests
- [ ] Warning is visually prominent
- [ ] Colors are appropriate (orange/amber)
- [ ] Icon displays correctly
- [ ] Text is readable
- [ ] Dismiss button works
- [ ] Responsive on mobile

### Edge Case Tests
- [ ] Month boundary (Dec → Jan)
- [ ] New user (no previous data)
- [ ] Multiple category selections
- [ ] Rapid category changes
- [ ] Very large overspend amounts
- [ ] Very small overspend amounts

### Integration Tests
- [ ] Works with grouped entries
- [ ] Works with backdated entries
- [ ] Works with edit mode
- [ ] Doesn't interfere with form submission
- [ ] Previous month data loads correctly

## User Benefits

| Benefit | Description |
|---------|-------------|
| **Awareness** | Reminds user of past overspending |
| **Learning** | Helps identify spending patterns |
| **Prevention** | Encourages better decisions |
| **Control** | User retains final decision |
| **Non-Intrusive** | Can be dismissed easily |

## Future Enhancements

### Priority: High
1. **Trend Analysis**: Show 3-month overspending trend
2. **Suggestions**: Offer alternative categories
3. **Goal Setting**: Set reduction goals for overspent categories

### Priority: Medium
4. **Persistent Acknowledgment**: Remember dismissals across sessions
5. **Customizable Threshold**: User sets when to show warnings
6. **Monthly Summary**: Email/notification of overspent categories

### Priority: Low
7. **Predictive Alerts**: Warn before overspending this month
8. **Comparison**: Compare to average users
9. **Gamification**: Badges for staying under budget

## Summary

The overspending alert feature provides intelligent, timely nudges to help users make better financial decisions based on their past spending patterns. The implementation is:

- ✅ **Smart**: Detects overspending automatically
- ✅ **Timely**: Shows at moment of decision
- ✅ **Informative**: Provides clear context
- ✅ **Respectful**: User retains control
- ✅ **Effective**: Encourages better habits
- ✅ **Non-Intrusive**: Can be dismissed
- ✅ **Session-Aware**: Doesn't repeat unnecessarily

---

**Feature**: Overspending Alert  
**Status**: ✅ **Complete**  
**Implementation Date**: May 9, 2026  
**Impact**: Behavioral Nudge, Financial Awareness
