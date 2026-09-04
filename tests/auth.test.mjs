/** Tes untuk lapisan autentikasi: hash password, token session, dan proteksi redirect. */
import assert from "node:assert/strict";
import test from "node:test";

const SECRET = "a".repeat(48);
process.env.AUTH_SECRET = SECRET;
process.env.ADMIN_PASSWORD_HASH = "placeholder-diisi-per-test";

const {hashPassword, verifyPassword, safeCompare} = await import("../lib/password.ts");
const {
  SESSION_COOKIE,
  getSessionTtlSeconds,
  isAuthConfigured,
  isSameOrigin,
  isSecureRequest,
  safeNextPath,
  sessionCookieOptions,
  signSession,
  verifySession
} = await import("../lib/session.ts");

test("hashPassword menghasilkan format scrypt dengan salt acak", async () => {
  const a = await hashPassword("rahasia-panjang");
  const b = await hashPassword("rahasia-panjang");
  assert.match(a, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(a, b, "salt harus berbeda tiap hash");
});

test("hashPassword menolak password terlalu pendek", async () => {
  await assert.rejects(() => hashPassword("pendek"), /minimal 8/);
});

test("verifyPassword menerima yang benar dan menolak yang salah", async () => {
  const hash = await hashPassword("Passw0rd!aman");
  assert.equal(await verifyPassword("Passw0rd!aman", hash), true);
  assert.equal(await verifyPassword("Passw0rd!salah", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("verifyPassword menolak hash cacat tanpa melempar error", async () => {
  assert.equal(await verifyPassword("apa-saja", ""), false);
  assert.equal(await verifyPassword("apa-saja", "bukan-format-hash"), false);
  assert.equal(await verifyPassword("apa-saja", "scrypt$1$1$1$c2FsdA==$aGFzaA=="), false, "N terlalu kecil");
  assert.equal(await verifyPassword("apa-saja", "bcrypt$16384$8$1$c2FsdA==$aGFzaA=="), false, "algoritma lain");
  assert.equal(
    await verifyPassword("apa-saja", "scrypt$1048576$8$1$c2FsdGluZ3NhbHQ=$aGFzaGhhc2hoYXNoaGFzaA=="),
    false,
    "N di atas batas harus ditolak, bukan menghabiskan memori"
  );
});

test("safeCompare aman untuk panjang berbeda", () => {
  assert.equal(safeCompare("admin", "admin"), true);
  assert.equal(safeCompare("admin", "admin2"), false);
  assert.equal(safeCompare("admin", ""), false);
  assert.equal(safeCompare("", ""), true);
});

test("signSession dan verifySession bolak-balik", async () => {
  const token = await signSession({sub: "admin"}, SECRET);
  const payload = await verifySession(token, SECRET);
  assert.ok(payload);
  assert.equal(payload.sub, "admin");
  assert.equal(payload.role, "admin");
  assert.ok(payload.exp > payload.iat);
});

test("verifySession menolak tanda tangan yang dipalsukan", async () => {
  const token = await signSession({sub: "admin"}, SECRET);
  assert.equal(await verifySession(token, "b".repeat(48)), null, "secret lain harus gagal");

  const [body] = token.split(".");
  assert.equal(await verifySession(`${body}.AAAA`, SECRET), null, "signature palsu");
  assert.equal(await verifySession(body, SECRET), null, "tanpa signature");
  assert.equal(await verifySession("", SECRET), null);
  assert.equal(await verifySession(null, SECRET), null);
});

test("verifySession menolak payload yang diubah tanpa tanda tangan ulang", async () => {
  const token = await signSession({sub: "kasir", role: "cashier"}, SECRET);
  const [, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({sub: "admin", role: "admin", iat: 1, exp: 9999999999}),
    "utf8"
  ).toString("base64url");
  assert.equal(await verifySession(`${forged}.${signature}`, SECRET), null);
});

test("verifySession menolak token kedaluwarsa", async () => {
  const token = await signSession({sub: "admin", ttlSeconds: -10}, SECRET);
  assert.equal(await verifySession(token, SECRET), null);
});

test("verifySession menolak saat secret kosong", async () => {
  const token = await signSession({sub: "admin"}, SECRET);
  assert.equal(await verifySession(token, ""), null);
});

test("role selain cashier dinormalkan ke admin", async () => {
  const token = await signSession({sub: "x", role: "cashier"}, SECRET);
  assert.equal((await verifySession(token, SECRET)).role, "cashier");
});

test("safeNextPath memblokir open redirect", () => {
  assert.equal(safeNextPath("/kasir"), "/kasir");
  assert.equal(safeNextPath("/kasir?tab=qr"), "/kasir?tab=qr");
  assert.equal(safeNextPath("https://jahat.example/x"), "/");
  assert.equal(safeNextPath("//jahat.example"), "/");
  assert.equal(safeNextPath("/\\jahat.example"), "/");
  assert.equal(safeNextPath("%2f%2fjahat.example"), "/");
  assert.equal(safeNextPath("/%2f%2fjahat.example"), "/");
  assert.equal(safeNextPath("javascript:alert(1)"), "/");
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath(""), "/");
  assert.equal(safeNextPath("/ok", "/fallback"), "/ok");
  assert.equal(safeNextPath("bukan-path", "/fallback"), "/fallback");
});

test("isSameOrigin menolak Origin lintas situs", () => {
  const make = headers => new Request("http://localhost:3000/api/auth/login", {method: "POST", headers});
  assert.equal(isSameOrigin(make({host: "localhost:3000"})), true, "tanpa Origin dianggap aman");
  assert.equal(isSameOrigin(make({host: "localhost:3000", origin: "http://localhost:3000"})), true);
  assert.equal(isSameOrigin(make({host: "localhost:3000", origin: "https://jahat.example"})), false);
  assert.equal(isSameOrigin(make({host: "localhost:3000", origin: "bukan-url"})), false);
});

test("cookie session httpOnly dan sameSite lax", () => {
  const httpReq = new Request("http://localhost:3000/api/auth/login", {method: "POST"});
  const opts = sessionCookieOptions(httpReq);
  assert.equal(opts.name, SESSION_COOKIE);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, "lax");
  assert.equal(opts.path, "/");
  assert.ok(opts.maxAge > 0);
});

test("flag Secure mengikuti protokol, bukan NODE_ENV", () => {
  const original = process.env.AUTH_COOKIE_SECURE;
  try {
    delete process.env.AUTH_COOKIE_SECURE;

    const http = new Request("http://kasir.local/api/auth/login", {method: "POST"});
    const https = new Request("https://kasir.example/api/auth/login", {method: "POST"});
    const proxied = new Request("http://internal/api/auth/login", {
      method: "POST",
      headers: {"x-forwarded-proto": "https"}
    });

    assert.equal(sessionCookieOptions(http).secure, false, "HTTP lokal tidak boleh Secure");
    assert.equal(sessionCookieOptions(https).secure, true);
    assert.equal(sessionCookieOptions(proxied).secure, true, "x-forwarded-proto dihormati");

    process.env.AUTH_COOKIE_SECURE = "true";
    assert.equal(sessionCookieOptions(http).secure, true, "override memaksa Secure");

    process.env.AUTH_COOKIE_SECURE = "false";
    assert.equal(sessionCookieOptions(https).secure, false, "override bisa mematikan Secure");
  } finally {
    if (original === undefined) delete process.env.AUTH_COOKIE_SECURE;
    else process.env.AUTH_COOKIE_SECURE = original;
  }
});

test("isSecureRequest membaca x-forwarded-proto lalu URL", () => {
  const make = (url, headers) => new Request(url, {method: "POST", headers});
  assert.equal(isSecureRequest(make("https://x.example/a")), true);
  assert.equal(isSecureRequest(make("http://x.example/a")), false);
  assert.equal(isSecureRequest(make("http://x.example/a", {"x-forwarded-proto": "https"})), true);
  assert.equal(isSecureRequest(make("https://x.example/a", {"x-forwarded-proto": "http"})), false);
  assert.equal(
    isSecureRequest(make("http://x.example/a", {"x-forwarded-proto": "https, http"})),
    true,
    "hanya hop pertama yang dipakai"
  );
});

test("isAuthConfigured butuh secret cukup panjang dan hash terisi", async () => {
  const original = {secret: process.env.AUTH_SECRET, hash: process.env.ADMIN_PASSWORD_HASH};
  try {
    // Modul membaca process.env saat dipanggil, jadi perubahan langsung terlihat.
    process.env.AUTH_SECRET = SECRET;
    process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
    assert.equal(isAuthConfigured(), true);

    process.env.AUTH_SECRET = "pendek";
    assert.equal(isAuthConfigured(), false, "secret < 32 karakter ditolak");

    process.env.AUTH_SECRET = SECRET;
    process.env.ADMIN_PASSWORD_HASH = "";
    assert.equal(isAuthConfigured(), false, "tanpa hash password ditolak");
  } finally {
    process.env.AUTH_SECRET = original.secret;
    process.env.ADMIN_PASSWORD_HASH = original.hash;
  }
});

test("TTL session dibatasi dan punya default", () => {
  const original = process.env.SESSION_TTL_HOURS;
  try {
    delete process.env.SESSION_TTL_HOURS;
    assert.equal(getSessionTtlSeconds(), 8 * 3600, "default 8 jam");

    process.env.SESSION_TTL_HOURS = "2";
    assert.equal(getSessionTtlSeconds(), 7200);

    process.env.SESSION_TTL_HOURS = "99999";
    assert.equal(getSessionTtlSeconds(), 720 * 3600, "dibatasi 30 hari");

    process.env.SESSION_TTL_HOURS = "-5";
    assert.equal(getSessionTtlSeconds(), 8 * 3600, "nilai tak masuk akal jatuh ke default");
  } finally {
    if (original === undefined) delete process.env.SESSION_TTL_HOURS;
    else process.env.SESSION_TTL_HOURS = original;
  }
});
