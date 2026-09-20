/**
 * Session login berbasis token bertanda tangan (stateless).
 *
 * Modul ini HARUS aman dijalankan di Edge runtime karena diimpor middleware.ts.
 * Hanya Web Crypto yang dipakai di sini; verifikasi password admin tetap berada
 * di route Node.js terpisah.
 */

export const SESSION_COOKIE = "kastriva_session";

export const SESSION_ROLES = ["admin", "manager", "cashier", "kitchen", "waiter", "barista", "staff"] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];

export type SessionPayload = {
  /** admin username atau id staff */
  sub: string;
  role: SessionRole;
  /** nama yang aman ditampilkan di UI */
  name?: string;
  /** store staff, bila tersedia */
  storeId?: string;
  /** issued at, epoch detik */
  iat: number;
  /** expires at, epoch detik */
  exp: number;
};

const MIN_SECRET_LENGTH = 32;
const DEFAULT_TTL_HOURS = 8;

export function getAuthSecret(): string {
  const secret = (process.env.AUTH_SECRET || "").trim();
  return secret.length >= MIN_SECRET_LENGTH ? secret : "";
}

export function isAuthConfigured(): boolean {
  return Boolean(getAuthSecret() && (process.env.ADMIN_PASSWORD_HASH || "").trim());
}

export function getSessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS);
  const safe = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 720) : DEFAULT_TTL_HOURS;
  return Math.round(safe * 3600);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name: "HMAC", hash: "SHA-256"},
    false,
    ["sign", "verify"]
  );
}

function normalizeRole(value: unknown): SessionRole {
  const role = String(value || "").toLowerCase();
  return (SESSION_ROLES as readonly string[]).includes(role) ? (role as SessionRole) : "staff";
}

export async function signSession(
  input: {sub: string; role?: SessionRole; name?: string; storeId?: string; ttlSeconds?: number},
  secret = getAuthSecret()
): Promise<string> {
  if (!secret) throw new Error("AUTH_SECRET belum dikonfigurasi");
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: String(input.sub).slice(0, 64),
    role: normalizeRole(input.role || "admin"),
    name: input.name ? String(input.name).slice(0, 80) : undefined,
    storeId: input.storeId ? String(input.storeId).slice(0, 64) : undefined,
    iat: now,
    exp: now + (input.ttlSeconds ?? getSessionTtlSeconds())
  };

  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
  token: string | undefined | null,
  secret = getAuthSecret()
): Promise<SessionPayload | null> {
  if (!secret || !token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(body)
    );
    if (!valid) return null;

    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      sub: payload.sub,
      role: normalizeRole(payload.role),
      name: typeof payload.name === "string" ? payload.name.slice(0, 80) : undefined,
      storeId: typeof payload.storeId === "string" ? payload.storeId.slice(0, 64) : undefined,
      iat: payload.iat,
      exp: payload.exp
    };
  } catch {
    return null;
  }
}

export function isSecureRequest(req: Request): boolean {
  const forwarded = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieOptions(req?: Request, maxAgeSeconds = getSessionTtlSeconds()) {
  const override = (process.env.AUTH_COOKIE_SECURE || "").trim().toLowerCase();
  const secure =
    override === "true" ? true : override === "false" ? false : req ? isSecureRequest(req) : false;

  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds
  };
}

export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  let path = String(value);
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("//") || decoded.startsWith("/\\") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
      return fallback;
    }
  } catch {
    return fallback;
  }
  if (path.length > 512) path = path.slice(0, 512);
  return path;
}

export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
