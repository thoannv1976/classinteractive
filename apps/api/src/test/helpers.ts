import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-classinteract';
const FS = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

export async function resetEmulators() {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Exchanges a custom token for an ID token using the Auth emulator REST API. */
export async function idTokenFor(customToken: string) {
  const r = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const j = (await r.json()) as { idToken?: string; error?: unknown };
  if (!j.idToken) throw new Error('signInWithCustomToken failed: ' + JSON.stringify(j));
  return j.idToken;
}

export const rid = () => randomUUID().replace(/-/g, '');

export class Client {
  constructor(
    private app: FastifyInstance,
    public token: string | null = null,
  ) {}
  async req(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url: `/api/v1${url}`,
      payload: body as never,
      headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...headers },
    });
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, body: json, raw: res };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b: unknown = {}) => this.req('POST', u, b);
  patch = (u: string, b: unknown = {}) => this.req('PATCH', u, b);
  put = (u: string, b: unknown = {}) => this.req('PUT', u, b);
  del = (u: string) => this.req('DELETE', u);
}

export async function setup() {
  await resetEmulators();
  const app = await buildApp();
  await app.ready();
  const anon = new Client(app);
  const login = async (loginId: string, password: string) => {
    const r = await anon.post('/auth/login', { loginId, password });
    if (r.status !== 200) throw new Error(`login ${loginId} failed: ${JSON.stringify(r.body)}`);
    return new Client(app, await idTokenFor(r.body.token));
  };
  return { app, anon, login };
}
