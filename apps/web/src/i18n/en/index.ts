import admin from './admin';
import core from './core';
import lecturer from './lecturer';
import p2insights from './p2insights';
import p2scores from './p2scores';
import p2session from './p2session';
import p2topics from './p2topics';
import student from './student';

/** All English UI strings, keyed by the Vietnamese source text. */
export const EN_DICTIONARY: Record<string, string> = { ...core, ...student, ...lecturer, ...admin, ...p2topics, ...p2session, ...p2scores, ...p2insights };
