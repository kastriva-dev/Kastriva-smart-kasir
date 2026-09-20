import assert from "node:assert/strict";
import test from "node:test";
const {createLicenseCode, verifyLicenseCode} = await import("../lib/license.ts");
const SECRET = "license-secret-uji-minimal-32-karakter-aman";

test("Stage 6 license code signed round-trip", () => {
  const payload = {licenseId:"LIC-123", installationId:"INST-ABC123", plan:"PRO", activeUntil:new Date(Date.now()+86400000).toISOString(), maxOutlets:4};
  const code = createLicenseCode(payload, SECRET);
  assert.ok(code.startsWith("KSP1."));
  const out = verifyLicenseCode(code, SECRET);
  assert.equal(out.licenseId, "LIC-123");
  assert.equal(out.installationId, "INST-ABC123");
  assert.equal(out.plan, "PRO");
  assert.equal(out.maxOutlets, 4);
});

test("Stage 6 license code menolak modifikasi dan expiry", () => {
  const payload = {licenseId:"LIC-X", installationId:"INST-XYZ987", plan:"BUSINESS", activeUntil:new Date(Date.now()+86400000).toISOString(), maxOutlets:10};
  const code = createLicenseCode(payload, SECRET);
  assert.throws(() => verifyLicenseCode(code.replace(/.$/, code.endsWith("A") ? "B" : "A"), SECRET), /tanda tangan/i);
  const expired = createLicenseCode({...payload, activeUntil:new Date(Date.now()-1000).toISOString()}, SECRET);
  assert.throws(() => verifyLicenseCode(expired, SECRET), /kedaluwarsa/i);
});
