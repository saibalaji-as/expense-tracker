# Spenza — OAuth Scope Justification

This document provides the justification text for each Google OAuth scope
used by Spenza, for submission to Google's OAuth verification form.

---

## `drive` scope

Spenza supports a Family Mode where two users (owner and partner) share a
single expense backup file stored in a Google Drive folder. The partner must
access a file shared by the owner — this requires the full `drive` scope
because `drive.file` only grants access to files created by the app itself,
not files shared by another user. Without `drive` scope, the family sync
feature cannot function.

---

## `drive.appdata` scope

Spenza stores its configuration file (`spenza-config.json`) and single-user
backup file (`spenza-backup.json`) in the Drive AppData folder — a private,
hidden folder only accessible by Spenza. No user files are read or modified.
This scope is used exclusively for Spenza's own backup data.

---

## `spreadsheets` scope

Spenza provides a one-time import feature that allows users to migrate their
existing expense data from a Google Sheets spreadsheet into Spenza's
Drive-backed storage. This is a user-initiated action in Settings and is not
used for ongoing data access.

---

## What Spenza Does NOT Do
- Does not read any user files outside the Spenza Family folder
- Does not modify any user files outside Spenza backup files
- Does not share any Drive data with third parties
- Does not access Drive continuously — only on user action or the 30-second
  background poll for family sync changes
