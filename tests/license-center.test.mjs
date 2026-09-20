import test from "node:test";
import assert from "node:assert/strict";

const OLD = {
  auth: process.env.LICENSE_CENTER_AUTH_SECRET,
  hash: process.env.LICENSE_CENTER_PASSWORD_HASH,
  sign: process.env.LICENSE_SIGNING_SECRET,
  hours: process.env.LICENSE_CENTER_SESSION_HOURS
};

process.env.LICENSE_CENTER_AUTH_SECRET = "license-center-auth-secret-uji-minimal-32-karakter";
process.env.LICENSE_CENTER_PASSWORD_HASH = "scrypt$16384$8$1$ZmFrZXNhbHQ=$ZmFrZWhhc2hmYWtl";
process.env.LICENSE_SIGNING_SECRET = "license-signing-secret-uji-minimal-32-karakter";
process.env.LICENSE_CENTER_SESSION_HOURS = "12";

const {
  LICENSE_CENTER_COOKIE,
  hasLicenseCenterAccess,
  isLicenseCenterConfigured,
  licenseCenterCookieOptions,
  signLicenseCenterSession,
  verifyLicenseCenterSession
} = await import("../lib/license-center.ts");

test("License Center terdeteksi configured saat tiga environment tersedia", () => {
  assert.equal(isLicenseCenterConfigured(), true);
});

test("session License Center round-trip dan menolak token yang dimodifikasi", () => {
  const now = Date.now();
  const token = signLicenseCenterSession(now);
  assert.equal(verifyLicenseCenterSession(token, now + 1_000), true);
  const tampered = `${token.slice(0,-1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(verifyLicenseCenterSession(tampered, now + 1_000), false);
});

test("session License Center kedaluwarsa sesuai TTL", () => {
  const now = Date.now();
  const token = signLicenseCenterSession(now);
  assert.equal(verifyLicenseCenterSession(token, now + 13*60*60*1000), false);
});

test("request License Center membaca cookie khusus dan tidak memakai cookie admin POS", () => {
  const token = signLicenseCenterSession();
  const req = new Request("https://example.com/api/license-center/session", {headers:{cookie:`other=x; ${LICENSE_CENTER_COOKIE}=${token}`}});
  assert.equal(hasLicenseCenterAccess(req), true);
  const wrong = new Request("https://example.com/api/license-center/session", {headers:{cookie:"kastriva_session=abc"}});
  assert.equal(hasLicenseCenterAccess(wrong), false);
});

test("cookie License Center HttpOnly, SameSite Strict dan Secure pada HTTPS", () => {
  const opts = licenseCenterCookieOptions(new Request("https://example.com/license-center"));
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, "strict");
  assert.equal(opts.secure, true);
  assert.equal(opts.path, "/");
});

test.after(() => {
  const restore = (key, value) => value === undefined ? delete process.env[key] : process.env[key] = value;
  restore("LICENSE_CENTER_AUTH_SECRET", OLD.auth);
  restore("LICENSE_CENTER_PASSWORD_HASH", OLD.hash);
  restore("LICENSE_SIGNING_SECRET", OLD.sign);
  restore("LICENSE_CENTER_SESSION_HOURS", OLD.hours);
});
