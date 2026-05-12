# Testing Checklist - Edit & Delete Features

## ✅ Pre-Testing Setup

- [ ] Build completed successfully (`npm run build`)
- [ ] No TypeScript errors
- [ ] Development server running (`npm start`)
- [ ] Logged in to Google account
- [ ] Google Sheets configured
- [ ] Test data available

## 🧪 Delete Feature Tests

### Basic Delete Flow
- [ ] Delete button (🗑️) appears on expense entries
- [ ] Delete button visible on hover (desktop)
- [ ] Delete button always visible (mobile)
- [ ] Click delete shows confirmation dialog
- [ ] Confirmation dialog shows expense details
- [ ] Cancel confirmation keeps expense
- [ ] Confirm deletion removes expense from UI
- [ ] Deleted expense removed from Google Sheets

### Delete While Online
- [ ] Delete expense when online
- [ ] Verify immediate removal from UI
- [ ] Check Google Sheets - row deleted
- [ ] No error notifications
- [ ] Other entries unaffected

### Delete While Offline
- [ ] Disconnect internet
- [ ] Delete an expense
- [ ] Verify removal from UI
- [ ] Verify offline toast appears
- [ ] Reconnect internet
- [ ] Verify auto-sync occurs
- [ ] Check Google Sheets - row deleted

### Delete Edge Cases
- [ ] Delete first entry in list
- [ ] Delete last entry in list
- [ ] Delete middle entry in list
- [ ] Delete when only one entry exists
- [ ] Delete multiple entries in sequence
- [ ] Delete entry that was just created
- [ ] Try to delete non-existent entry (should handle gracefully)

## ✏️ Edit Feature Tests

### Basic Edit Flow
- [ ] Edit button (✏️) appears on expense entries
- [ ] Edit button visible on hover (desktop)
- [ ] Edit button always visible (mobile)
- [ ] Click edit shows edit banner
- [ ] Edit banner shows "Editing expense" text
- [ ] Edit banner has cancel (✖️) button
- [ ] Form scrolls into view
- [ ] Form populates with expense data
- [ ] Category chip pre-selected
- [ ] Amount field pre-filled
- [ ] Comment field pre-filled (if exists)
- [ ] Submit button text changes to "Update"

### Edit and Update
- [ ] Modify amount only
- [ ] Modify category only
- [ ] Modify comment only
- [ ] Modify all fields
- [ ] Click "Update" button
- [ ] Verify changes in UI
- [ ] Verify edit banner disappears
- [ ] Verify form resets
- [ ] Check Google Sheets - row updated

### Edit While Online
- [ ] Edit expense when online
- [ ] Verify immediate update in UI
- [ ] Check Google Sheets - row updated
- [ ] No error notifications
- [ ] Other entries unaffected

### Edit While Offline
- [ ] Disconnect internet
- [ ] Edit an expense
- [ ] Verify update in UI
- [ ] Verify offline toast appears
- [ ] Reconnect internet
- [ ] Verify auto-sync occurs
- [ ] Check Google Sheets - row updated

### Cancel Edit
- [ ] Click edit button
- [ ] Verify edit mode active
- [ ] Click cancel (✖️) button
- [ ] Verify edit banner disappears
- [ ] Verify form resets to empty
- [ ] Verify button text back to "Log"
- [ ] Verify no changes saved

### Edit Edge Cases
- [ ] Edit first entry in list
- [ ] Edit last entry in list
- [ ] Edit middle entry in list
- [ ] Edit entry that was just created
- [ ] Edit same entry twice in a row
- [ ] Edit entry, cancel, edit different entry
- [ ] Edit entry with no comment
- [ ] Edit entry with long comment
- [ ] Try to edit non-existent entry (should create new)

## 🔄 Combined Operations

### Edit Then Delete
- [ ] Edit an expense
- [ ] Update it
- [ ] Delete the same expense
- [ ] Verify both operations sync

### Delete Then Create Similar
- [ ] Delete an expense
- [ ] Create new expense with same data
- [ ] Verify both operations work

### Multiple Edits Offline
- [ ] Go offline
- [ ] Edit expense A
- [ ] Edit expense B
- [ ] Edit expense C
- [ ] Go online
- [ ] Verify all updates sync

### Mixed Operations Offline
- [ ] Go offline
- [ ] Create new expense
- [ ] Edit existing expense
- [ ] Delete another expense
- [ ] Go online
- [ ] Verify all operations sync in correct order

## 🎨 UI/UX Tests

### Visual Appearance
- [ ] Icons properly sized
- [ ] Icons properly spaced
- [ ] Icons same size (edit & delete)
- [ ] Edit banner styled correctly
- [ ] Edit banner has proper colors
- [ ] Button text changes correctly
- [ ] Toast notifications styled correctly

### Hover States
- [ ] Edit button hover effect works
- [ ] Delete button hover effect works
- [ ] Cancel button hover effect works
- [ ] Submit button hover effect works

### Responsive Design
- [ ] Test on mobile (< 768px)
- [ ] Test on tablet (768px - 1024px)
- [ ] Test on desktop (> 1024px)
- [ ] Icons visible on all screen sizes
- [ ] Edit banner responsive
- [ ] Form responsive

### Animations
- [ ] Smooth scroll to form on edit
- [ ] Smooth banner appearance
- [ ] Smooth button transitions
- [ ] No jarring movements

## ♿ Accessibility Tests

### Keyboard Navigation
- [ ] Tab to edit button
- [ ] Tab to delete button
- [ ] Tab to cancel button
- [ ] Enter/Space activates buttons
- [ ] Tab order logical
- [ ] Focus visible on all elements

### Screen Reader
- [ ] Edit button has aria-label
- [ ] Delete button has aria-label
- [ ] Cancel button has aria-label
- [ ] Edit banner announced
- [ ] Toast notifications announced

### Focus Management
- [ ] Focus rings visible
- [ ] Focus rings proper color
- [ ] Focus not lost during operations
- [ ] Focus returns after modal close

## 🌐 Network Tests

### Connection States
- [ ] Works when always online
- [ ] Works when always offline
- [ ] Works when connection drops mid-operation
- [ ] Works when connection restored
- [ ] Handles slow connection gracefully

### Sync Queue
- [ ] Queue length updates correctly
- [ ] Queue persists across page refresh
- [ ] Queue flushes on reconnect
- [ ] Queue handles errors gracefully
- [ ] Queue retries failed operations

## 🔐 Authentication Tests

### Token Handling
- [ ] Works with valid token
- [ ] Refreshes expired token
- [ ] Redirects on auth failure
- [ ] Preserves queue after re-auth

## 📊 Data Integrity Tests

### Google Sheets Sync
- [ ] Create syncs correctly
- [ ] Update syncs correctly
- [ ] Delete syncs correctly
- [ ] No duplicate entries created
- [ ] No data loss
- [ ] Timestamps updated correctly

### Local State
- [ ] Local state matches Google Sheets
- [ ] Computed values update correctly
- [ ] Budget calculations correct after edit
- [ ] Budget calculations correct after delete

## ⚠️ Error Handling Tests

### Network Errors
- [ ] Handles 404 errors
- [ ] Handles 500 errors
- [ ] Handles timeout errors
- [ ] Shows appropriate error messages

### Validation Errors
- [ ] Can't update with empty amount
- [ ] Can't update without category
- [ ] Shows validation messages

### Edge Cases
- [ ] Handles missing Google Sheet
- [ ] Handles invalid sheet ID
- [ ] Handles corrupted data
- [ ] Handles concurrent edits

## 🚀 Performance Tests

### Speed
- [ ] Edit response < 100ms
- [ ] Delete response < 100ms
- [ ] Sync completes in reasonable time
- [ ] No UI lag during operations

### Memory
- [ ] No memory leaks
- [ ] Queue doesn't grow unbounded
- [ ] Proper cleanup on component destroy

### Bundle Size
- [ ] Bundle size acceptable (< 350KB)
- [ ] No unnecessary dependencies
- [ ] Code splitting working

## 📱 Device Tests

### Browsers
- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Edge (desktop)
- [ ] Chrome (mobile)
- [ ] Safari (mobile)

### Operating Systems
- [ ] Windows
- [ ] macOS
- [ ] Linux
- [ ] iOS
- [ ] Android

## 🎯 User Acceptance Tests

### Real-World Scenarios
- [ ] Edit expense amount after checking receipt
- [ ] Delete duplicate entry
- [ ] Edit category after miscategorization
- [ ] Add comment to existing entry
- [ ] Fix typo in comment
- [ ] Delete test entries

### User Feedback
- [ ] Feature is intuitive
- [ ] No confusion about edit mode
- [ ] Cancel is easy to find
- [ ] Confirmation dialog clear
- [ ] Error messages helpful

## 📝 Documentation Tests

### Code Documentation
- [ ] All methods have comments
- [ ] Complex logic explained
- [ ] Type definitions clear

### User Documentation
- [ ] Quick start guide accurate
- [ ] FAQ answers common questions
- [ ] Troubleshooting helpful
- [ ] Screenshots/diagrams clear

## ✅ Final Checks

### Before Deployment
- [ ] All tests passing
- [ ] No console errors
- [ ] No console warnings
- [ ] Build successful
- [ ] Documentation complete
- [ ] Code reviewed
- [ ] Performance acceptable
- [ ] Accessibility compliant

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check user feedback
- [ ] Verify analytics
- [ ] Watch for edge cases

## 📊 Test Results Summary

| Category | Total Tests | Passed | Failed | Skipped |
|----------|-------------|--------|--------|---------|
| Delete Feature | 15 | - | - | - |
| Edit Feature | 25 | - | - | - |
| Combined Ops | 8 | - | - | - |
| UI/UX | 12 | - | - | - |
| Accessibility | 12 | - | - | - |
| Network | 10 | - | - | - |
| Auth | 4 | - | - | - |
| Data Integrity | 8 | - | - | - |
| Error Handling | 8 | - | - | - |
| Performance | 6 | - | - | - |
| Devices | 10 | - | - | - |
| UAT | 8 | - | - | - |
| **TOTAL** | **126** | **-** | **-** | **-** |

## 🐛 Issues Found

| # | Issue | Severity | Status | Notes |
|---|-------|----------|--------|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## 📋 Notes

- Test on real devices, not just emulators
- Test with real Google Sheets, not mocks
- Test with slow network (throttle in DevTools)
- Test with different data volumes
- Test with different user permissions

---

**Testing Date**: ___________
**Tester**: ___________
**Environment**: ___________
**Build Version**: ___________
