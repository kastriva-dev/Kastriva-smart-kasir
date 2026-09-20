import {createHmac, timingSafeEqual} from "node:crypto";

export type LicensePayload = {
  licenseId: string;
  installationId: string;
  plan: "STARTER" | "PRO" | "BUSINESS";
  activeUntil: string;
  maxOutlets: number;
};

const PREFIX = "KSP1";

function secret() {
  const value = (process.env.LICENSE_SIGNING_SECRET || "").trim();
  if (value.length < 32) throw new Error("LICENSE_SIGNING_SECRET minimal 32 karakter");
  return value;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function createLicenseCode(payload: LicensePayload, signingSecret = secret()) {
  const normalized: LicensePayload = {
    licenseId: String(payload.licenseId).slice(0, 100),
    installationId: String(payload.installationId).trim().slice(0, 80),
    plan: payload.plan,
    activeUntil: new Date(payload.activeUntil).toISOString(),
    maxOutlets: Math.min(100, Math.max(1, Math.floor(Number(payload.maxOutlets) || 1)))
  };
  const body = base64url(JSON.stringify(normalized));
  const sig = createHmac("sha256", signingSecret).update(`${PREFIX}.${body}`).digest("base64url");
  return `${PREFIX}.${body}.${sig}`;
}

export function verifyLicenseCode(code: string, signingSecret = secret()): LicensePayload {
  const parts = String(code || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error("Format lisensi tidak valid");
  const [, body, signature] = parts;
  const expected = createHmac("sha256", signingSecret).update(`${PREFIX}.${body}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Tanda tangan lisensi tidak valid");
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new Error("Payload lisensi rusak"); }
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const installationId = String(p.installationId || "").trim().slice(0, 80);
  if (!installationId) throw new Error("Installation ID kosong");
  const plan = String(p.plan || "").toUpperCase();
  if (!["STARTER", "PRO", "BUSINESS"].includes(plan)) throw new Error("Plan lisensi tidak valid");
  const activeUntil = String(p.activeUntil || "");
  if (!Number.isFinite(Date.parse(activeUntil)) || Date.parse(activeUntil) <= Date.now()) throw new Error("Lisensi sudah kedaluwarsa");
  const licenseId = String(p.licenseId || "").trim().slice(0, 100);
  if (!licenseId) throw new Error("License ID kosong");
  const maxOutlets = Math.min(100, Math.max(1, Math.floor(Number(p.maxOutlets) || 1)));
  return {licenseId, installationId, plan: plan as LicensePayload["plan"], activeUntil: new Date(activeUntil).toISOString(), maxOutlets};
}
