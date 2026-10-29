import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { config } from './config';

const app = getApps()[0] ?? initializeApp({ projectId: config.projectId });

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth(app);
export { FieldValue, Timestamp };
export const now = () => FieldValue.serverTimestamp();
export const inc = (n = 1) => FieldValue.increment(n);
