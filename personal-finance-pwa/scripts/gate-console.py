#!/usr/bin/env python3
"""Gate console.log and console.warn behind isDevMode() in Angular files."""

import re
import sys
import os

TARGET_FILES = [
    "src/app/core/services/ai-settings.service.ts",
    "src/app/core/services/auth.service.ts",
    "src/app/core/services/expense-store.service.ts",
    "src/app/core/services/fcm.service.ts",
    "src/app/core/services/google-sheets.service.ts",
    "src/app/core/services/i18n.service.ts",
    "src/app/core/services/local-notification.service.ts",
    "src/app/core/services/notification.service.ts",
    "src/app/core/services/receipt-extraction-session.service.ts",
    "src/app/core/services/spend-notification-access.service.ts",
    "src/app/core/services/sync.service.ts",
    "src/app/features/daily-expense/daily-expense.component.ts",
    "src/app/features/family-setup/family-setup.component.ts",
    "src/app/features/monthly-expense/monthly-expense.component.ts",
    "src/app/features/settings/settings.component.ts",
]


def add_is_dev_mode_import(content: str) -> str:
    """Add isDevMode to the @angular/core import block if not already present."""
    if "isDevMode" in content:
        return content

    # Match the entire @angular/core import (single or multi-line)
    pattern = r"(import\s*\{)([^}]*?)(\}\s*from\s*'@angular/core';)"

    def replacer(m: re.Match) -> str:
        open_brace = m.group(1)
        existing = m.group(2)
        close_part = m.group(3)

        # Determine how to append isDevMode
        stripped = existing.rstrip()
        if stripped.endswith(","):
            # Already has trailing comma: `..., ` → just append
            new_existing = existing.rstrip() + " isDevMode "
        else:
            # No trailing comma: add one
            new_existing = existing.rstrip() + ", isDevMode "
        return open_brace + new_existing + close_part

    new_content, n = re.subn(pattern, replacer, content, flags=re.DOTALL)
    if n == 0:
        print(f"  WARNING: could not find @angular/core import to patch", file=sys.stderr)
    return new_content


def wrap_single_line_calls(content: str) -> tuple[str, int]:
    """
    Wrap every single-line console.log(…); and console.warn(…);
    with if (isDevMode()) { … }.
    Lines that span multiple lines are intentionally skipped here
    (handled manually below).
    """
    pattern = r"console\.(log|warn)\(.*?\);"
    # No DOTALL → . won't cross newlines, so multi-line calls are skipped.

    count = [0]

    def replacer(m: re.Match) -> str:
        # Don't double-wrap anything already guarded
        count[0] += 1
        return f"if (isDevMode()) {{ {m.group(0)} }}"

    new_content = re.sub(pattern, replacer, content)
    return new_content, count[0]


def process_file(path: str) -> None:
    with open(path, "r", encoding="utf-8") as f:
        original = f.read()

    content = original

    # 1. Add isDevMode import if needed
    content = add_is_dev_mode_import(content)

    # 2. Wrap single-line calls
    content, n_wrapped = wrap_single_line_calls(content)

    if content == original:
        print(f"  (no changes)")
        return

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"  wrapped {n_wrapped} calls, import patched")


def main() -> None:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for rel in TARGET_FILES:
        path = os.path.join(base, rel)
        print(f"Processing {rel} …")
        process_file(path)
    print("\nDone.")


if __name__ == "__main__":
    main()
