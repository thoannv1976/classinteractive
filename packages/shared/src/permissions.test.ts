import { describe, expect, it } from 'vitest';
import { canAssignRole, canManageClass, canModerateClass, canViewClass } from './permissions';
import { deriveParticipation } from './metrics';
import { createActivitySchema, registerSchema } from './schemas';

const base = { uid: 'u1', lecturerIds: ['lec1'], memberRole: null } as const;

describe('class permissions', () => {
  it('student without membership cannot view', () => {
    expect(canViewClass({ ...base, role: 'student' })).toBe(false);
  });
  it('enrolled student can view but not manage', () => {
    const c = { ...base, role: 'student' as const, memberRole: 'student' as const };
    expect(canViewClass(c)).toBe(true);
    expect(canManageClass(c)).toBe(false);
    expect(canModerateClass(c)).toBe(false);
  });
  it('TA can moderate but not manage', () => {
    const c = { ...base, role: 'student' as const, memberRole: 'ta' as const };
    expect(canModerateClass(c)).toBe(true);
    expect(canManageClass(c)).toBe(false);
  });
  it('lecturer of another class has no access', () => {
    expect(canViewClass({ ...base, uid: 'lec2', role: 'lecturer' })).toBe(false);
  });
  it('assigned lecturer manages', () => {
    expect(canManageClass({ ...base, uid: 'lec1', role: 'lecturer' })).toBe(true);
  });
  it('admin manages all classes', () => {
    expect(canManageClass({ ...base, role: 'admin' })).toBe(true);
  });
  it('only superadmin grants admin', () => {
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'lecturer')).toBe(true);
    expect(canAssignRole('superadmin', 'admin')).toBe(true);
    expect(canAssignRole('lecturer', 'student')).toBe(false);
  });
});

describe('participation metrics', () => {
  it('rates use real opportunities and handle zero', () => {
    const r = deriveParticipation(
      { sessionsJoined: 3, questions: 2, answers: 1, comments: 0, reflections: 0, activitiesCompleted: 2, quizzesAnswered: 2, quizCorrect: 1 },
      { sessionsHeld: 4, activitiesOpened: 0 },
    );
    expect(r.attendanceRate).toBe(0.75);
    expect(r.activityCompletionRate).toBeNull();
    expect(r.quizAccuracy).toBe(0.5);
    expect(r.interactions).toBe(5);
  });
});

describe('schemas', () => {
  it('normalises student id to upper case', () => {
    expect(registerSchema.parse({ studentId: ' sv001 ', password: '123456' }).studentId).toBe('SV001');
  });
  it('quiz requires a correct option', () => {
    const r = createActivitySchema.safeParse({ type: 'quiz', title: 'Q', options: ['a', 'b'] });
    expect(r.success).toBe(false);
  });
});
