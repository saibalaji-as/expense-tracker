"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLocalDateString = toLocalDateString;
exports.parseLocalDate = parseLocalDate;
exports.formatLocalTime = formatLocalTime;
// GENERATED from src/app/core/utils/local-date.ts by functions/scripts/sync-spenza-core.mjs — do not edit.
/* eslint-disable */
function toLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function parseLocalDate(value) {
    return new Date(`${value}T00:00:00`);
}
function formatLocalTime(value, locale) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}
//# sourceMappingURL=local-date.js.map