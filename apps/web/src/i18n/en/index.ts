import admin from './admin';
import core from './core';
import lecturer from './lecturer';
import student from './student';

/** All English UI strings, keyed by the Vietnamese source text. */
export const EN_DICTIONARY: Record<string, string> = { ...core, ...student, ...lecturer, ...admin };
