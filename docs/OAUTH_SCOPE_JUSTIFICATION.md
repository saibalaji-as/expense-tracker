# Spenza — OAuth Scope Justification

This document provides the justification text for each Google OAuth scope
used by Spenza, for submission to Google's OAuth verification form.

---

## `drive` scope — REMOVED

The `drive` scope was previously required for family mode's shared Google Drive
folder. Family sync has been redesigned to use Firestore instead of a shared
Drive file. Each user now stores data only in their own private Drive AppData
folder. The `drive` scope is no longer requested.

---

## `drive.appdata` scope

Spenza stores its configuration file (`spenza-config.json`) and expense backup
file (`spenza-backup.json`) in the Drive AppData folder — a private, hidden
folder only accessible by Spenza. No user files are read or modified.

This scope is used by **all users** (both single and family mode). Family sync
now uses Firestore for real-time activity deltas; the shared Google Drive folder
approach was removed in v8. The `drive.appdata` scope remains the sole Drive
permission needed for backup and config storage regardless of family status.

---

## `spreadsheets` scope

Spenza provides a one-time import feature that allows users to migrate their
existing expense data from a Google Sheets spreadsheet into Spenza's
Drive-backed storage. This is a user-initiated action in Settings and is not
used for ongoing data access.

---

## What Spenza Does NOT Do
- Does not read any user files outside the Drive AppData folder
- Does not modify any user files outside Spenza backup/config files
- Does not share any Drive data with third parties
- Does not access Drive continuously — only on user action or the 30-second
  background poll for changed backup data
