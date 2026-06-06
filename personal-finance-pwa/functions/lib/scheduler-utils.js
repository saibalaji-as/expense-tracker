"use strict";
/**
 * Pure utility functions for the time-based reminder scheduler.
 * No side effects, no I/O — safe to unit-test and property-test in isolation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTimezone = resolveTimezone;
exports.getLocalReminderTime = getLocalReminderTime;
exports.getReminderSlot = getReminderSlot;
exports.getDailyReminderSlot = getDailyReminderSlot;
exports.shouldSendReminder = shouldSendReminder;
function resolveTimezone(tz) {
    if (typeof tz !== 'string' || tz.trim() === '') {
        return 'UTC';
    }
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return tz;
    }
    catch {
        return 'UTC';
    }
}
function getLocalReminderTime(utcNow, timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(utcNow).map((part) => [part.type, part.value]));
    return {
        year: parts['year'],
        month: parts['month'],
        day: parts['day'],
        hour: parseInt(parts['hour'], 10) % 24,
        minute: parseInt(parts['minute'], 10),
    };
}
function getReminderSlot(utcNow, timezone) {
    const local = getLocalReminderTime(utcNow, timezone);
    if (local.minute !== 0)
        return null;
    if (local.hour < 8 || local.hour > 22)
        return null;
    return `${local.year}-${local.month}-${local.day}T${local.hour.toString().padStart(2, '0')}:00`;
}
function getDailyReminderSlot(utcNow, timezone, reminderHour, reminderMinute) {
    if (typeof reminderHour !== 'number' || typeof reminderMinute !== 'number') {
        return null;
    }
    if (!Number.isInteger(reminderHour) || !Number.isInteger(reminderMinute)) {
        return null;
    }
    if (reminderHour < 0 || reminderHour > 23 || reminderMinute < 0 || reminderMinute > 59) {
        return null;
    }
    const local = getLocalReminderTime(utcNow, timezone);
    if (local.hour !== reminderHour || local.minute !== reminderMinute) {
        return null;
    }
    return `${local.year}-${local.month}-${local.day}T${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}`;
}
function shouldSendReminder(utcNow, timezone) {
    return getReminderSlot(utcNow, timezone) !== null;
}
//# sourceMappingURL=scheduler-utils.js.map