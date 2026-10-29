import { hash, verify } from '@node-rs/argon2';

// OWASP recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane)
// algorithm 2 = Argon2id (const enum in @node-rs/argon2)
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/** Spend comparable time when the account does not exist (prevents user enumeration by timing). */
export async function fakeVerify(password: string) {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
  return false;
}
