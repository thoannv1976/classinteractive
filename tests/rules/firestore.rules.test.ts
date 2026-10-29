import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const rulesPath = fileURLToPath(new URL('../../firebase/firestore.rules', import.meta.url));

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const user = (uid: string, role: string, status = 'active') => setDoc(doc(db, 'users', uid), { uid, role, status, displayName: uid });
    await user('stu1', 'student');
    await user('stu2', 'student');
    await user('outsider', 'student');
    await user('banned', 'student', 'disabled');
    await user('lec1', 'lecturer');
    await user('lec2', 'lecturer');
    await user('adm', 'admin');
    await setDoc(doc(db, 'classes/c1'), { classId: 'c1', lecturerIds: ['lec1'], status: 'active' });
    await setDoc(doc(db, 'classes/c1/members/stu1'), { uid: 'stu1', role: 'student', status: 'active' });
    await setDoc(doc(db, 'classes/c1/members/stu2'), { uid: 'stu2', role: 'ta', status: 'active' });
    await setDoc(doc(db, 'classes/c1/members/banned'), { uid: 'banned', role: 'student', status: 'active' });
    await setDoc(doc(db, 'classes/c1/stats/summary'), { questionCount: 1 });
    await setDoc(doc(db, 'classes/c1/studentMetrics/stu1'), { uid: 'stu1', questions: 1 });
    await setDoc(doc(db, 'classes/c1/sessions/s1'), { sessionId: 's1', status: 'open' });
    await setDoc(doc(db, 'classes/c1/sessions/s1/posts/p1'), { postId: 'p1', moderationStatus: 'visible', isRoot: true });
    await setDoc(doc(db, 'classes/c1/sessions/s1/posts/p2'), { postId: 'p2', moderationStatus: 'hidden', isRoot: true });
    await setDoc(doc(db, 'classes/c1/sessions/s1/posts/p1/postAuthor/author'), { authorUid: 'stu1' });
    await setDoc(doc(db, 'classes/c1/sessions/s1/activities/a1'), { status: 'open', showResults: false });
    await setDoc(doc(db, 'classes/c1/sessions/s1/activities/a2'), { status: 'draft', showResults: true });
    await setDoc(doc(db, 'classes/c1/sessions/s1/activities/a1/results/summary'), { submissionCount: 1 });
    await setDoc(doc(db, 'classes/c1/sessions/s1/activities/a1/private/key'), { correctOptionIds: ['o1'] });
    await setDoc(doc(db, 'classes/c1/sessions/s1/activities/a1/submissions/stu1'), { uid: 'stu1' });
    await setDoc(doc(db, 'credentials/stu1'), { passwordHash: 'x' });
    await setDoc(doc(db, 'auditLogs/l1'), { action: 'x' });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('Firestore rules', () => {
  it('denies all client writes, including role/status changes and metrics', async () => {
    await assertFails(updateDoc(doc(as('stu1'), 'users/stu1'), { role: 'admin' }));
    await assertFails(setDoc(doc(as('stu1'), 'classes/c1/studentMetrics/stu1'), { questions: 999 }));
    await assertFails(setDoc(doc(as('lec1'), 'classes/c1/sessions/s1/posts/x'), { content: 'x' }));
    await assertFails(setDoc(doc(as('adm'), 'classes/c2'), { lecturerIds: [] }));
  });

  it('never exposes credentials, author identity or quiz keys', async () => {
    await assertFails(getDoc(doc(as('stu1'), 'credentials/stu1')));
    await assertFails(getDoc(doc(as('adm'), 'credentials/stu1')));
    await assertFails(getDoc(doc(as('lec1'), 'classes/c1/sessions/s1/posts/p1/postAuthor/author')));
    await assertFails(getDoc(doc(as('stu1'), 'classes/c1/sessions/s1/activities/a1/private/key')));
  });

  it('class data is visible to members, its lecturers and admins only', async () => {
    await assertSucceeds(getDoc(doc(as('stu1'), 'classes/c1')));
    await assertSucceeds(getDoc(doc(as('lec1'), 'classes/c1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'classes/c1')));
    await assertFails(getDoc(doc(as('outsider'), 'classes/c1')));
    await assertFails(getDoc(doc(as('lec2'), 'classes/c1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classes/c1')));
  });

  it('disabled accounts lose access immediately', async () => {
    await assertFails(getDoc(doc(as('banned'), 'classes/c1')));
    await assertSucceeds(getDoc(doc(as('banned'), 'users/banned')));
  });

  it('students see only visible posts and must filter by visibility', async () => {
    const db = as('stu1');
    await assertSucceeds(getDoc(doc(db, 'classes/c1/sessions/s1/posts/p1')));
    await assertFails(getDoc(doc(db, 'classes/c1/sessions/s1/posts/p2')));
    await assertFails(getDocs(collection(db, 'classes/c1/sessions/s1/posts')));
    await assertSucceeds(getDocs(query(collection(db, 'classes/c1/sessions/s1/posts'), where('moderationStatus', '==', 'visible'))));
    await assertSucceeds(getDocs(collection(as('lec1'), 'classes/c1/sessions/s1/posts')));
    await assertSucceeds(getDoc(doc(as('stu2'), 'classes/c1/sessions/s1/posts/p2'))); // TA moderates
  });

  it('per-student data: own only for students, all for staff', async () => {
    await assertSucceeds(getDoc(doc(as('stu1'), 'classes/c1/studentMetrics/stu1')));
    await assertFails(getDoc(doc(as('outsider'), 'classes/c1/studentMetrics/stu1')));
    await assertSucceeds(getDoc(doc(as('lec1'), 'classes/c1/studentMetrics/stu1')));
    await assertFails(getDoc(doc(as('stu1'), 'classes/c1/stats/summary')));
    await assertFails(getDoc(doc(as('stu1'), 'classes/c1/members/stu2')));
    await assertSucceeds(getDoc(doc(as('stu1'), 'classes/c1/members/stu1')));
  });

  it('activities: drafts and hidden results are staff-only; submissions private', async () => {
    await assertSucceeds(getDoc(doc(as('stu1'), 'classes/c1/sessions/s1/activities/a1')));
    await assertFails(getDoc(doc(as('stu1'), 'classes/c1/sessions/s1/activities/a2')));
    await assertFails(getDoc(doc(as('stu1'), 'classes/c1/sessions/s1/activities/a1/results/summary')));
    await assertSucceeds(getDoc(doc(as('lec1'), 'classes/c1/sessions/s1/activities/a1/results/summary')));
    await assertSucceeds(getDoc(doc(as('stu1'), 'classes/c1/sessions/s1/activities/a1/submissions/stu1')));
    await assertFails(getDocs(collection(as('stu1'), 'classes/c1/sessions/s1/activities/a1/submissions')));
  });

  it('audit logs are admin-only', async () => {
    await assertSucceeds(getDoc(doc(as('adm'), 'auditLogs/l1')));
    await assertFails(getDoc(doc(as('lec1'), 'auditLogs/l1')));
  });
});
