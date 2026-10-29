import { db } from '../firebase';

/** Central place for Firestore locations (see docs/DATABASE.md). */
export const C = {
  users: () => db.collection('users'),
  user: (uid: string) => db.collection('users').doc(uid),
  notifications: (uid: string) => db.collection('users').doc(uid).collection('notifications'),
  credentials: (uid: string) => db.collection('credentials').doc(uid),
  userLogins: () => db.collection('userLogins'),
  studentDirectory: () => db.collection('studentDirectory'),
  courses: () => db.collection('courses'),
  classes: () => db.collection('classes'),
  class: (classId: string) => db.collection('classes').doc(classId),
  members: (classId: string) => db.collection('classes').doc(classId).collection('members'),
  enrollmentRequests: (classId: string) => db.collection('classes').doc(classId).collection('enrollmentRequests'),
  classStats: (classId: string) => db.collection('classes').doc(classId).collection('stats').doc('summary'),
  studentMetrics: (classId: string) => db.collection('classes').doc(classId).collection('studentMetrics'),
  studentSessionMetrics: (classId: string) =>
    db.collection('classes').doc(classId).collection('studentSessionMetrics'),
  sessions: (classId: string) => db.collection('classes').doc(classId).collection('sessions'),
  session: (classId: string, sessionId: string) =>
    db.collection('classes').doc(classId).collection('sessions').doc(sessionId),
  sessionStats: (classId: string, sessionId: string) =>
    db.collection('classes').doc(classId).collection('sessions').doc(sessionId).collection('stats').doc('summary'),
  attendance: (classId: string, sessionId: string) =>
    db.collection('classes').doc(classId).collection('sessions').doc(sessionId).collection('attendance'),
  posts: (classId: string, sessionId: string) =>
    db.collection('classes').doc(classId).collection('sessions').doc(sessionId).collection('posts'),
  postAuthor: (classId: string, sessionId: string, postId: string) =>
    db
      .collection('classes')
      .doc(classId)
      .collection('sessions')
      .doc(sessionId)
      .collection('posts')
      .doc(postId)
      .collection('postAuthor')
      .doc('author'),
  reactions: (classId: string, sessionId: string, postId: string) =>
    db
      .collection('classes')
      .doc(classId)
      .collection('sessions')
      .doc(sessionId)
      .collection('posts')
      .doc(postId)
      .collection('reactions'),
  activities: (classId: string, sessionId: string) =>
    db.collection('classes').doc(classId).collection('sessions').doc(sessionId).collection('activities'),
  activityKey: (classId: string, sessionId: string, activityId: string) =>
    db
      .collection('classes')
      .doc(classId)
      .collection('sessions')
      .doc(sessionId)
      .collection('activities')
      .doc(activityId)
      .collection('private')
      .doc('key'),
  activityResults: (classId: string, sessionId: string, activityId: string) =>
    db
      .collection('classes')
      .doc(classId)
      .collection('sessions')
      .doc(sessionId)
      .collection('activities')
      .doc(activityId)
      .collection('results')
      .doc('summary'),
  submissions: (classId: string, sessionId: string, activityId: string) =>
    db
      .collection('classes')
      .doc(classId)
      .collection('sessions')
      .doc(sessionId)
      .collection('activities')
      .doc(activityId)
      .collection('submissions'),
  grading: (classId: string, sessionId: string, activityId: string) =>
    db
      .collection('classes')
      .doc(classId)
      .collection('sessions')
      .doc(sessionId)
      .collection('activities')
      .doc(activityId)
      .collection('grading'),
  joinCodes: () => db.collection('joinCodes'),
  aiRuns: () => db.collection('aiRuns'),
  aiUsage: () => db.collection('aiUsage'),
  auditLogs: () => db.collection('auditLogs'),
  settings: (name: string) => db.collection('systemSettings').doc(name),
};
