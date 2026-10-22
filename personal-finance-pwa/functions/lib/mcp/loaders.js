"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDriveBackup = loadDriveBackup;
exports.findFamily = findFamily;
exports.loadFamilyLedger = loadFamilyLedger;
exports.loadSpenzaData = loadSpenzaData;
exports.loadUserTimezone = loadUserTimezone;
exports.loadCircles = loadCircles;
/**
 * Read-only I/O. There is no write call to Drive in this module, and the only
 * Firestore reads are the user's own family ledger and circles, each behind
 * the same membership test as firestore.rules (the Admin SDK bypasses rules).
 */
const admin = __importStar(require("firebase-admin"));
const config_1 = require("./config");
const errors_1 = require("./errors");
const spenza_data_1 = require("./spenza-data");
const zoned_time_1 = require("./zoned-time");
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const BACKUP_NAME = 'spenza-backup.json';
/** Drive helper with GET only, by construction. */
async function driveGet(url, accessToken) {
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401 || res.status === 403) {
        throw new errors_1.McpToolError('DRIVE_ACCESS_REVOKED', 'Google Drive refused access. Reconnect Spenza in Claude.');
    }
    if (!res.ok)
        throw new errors_1.McpToolError('UPSTREAM_ERROR', `Google Drive returned ${res.status}. Try again in a minute.`);
    return res;
}
async function loadDriveBackup(accessToken) {
    const q = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
    const list = await driveGet(`${DRIVE_FILES}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&pageSize=5&fields=files(id,modifiedTime)`, accessToken);
    const files = (await list.json()).files ?? [];
    const newest = files[0];
    if (!newest) {
        throw new errors_1.McpToolError('NO_BACKUP', 'No Spenza backup found in your Google Drive. Open the Spenza app once so it can create it.');
    }
    const file = await driveGet(`${DRIVE_FILES}/${encodeURIComponent(newest.id)}?alt=media`, accessToken);
    let raw;
    try {
        raw = JSON.parse(await file.text());
    }
    catch {
        throw new errors_1.McpToolError('UPSTREAM_ERROR', 'Your Spenza backup could not be read.');
    }
    return (0, spenza_data_1.fromBackupDocument)(raw, newest.modifiedTime ?? null);
}
/** Same membership test as firestore.rules `isFamilyMember`; dissolved families are ignored. */
async function findFamily(uid) {
    const families = admin.firestore().collection('families');
    for (const [field, role] of [['ownerUid', 'owner'], ['partnerUid', 'partner']]) {
        const snap = await families.where(field, '==', uid).limit(5).get();
        const active = snap.docs.find((d) => d.data()['status'] !== 'dissolved');
        if (active)
            return { familyId: active.id, role };
    }
    return null;
}
async function loadFamilyLedger(family) {
    const snap = await admin.firestore().collection('families').doc(family.familyId).collection('ledger').get();
    return (0, spenza_data_1.fromLedgerRecords)(snap.docs.map((d) => d.data()), family);
}
const dataCache = new Map();
/** Family members read the shared ledger (fresher than any one member's Drive copy); everyone else reads Drive. */
async function loadSpenzaData(uid, getDriveToken) {
    const hit = dataCache.get(uid);
    if (hit && Date.now() - hit.at < config_1.TTL.dataCacheMs)
        return hit.data;
    const family = await findFamily(uid);
    const data = family ? await loadFamilyLedger(family) : await loadDriveBackup(await getDriveToken());
    if (dataCache.size >= 200)
        dataCache.delete(dataCache.keys().next().value);
    dataCache.set(uid, { data, at: Date.now() });
    return data;
}
async function loadUserTimezone(uid) {
    const snap = await admin.firestore().collection('users').doc(uid).get().catch(() => null);
    return (0, zoned_time_1.resolveTimezone)(snap?.data()?.['timezone'], config_1.DEFAULT_TIMEZONE);
}
/** Circles the user belongs to (rules: `request.auth.uid in memberUids`). */
async function loadCircles(uid, circleId) {
    const db = admin.firestore();
    let docs;
    if (circleId) {
        const doc = await db.collection('circles').doc(circleId).get();
        const members = (doc.data()?.['memberUids'] ?? []);
        if (!doc.exists || !members.includes(uid)) {
            throw new errors_1.McpToolError('NOT_A_MEMBER', 'Circle not found.');
        }
        docs = [doc];
    }
    else {
        docs = (await db.collection('circles').where('memberUids', 'array-contains', uid).get()).docs;
    }
    return Promise.all(docs.map(async (doc) => {
        const expenses = await doc.ref.collection('expenses').get();
        return {
            circle: { ...doc.data(), circleId: doc.id },
            expenses: expenses.docs
                .map((e) => ({ ...e.data(), expenseId: e.id }))
                .filter((e) => !e.deleted),
        };
    }));
}
//# sourceMappingURL=loaders.js.map