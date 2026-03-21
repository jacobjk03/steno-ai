import bcrypt from 'bcryptjs';

const PREFIX = 'sk_steno_';
const KEY_LENGTH = 48; // total length including prefix
const PREFIX_DISPLAY_LENGTH = 12;
const BCRYPT_ROUNDS = 10;

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  (globalThis as unknown as { crypto: { getRandomValues: (buf: Uint8Array) => void } }).crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

export function generateApiKey(): { key: string; prefix: string } {
  const randomPart = generateRandomString(KEY_LENGTH - PREFIX.length);
  const key = `${PREFIX}${randomPart}`;
  const prefix = key.slice(0, PREFIX_DISPLAY_LENGTH);
  return { key, prefix };
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

export function extractPrefix(key: string): string {
  return key.slice(0, PREFIX_DISPLAY_LENGTH);
}
