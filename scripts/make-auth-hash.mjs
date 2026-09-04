#!/usr/bin/env node
/**
 * Membuat hash password admin untuk ADMIN_PASSWORD_HASH, dan (opsional) AUTH_SECRET.
 *
 * Pemakaian:
 *   npm run auth:hash -- 'password-anda'
 *   npm run auth:hash                      # password dibaca dari stdin, tidak masuk shell history
 *   npm run auth:hash -- --secret          # cetak AUTH_SECRET acak saja
 */
import {randomBytes} from "node:crypto";
import {createInterface} from "node:readline";
import {hashPassword} from "../lib/password.ts";

function newSecret() {
  return randomBytes(48).toString("base64url");
}

async function readFromStdin() {
  if (process.stdin.isTTY) {
    process.stderr.write("Password baru (akan terlihat saat diketik): ");
  }
  const rl = createInterface({input: process.stdin});
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return "";
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--secret")) {
    process.stdout.write(`AUTH_SECRET=${newSecret()}\n`);
    return;
  }

  const password = args.find(a => !a.startsWith("--")) ?? (await readFromStdin());
  if (!password || password.trim().length < 8) {
    process.stderr.write("Password minimal 8 karakter.\n");
    process.exitCode = 1;
    return;
  }

  const hash = await hashPassword(password.trim());
  process.stdout.write("\nTambahkan ke environment server (.env.local / Vercel):\n\n");
  process.stdout.write(`ADMIN_PASSWORD_HASH=${hash}\n`);
  if (!process.env.AUTH_SECRET) {
    process.stdout.write(`AUTH_SECRET=${newSecret()}\n`);
  }
  process.stdout.write("\nJangan commit nilai di atas ke git.\n");
}

main().catch(err => {
  process.stderr.write(`Gagal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
