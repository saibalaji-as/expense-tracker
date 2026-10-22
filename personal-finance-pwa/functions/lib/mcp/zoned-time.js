"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTimezone = resolveTimezone;
exports.zonedNow = zonedNow;
/**
 * The shared date utils use the process's local calendar (`getFullYear()`,
 * `new Date(y, m, d)`). Cloud Functions run in UTC, so "today" would be wrong for
 * a user in India between 00:00 and 05:30. Instead of mutating process.env.TZ
 * (global, unsafe with concurrent requests) we hand the utils a Date whose LOCAL
 * fields equal the user's wall clock. All shared maths is date-only, so this is exact.
 */
function resolveTimezone(tz, fallback) {
    if (typeof tz !== 'string' || tz.trim() === '')
        return fallback;
    try {
        Intl.DateTimeFormat('en-US', { timeZone: tz });
        return tz;
    }
    catch {
        return fallback;
    }
}
function zonedNow(timeZone, nowMs = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(new Date(nowMs));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}
//# sourceMappingURL=zoned-time.js.map