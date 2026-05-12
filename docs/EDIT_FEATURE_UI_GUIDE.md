# Edit Expense Feature - UI Guide

## Visual Changes

### Before Edit Feature
```
┌─────────────────────────────────────────────────────────┐
│ Today's Entries                                         │
│ 3 logged                                                │
├─────────────────────────────────────────────────────────┤
│ │🏠 Housing                          ₹5,000         🗑️ │
│ │   14:30 · Rent payment          lim ₹6,000          │
│ │                                   +₹1,000            │
└─────────────────────────────────────────────────────────┘
```

### After Edit Feature
```
┌─────────────────────────────────────────────────────────┐
│ Today's Entries                                         │
│ 3 logged                                                │
├─────────────────────────────────────────────────────────┤
│ │🏠 Housing                          ₹5,000      ✏️ 🗑️ │
│ │   14:30 · Rent payment          lim ₹6,000          │
│ │                                   +₹1,000            │
└─────────────────────────────────────────────────────────┘
```

## Edit Mode States

### 1. Normal Mode (Default)
```
┌─────────────────────────────────────────────────────────┐
│ Log Expense                                             │
│ Pick a type, enter the amount, and tap log.            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ EXPENSE TYPE                                            │
│ [🏠 Housing] [🍔 Food] [🚗 Transport] ...              │
│                                                         │
│ AMOUNT                                                  │
│ ₹ [_____]                                               │
│                                                         │
│ [➕ Log Housing]                                        │
└─────────────────────────────────────────────────────────┘
```

### 2. Edit Mode (After Clicking ✏️)
```
┌─────────────────────────────────────────────────────────┐
│ Log Expense                                             │
│ Pick a type, enter the amount, and tap log.            │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ✏️ Editing expense                              ✖️  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ EXPENSE TYPE                                            │
│ [🏠 Housing] [🍔 Food] [🚗 Transport] ...              │
│      ↑ (pre-selected)                                   │
│                                                         │
│ AMOUNT                                                  │
│ ₹ [5000]  ← (pre-filled)                                │
│                                                         │
│ [✏️ Update Housing]                                     │
└─────────────────────────────────────────────────────────┘
```

## Interaction Flow

### Edit Flow Diagram
```
┌──────────────┐
│ Expense List │
│              │
│ [Entry] ✏️ 🗑️│
└──────┬───────┘
       │ Click ✏️
       ↓
┌──────────────────┐
│ Edit Mode Banner │
│ ✏️ Editing... ✖️ │
└──────────────────┘
       │
       ↓
┌──────────────────┐
│ Form Populated   │
│ - Category set   │
│ - Amount filled  │
│ - Comment filled │
└──────┬───────────┘
       │
       ↓
┌──────────────────┐     ┌──────────────┐
│ User Modifies    │────→│ Click Cancel │
│ Values           │     │ (✖️ button)  │
└──────┬───────────┘     └──────┬───────┘
       │                        │
       │ Click Update           │ Form resets
       ↓                        ↓
┌──────────────────┐     ┌──────────────┐
│ Entry Updated    │     │ Normal Mode  │
│ Synced to Sheets │     │ Restored     │
└──────────────────┘     └──────────────┘
```

## Button States

### Submit Button Text
| Mode | Button Text | Icon |
|------|-------------|------|
| Normal (Create) | "Log [Category]" | ➕ Plus |
| Edit (Update) | "Update [Category]" | ✏️ Pencil |

### Action Buttons Visibility
| Device Type | Hover State | Visibility |
|-------------|-------------|------------|
| Desktop (pointer) | Not hovering | Hidden (opacity: 0) |
| Desktop (pointer) | Hovering | Visible (opacity: 100) |
| Mobile (touch) | N/A | Always visible |
| Keyboard focus | N/A | Always visible |

## Color Scheme

### Edit Mode Banner
- **Background**: `bg-primary/10` (primary color at 10% opacity)
- **Border**: `border-primary/40` (primary color at 40% opacity)
- **Text**: `text-primary` (full primary color)
- **Icon**: `text-primary` (full primary color)

### Edit Button
- **Default**: `text-muted-foreground`
- **Hover**: `bg-primary/10 text-primary`
- **Focus**: Ring with `ring-ring` color

### Delete Button
- **Default**: `text-muted-foreground`
- **Hover**: `bg-destructive/10 text-destructive`
- **Focus**: Ring with `ring-ring` color

## Responsive Behavior

### Mobile (< 768px)
```
┌─────────────────────────┐
│ Entry                   │
│ 🏠 Housing      ₹5,000  │
│ 14:30        lim ₹6,000 │
│                +₹1,000  │
│              ✏️ 🗑️      │
│ (always visible)        │
└─────────────────────────┘
```

### Tablet (768px - 1024px)
```
┌───────────────────────────────────────┐
│ Entry                                 │
│ 🏠 Housing              ₹5,000  ✏️ 🗑️ │
│ 14:30 · Comment      lim ₹6,000      │
│                        +₹1,000        │
│ (visible on hover)                    │
└───────────────────────────────────────┘
```

### Desktop (> 1024px)
```
┌─────────────────────────────────────────────────┐
│ Entry                                           │
│ 🏠 Housing                    ₹5,000      ✏️ 🗑️ │
│ 14:30 · Comment            lim ₹6,000          │
│                              +₹1,000            │
│ (visible on hover)                              │
└─────────────────────────────────────────────────┘
```

## Animation & Transitions

### Smooth Transitions
- Button hover states: `transition-all`
- Icon opacity changes: `[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100`
- Form scroll: `window.scrollTo({ top: 0, behavior: 'smooth' })`

### No Jarring Changes
- Edit banner slides in smoothly
- Form values populate instantly (no animation needed)
- Button text changes instantly (clear state change)

## Accessibility Features

### ARIA Labels
```html
<button aria-label="Edit entry">
  <lucide-icon name="pencil" />
</button>

<button aria-label="Delete entry">
  <lucide-icon name="trash-2" />
</button>

<button aria-label="Cancel editing">
  <lucide-icon name="x" />
</button>
```

### Keyboard Navigation
1. **Tab** - Navigate between buttons
2. **Enter/Space** - Activate button
3. **Escape** - (Future) Cancel edit mode
4. **Tab order**: Edit → Delete → Next entry

### Focus Indicators
- All buttons have `focus-visible:outline-none focus-visible:ring-2`
- Focus ring uses theme color: `focus-visible:ring-ring`
- Focus ring offset: `focus-visible:ring-offset-2`

## User Feedback

### Visual Feedback
1. **Edit Started**: Banner appears, form populates, scroll to top
2. **Edit In Progress**: Button text shows "Update"
3. **Edit Completed**: Entry updates in list, banner disappears
4. **Edit Cancelled**: Form resets, banner disappears

### Toast Notifications
```
┌─────────────────────────────────────────────────┐
│ ⚠️ Entry saved locally — will sync when online  │
└─────────────────────────────────────────────────┘
```
- Appears when offline
- Auto-dismisses after 4 seconds
- Yellow/warning color scheme

## Comparison: Create vs Edit

### Side-by-Side
```
CREATE MODE                    EDIT MODE
┌────────────────────┐        ┌────────────────────┐
│ Log Expense        │        │ Log Expense        │
│                    │        │ ┌────────────────┐ │
│                    │        │ │✏️ Editing... ✖️│ │
│                    │        │ └────────────────┘ │
│ [Category chips]   │        │ [Category chips]   │
│ (none selected)    │        │ (one selected)     │
│                    │        │                    │
│ ₹ [_____]          │        │ ₹ [5000]           │
│ (empty)            │        │ (filled)           │
│                    │        │                    │
│ [➕ Log Category]  │        │ [✏️ Update Cat.]   │
└────────────────────┘        └────────────────────┘
```

## Implementation Details

### Template Structure
```html
<app-section-card>
  <!-- Edit mode banner (conditional) -->
  @if (isEditMode()) {
    <div class="edit-banner">
      <lucide-icon name="pencil" />
      <span>Editing expense</span>
      <button (click)="cancelEdit()">
        <lucide-icon name="x" />
      </button>
    </div>
  }

  <!-- Form (same for create/edit) -->
  <form (ngSubmit)="onSubmit()">
    <!-- Category chips -->
    <!-- Amount input -->
    <!-- Comment input -->
    
    <!-- Submit button (dynamic text) -->
    <button type="submit">
      @if (isEditMode()) {
        <lucide-icon name="pencil" />
        Update {{ selectedCategoryDef().name }}
      } @else {
        <lucide-icon name="plus" />
        Log {{ selectedCategoryDef().name }}
      }
    </button>
  </form>
</app-section-card>
```

### State Management
```typescript
// Signals
readonly editingEntry = signal<ExpenseEntry | null>(null);
readonly isEditMode = computed(() => this.editingEntry() !== null);

// Methods
editEntry(entry: ExpenseEntry): void {
  this.editingEntry.set(entry);
  this.form.patchValue({ /* entry data */ });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

cancelEdit(): void {
  this.editingEntry.set(null);
  this.form.reset();
}
```

## Testing the UI

### Manual Test Steps
1. **Visual Check**
   - [ ] Edit icon appears next to delete icon
   - [ ] Icons have proper spacing
   - [ ] Icons are same size
   - [ ] Hover states work correctly

2. **Edit Flow**
   - [ ] Click edit icon
   - [ ] Banner appears at top
   - [ ] Form scrolls into view
   - [ ] Form is populated correctly
   - [ ] Button text changes to "Update"

3. **Cancel Flow**
   - [ ] Click X in banner
   - [ ] Banner disappears
   - [ ] Form resets to empty
   - [ ] Button text changes to "Log"

4. **Update Flow**
   - [ ] Modify values in form
   - [ ] Click Update button
   - [ ] Entry updates in list
   - [ ] Banner disappears
   - [ ] Form resets

5. **Responsive**
   - [ ] Test on mobile (icons always visible)
   - [ ] Test on tablet (icons on hover)
   - [ ] Test on desktop (icons on hover)
   - [ ] Test with keyboard (focus visible)

## Conclusion

The edit feature UI is:
- ✅ **Simple**: Reuses existing form
- ✅ **Clear**: Visual banner shows edit state
- ✅ **Intuitive**: Edit icon universally understood
- ✅ **Accessible**: Keyboard and screen reader friendly
- ✅ **Responsive**: Works on all devices
- ✅ **Consistent**: Matches existing design system

The implementation prioritizes user experience with smooth transitions, clear feedback, and a straightforward workflow.
