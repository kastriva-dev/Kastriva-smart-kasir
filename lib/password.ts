import {randomBytes, scrypt as scryptCallback, timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";

/**
 * Hash & verifikasi password admin dengan scrypt.
 * Modul ini memakai node:crypto, jadi HANYA boleh diimpor dari route handler
 * runtime Node — bukan dari middleware (Edge). Untuk middleware lihat lib/session.ts.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: {N: number; r: number; p: number; maxmem: number}
) => Promise<Buffer>;

const COST_N = 16384;
const BLOCK_R = 8;
const PARALLEL_P = 1;
const KEY_LENGTH = 32;
const MAX_MEM = 96 * 1024 * 1024;

function derive(password: string, salt: Buffer, keylen: number, N: number, r: number, p: number) {
  // NFKC agar password yang sama dari keyboard berbeda menghasilkan hash sama.
  return scrypt(password.normalize("NFKC"), salt, keylen, {N, r, p, maxmem: MAX_MEM});
}

/** Format: scrypt$N$r$p$saltBase64$hashBase64 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password minimal 8 karakter");
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, COST_N, BLOCK_R, PARALLEL_P);
  return [
    "scrypt",
    COST_N,
    BLOCK_R,
    PARALLEL_P,
    salt.toString("base64"),
    key.toString("base64")
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || !password || typeof stored !== "string") return false;

  const parts = stored.trim().split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Batas atas mencegah hash berbahaya (mis. hasil tempelan) memicu DoS memori/CPU.
  if (!Number.isInteger(N) || N < 1024 || N > 262144) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32) return false;
  if (!Number.isInteger(p) || p < 1 || p > 16) return false;
  if (128 * N * r * p > MAX_MEM) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length < 16 || expected.length > 64) return false;

  try {
    const actual = await derive(password, salt, expected.length, N, r, p);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Perbandingan username tanpa membocorkan panjang atau posisi karakter yang berbeda. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) {
    // Tetap lakukan satu perbandingan agar durasi tidak bergantung pada panjang.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
