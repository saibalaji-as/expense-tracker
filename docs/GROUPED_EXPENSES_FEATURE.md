# Grouped Expenses Feature

## Overview

The expense tracking UI has been enhanced to automatically group multiple entries of the same expense type into a single consolidated entry in the list view. This provides a cleaner, more organized interface while maintaining full access to individual entry details through an enhanced detail popup.

## Key Features

### 1. **Automatic Grouping by Expense Type**
- Entries for the same expense category (e.g., "Food & Groceries", "Transportation") are automatically grouped together
- Groups are sorted by total amount spent (highest to lowest)
- Each group shows:
  - Category name and icon
  - Entry count badge (e.g., "3×") for multiple entries
  - Total amount spent across all entries
  - Daily limit for that category
  - Total savings (positive or negative)

### 2. **Smart List Display**
- **Single Entry**: Shows time, comment preview, and quick edit/delete buttons
- **Multiple Entries**: Shows entry count and "Tap to view details" message
- Visual indicators:
  - Color-coded left stripe matching category color
  - Count badge for grouped entries
  - Savings displayed in green (positive) or red (negative)

### 3. **Enhanced Detail Popup**

#### Single Entry View
When clicking on a category with only one entry:
- Full entry details (amount, limit, savings)
- Complete comment text (scrollable if long)
- Timestamp
- Edit and Delete buttons

#### Grouped Entries View
When clicking on a category with multiple entries:
- **Header Section**:
  - Category name with count badge
  - Aggregated totals (total amount, limit, total savings)
  
- **Individual Entries List** (scrollable):
  - Each entry shown in its own card
  - Amount and individual savings
  - Timestamp
  - Full comment text
  - Individual edit/delete buttons for each entry

### 4. **Updated Description**
The "Today's Entries" section now shows:
- Total number of entries logged
- Number of unique categories
- Example: "5 logged · 3 categories"

## User Benefits

1. **Cleaner Interface**: Reduces visual clutter when multiple expenses of the same type are logged
2. **Better Overview**: Quickly see which categories you're spending the most on
3. **Detailed Access**: Full access to individual entry details when needed
4. **Efficient Management**: Edit or delete individual entries from the grouped view
5. **Smart Sorting**: Categories with highest spending appear first

## Technical Implementation

### Data Structure
```typescript
interface GroupedEntry {
  type: string;              // Expense type name
  entries: ExpenseEntry[];   // Array of individual entries
  totalAmount: number;       // Sum of all amounts
  totalSavings: number;      // Sum of all savings
  count: number;             // Number of entries
  limit: number;             // Daily limit for this type
}
```

### Key Components

1. **`groupedEntries` Signal**: Computed signal that groups entries by type
2. **`viewingGroupedEntries` Signal**: Stores entries when viewing a group
3. **`isViewingGroup` Signal**: Indicates if viewing multiple entries
4. **`viewGroupDetail()` Method**: Handles clicking on grouped entries

### Sorting Logic
- Groups are sorted by `totalAmount` in descending order
- Within each group, entries are sorted by timestamp (most recent first)

## Usage Examples

### Scenario 1: Single Entry per Category
```
Food & Groceries          ₹250
  10:30 · Bought vegetables
  [Edit] [Delete]
```

### Scenario 2: Multiple Entries per Category
```
Food & Groceries  [3×]    ₹750
  3 entries · Tap to view details
```

When tapped, shows:
```
Food & Groceries [3×]
Total: ₹750 | Limit: ₹500 | Savings: -₹250

Individual Entries:
┌─────────────────────────┐
│ ₹300  -₹133             │
│ 14:30                   │
│ Comment: Dinner at cafe │
│ [Edit] [Delete]         │
└─────────────────────────┘
┌─────────────────────────┐
│ ₹250  -₹83              │
│ 10:30                   │
│ Comment: Groceries      │
│ [Edit] [Delete]         │
└─────────────────────────┘
┌─────────────────────────┐
│ ₹200  -₹33              │
│ 08:15                   │
│ [Edit] [Delete]         │
└─────────────────────────┘
```

## Edge Cases Handled

1. **Empty State**: Shows appropriate message when no entries exist
2. **Single Entry**: Automatically shows single-entry view (no grouping UI)
3. **Long Comments**: Scrollable content area in detail popup
4. **Negative Savings**: Displayed in red with proper formatting
5. **Date Navigation**: Grouping works correctly when viewing past dates

## Future Enhancements

Potential improvements for future iterations:

1. **Collapsible Groups**: Option to expand/collapse groups inline
2. **Group Actions**: Bulk edit or delete for all entries in a group
3. **Custom Grouping**: Allow grouping by time periods (morning/afternoon/evening)
4. **Statistics**: Show average per entry, min/max amounts within group
5. **Filtering**: Filter to show only specific categories
6. **Export**: Export grouped data for reporting

## Testing Checklist

- [ ] Single entry displays correctly with edit/delete buttons
- [ ] Multiple entries show count badge and grouped total
- [ ] Detail popup opens for both single and grouped entries
- [ ] Individual entries in group are sorted by time (newest first)
- [ ] Edit button populates form correctly
- [ ] Delete button removes entry and updates group
- [ ] Savings calculations are accurate (both individual and total)
- [ ] Long comments are scrollable in detail view
- [ ] Empty state shows appropriate message
- [ ] Date navigation maintains grouping behavior
- [ ] Touch devices show action buttons correctly
- [ ] Hover states work on desktop

## Accessibility

- Proper ARIA labels on all interactive elements
- Keyboard navigation support
- Screen reader friendly structure
- Sufficient color contrast for all text
- Touch targets meet minimum size requirements (44px)

## Performance Considerations

- Grouping is computed reactively using Angular signals
- No unnecessary re-renders
- Efficient sorting algorithms
- Minimal DOM manipulation
- Smooth animations and transitions

---

**Implementation Date**: May 9, 2026  
**Version**: 1.0  
**Status**: ✅ Complete
