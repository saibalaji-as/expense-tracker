import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';

export async function requireFirebaseUid(req: Request): Promise<string> {
  const authorization = req.headers.authorization ?? '';
  const match = authorization.match(/^Bearer (.+)$/);
  if (!match) {
    throw new Error('Missing Firebase ID token');
  }

  const decoded = await admin.auth().verifyIdToken(match[1]);
  return decoded.uid;
}
