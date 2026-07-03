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
exports.redeemFamilyInvite = exports.leaveFamily = exports.dissolveFamily = exports.createFamilyInvite = exports.createFamily = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
const auth_1 = require("./auth");
const CORS_ORIGINS = [
    'https://spenza.site',
    'http://localhost:4200',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
];
async function requireFamilyAuth(req) {
    const authorization = req.headers.authorization ?? '';
    const match = authorization.match(/^Bearer (.+)$/);
    if (!match)
        throw new Error('Missing Firebase ID token');
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (!decoded.email)
        throw new Error('Authenticated user has no email');
    return { uid: decoded.uid, email: decoded.email };
}
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
exports.createFamily = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const { uid: ownerUid, email: ownerEmail } = await requireFamilyAuth(req);
        // Family/Shared mode is a Pro-only feature in the client UI (mode-selection
        // and family-setup both gate the owner flow behind isPro()) — enforce it
        // here too, since a signed-in free user could otherwise call this endpoint
        // directly and become a family owner without paying. Partner-side join
        // (redeemFamilyInvite) intentionally stays ungated: partners are free-tier
        // by design.
        try {
            await (0, auth_1.requireProTier)(ownerUid);
        }
        catch {
            res.status(403).json({ error: 'Pro subscription required to create a family.' });
            return;
        }
        // Idempotent: return existing active family if already created
        const existing = await admin.firestore()
            .collection('families')
            .where('ownerUid', '==', ownerUid)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (!existing.empty) {
            res.json({ familyId: existing.docs[0].id });
            return;
        }
        const now = new Date().toISOString();
        const ref = admin.firestore().collection('families').doc();
        await ref.set({
            familyId: ref.id,
            ownerUid,
            ownerEmail,
            partnerUid: null,
            partnerEmail: null,
            createdAt: now,
            updatedAt: now,
            status: 'active',
        });
        res.json({ familyId: ref.id });
    }
    catch (err) {
        console.warn('createFamily failed:', err);
        res.status(401).json({ error: 'Unauthorized' });
    }
});
exports.createFamilyInvite = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const familyId = typeof req.body?.familyId === 'string' ? req.body.familyId.trim() : '';
    if (!familyId) {
        res.status(400).json({ error: 'familyId is required' });
        return;
    }
    try {
        const { uid: callerUid, email: ownerEmail } = await requireFamilyAuth(req);
        const familySnap = await admin.firestore().collection('families').doc(familyId).get();
        if (!familySnap.exists) {
            res.status(404).json({ error: 'Family not found' });
            return;
        }
        const family = familySnap.data();
        if (family['ownerUid'] !== callerUid) {
            res.status(403).json({ error: 'Only the family owner can create an invite' });
            return;
        }
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const inviteCode = generateInviteCode();
        await admin.firestore().collection('familyInvites').doc(inviteCode).set({
            inviteCode,
            familyId,
            ownerUid: callerUid,
            ownerEmail,
            expiresAt,
            redeemedAt: null,
            redeemedByUid: null,
        });
        res.json({ inviteCode, expiresAt });
    }
    catch (err) {
        console.warn('createFamilyInvite failed:', err);
        res.status(401).json({ error: 'Unauthorized' });
    }
});
exports.dissolveFamily = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const familyId = typeof req.body?.familyId === 'string' ? req.body.familyId.trim() : '';
    if (!familyId) {
        res.status(400).json({ error: 'familyId is required' });
        return;
    }
    try {
        const { uid: callerUid } = await requireFamilyAuth(req);
        const familyRef = admin.firestore().collection('families').doc(familyId);
        const familySnap = await familyRef.get();
        if (!familySnap.exists) {
            res.status(404).json({ error: 'Family not found' });
            return;
        }
        const family = familySnap.data();
        if (family['ownerUid'] !== callerUid) {
            res.status(403).json({ error: 'Only the family owner can dissolve the family' });
            return;
        }
        await familyRef.update({ status: 'dissolved', updatedAt: new Date().toISOString() });
        res.json({ success: true });
    }
    catch (err) {
        console.warn('dissolveFamily failed:', err);
        res.status(401).json({ error: 'Unauthorized' });
    }
});
exports.leaveFamily = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const familyId = typeof req.body?.familyId === 'string' ? req.body.familyId.trim() : '';
    if (!familyId) {
        res.status(400).json({ error: 'familyId is required' });
        return;
    }
    try {
        const { uid: callerUid } = await requireFamilyAuth(req);
        const familyRef = admin.firestore().collection('families').doc(familyId);
        const familySnap = await familyRef.get();
        if (!familySnap.exists) {
            res.status(404).json({ error: 'Family not found' });
            return;
        }
        const family = familySnap.data();
        if (family['partnerUid'] !== callerUid) {
            res.status(403).json({ error: 'Only the current partner can leave the family' });
            return;
        }
        await familyRef.update({ partnerUid: null, partnerEmail: null, updatedAt: new Date().toISOString() });
        res.json({ success: true });
    }
    catch (err) {
        console.warn('leaveFamily failed:', err);
        res.status(401).json({ error: 'Unauthorized' });
    }
});
exports.redeemFamilyInvite = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim() : '';
    if (!inviteCode) {
        res.status(400).json({ error: 'inviteCode is required' });
        return;
    }
    try {
        const { uid: partnerUid, email: partnerEmail } = await requireFamilyAuth(req);
        const inviteRef = admin.firestore().collection('familyInvites').doc(inviteCode);
        const familyId = await admin.firestore().runTransaction(async (transaction) => {
            const inviteSnap = await transaction.get(inviteRef);
            if (!inviteSnap.exists)
                throw new Error('Invite not found');
            const invite = inviteSnap.data();
            if (invite['redeemedAt'] !== null) {
                // Idempotent: same partner retrying after a client crash — let them recover local state.
                if (invite['redeemedByUid'] === partnerUid) {
                    return invite['familyId'];
                }
                throw new Error('Invite already redeemed');
            }
            if (new Date(invite['expiresAt']).getTime() <= Date.now()) {
                throw new Error('Invite expired');
            }
            if (invite['ownerUid'] === partnerUid) {
                throw new Error('Owner cannot redeem their own invite');
            }
            const familyRef = admin.firestore().collection('families').doc(invite['familyId']);
            const familySnap = await transaction.get(familyRef);
            if (!familySnap.exists)
                throw new Error('Family not found');
            const now = new Date().toISOString();
            transaction.update(inviteRef, { redeemedAt: now, redeemedByUid: partnerUid });
            transaction.update(familyRef, { partnerUid, partnerEmail, updatedAt: now });
            return invite['familyId'];
        });
        res.json({ familyId });
    }
    catch (err) {
        console.warn('redeemFamilyInvite failed:', err);
        const message = err instanceof Error ? err.message : '';
        if (message.includes('already redeemed')) {
            res.status(409).json({ error: message });
        }
        else if (message.includes('Invite not found') ||
            message.includes('Invite expired') ||
            message.includes('Owner cannot redeem') ||
            message.includes('Family not found')) {
            res.status(404).json({ error: message });
        }
        else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }
});
//# sourceMappingURL=family.js.map