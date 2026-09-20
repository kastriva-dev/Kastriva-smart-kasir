import {createHmac, randomBytes, timingSafeEqual} from "node:crypto";
import {isSecureRequest} from "./session.ts";

export const LICENSE_CENTER_COOKIE = "kastriva_license_center";
const MIN_SECRET_LENGTH = 32;
const DEFAULT_TTL_HOURS = 12;

type LicenseCenterSession = {
  scope: "license-center";
  iat: number;
  exp: number;
  nonce: string;
};

function authSecret() {
  const value = String(process.env.LICENSE_CENTER_AUTH_SECRET || "").trim();
  return value.length >= MIN_SECRET_LENGTH ? value : "";
}

export function licenseCenterPasswordHash() {
  return String(process.env.LICENSE_CENTER_PASSWORD_HASH || "").trim();
}

export function isLicenseCenterConfigured() {
  const signing = String(process.env.LICENSE_SIGNING_SECRET || "").trim();
  return Boolean(authSecret() && licenseCenterPasswordHash() && signing.length >= MIN_SECRET_LENGTH);
}

function ttlSeconds() {
  const hours = Number(process.env.LICENSE_CENTER_SESSION_HOURS);
  const safe = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 72) : DEFAULT_TTL_HOURS;
  return Math.round(safe * 3600);
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export function signLicenseCenterSession(nowMs = Date.now()) {
  const secret = authSecret();
  if (!secret) throw new Error("LICENSE_CENTER_AUTH_SECRET belum dikonfigurasi");
  const iat = Math.floor(nowMs / 1000);
  const payload: LicenseCenterSession = {
    scope: "license-center",
    iat,
    exp: iat + ttlSeconds(),
    nonce: randomBytes(12).toString("base64url")
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyLicenseCenterSession(token: string | undefined | null, nowMs = Date.now()) {
  const secret = authSecret();
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<LicenseCenterSession>;
    return parsed.scope === "license-center" && typeof parsed.exp === "number" && parsed.exp > Math.floor(nowMs / 1000);
  } catch {
    return false;
  }
}

export function readLicenseCenterCookie(req: Request) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === LICENSE_CENTER_COOKIE) return part.slice(index + 1).trim();
  }
  return "";
}

export function hasLicenseCenterAccess(req: Request) {
  return verifyLicenseCenterSession(readLicenseCenterCookie(req));
}

export function licenseCenterCookieOptions(req: Request, maxAge = ttlSeconds()) {
  return {
    name: LICENSE_CENTER_COOKIE,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isSecureRequest(req),
    path: "/",
    maxAge
  };
}
