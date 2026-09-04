/**
 * Tes unit untuk lapisan validasi lib/gas.ts.
 * File TS di-transpile lewat loader TypeScript bawaan Node 22+/24 (--experimental-strip-types).
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.ADMIN_API_TOKEN = "token-admin-uji";

const {
  ADMIN_ACTIONS,
  PUBLIC_ACTIONS,
  assertActionAllowed,
  hasAdminAccess,
  isKnownAction,
  rateLimit,
  sanitizeCreateOrder,
  sanitizeStatusUpdate
} = await import("../lib/gas.ts");

const req = (headers = {}) => new Request("http://localhost/api/orders", {headers});

test("allowlist action", () => {
  assert.equal(isKnownAction("createOrder"), true);
  assert.equal(isKnownAction("getMenu"), true);
  assert.equal(isKnownAction("dropDatabase"), false);
  assert.equal(isKnownAction(""), false);
  assert.equal(PUBLIC_ACTIONS.has("deleteMenu"), false);
  assert.equal(ADMIN_ACTIONS.has("deleteMenu"), true);
});

test("action publik tidak butuh token, action admin butuh token", () => {
  assert.doesNotThrow(() => assertActionAllowed("createOrder", req()));
  assert.throws(() => assertActionAllowed("deleteMenu", req()), /Unauthorized/);
  assert.throws(() => assertActionAllowed("deleteMenu", req({"x-admin-token": "salah"})), /Unauthorized/);
  assert.doesNotThrow(() => assertActionAllowed("deleteMenu", req({"x-admin-token": "token-admin-uji"})));
  assert.doesNotThrow(() => assertActionAllowed("deleteMenu", req({authorization: "Bearer token-admin-uji"})));
  assert.throws(() => assertActionAllowed("rm -rf", req({"x-admin-token": "token-admin-uji"})), /tidak diizinkan/);
});

test("hasAdminAccess menolak token kosong dan salah panjang", () => {
  assert.equal(hasAdminAccess(req()), false);
  assert.equal(hasAdminAccess(req({"x-admin-token": ""})), false);
  assert.equal(hasAdminAccess(req({"x-admin-token": "token-admin-uji-lebih-panjang"})), false);
  assert.equal(hasAdminAccess(req({"x-admin-token": "token-admin-uji"})), true);
});

test("sanitizeCreateOrder membuang harga dari client", () => {
  const out = sanitizeCreateOrder({
    storeId: "kastriva",
    tableCode: "meja-01",
    items: [{menuItemId: "m1", name: "Beef", qty: 2, price: 1, cost: 0}]
  });
  assert.equal("price" in out.items[0], false, "price tidak boleh diteruskan");
  assert.equal(out.items[0].qty, 2);
  assert.equal(out.channel, "QR");
});

test("sanitizeCreateOrder menolak input tidak valid", () => {
  assert.throws(() => sanitizeCreateOrder(null), /tidak valid/);
  assert.throws(() => sanitizeCreateOrder({items: []}), /kosong/);
  assert.throws(() => sanitizeCreateOrder({items: [{menuItemId: "m1", qty: 0}]}), /1-99/);
  assert.throws(() => sanitizeCreateOrder({items: [{menuItemId: "m1", qty: 1.5}]}), /1-99/);
  assert.throws(() => sanitizeCreateOrder({items: [{menuItemId: "m1", qty: 100}]}), /1-99/);
  assert.throws(() => sanitizeCreateOrder({items: [{qty: 1}]}), /menuItemId/);
  assert.throws(() => sanitizeCreateOrder({items: new Array(61).fill({menuItemId: "m1", qty: 1})}), /Terlalu banyak/);
});

test("sanitizeCreateOrder memotong dan membersihkan teks", () => {
  const out = sanitizeCreateOrder({
    customerName: "  Budi\u0000Santoso  ",
    note: "x".repeat(500),
    phone: "+62 811-2222-3333",
    channel: "wa",
    items: [{menuItemId: "m1", qty: 1}]
  });
  assert.equal(out.customerName.includes("\u0000"), false);
  assert.equal(out.note.length, 300);
  assert.equal(out.phone, "+6281122223333");
  assert.equal(out.channel, "WA");
});

test("channel asing jatuh ke QR", () => {
  const out = sanitizeCreateOrder({channel: "TELEPATI", items: [{menuItemId: "m1", qty: 1}]});
  assert.equal(out.channel, "QR");
});

test("sanitizeStatusUpdate memvalidasi status", () => {
  assert.deepEqual(sanitizeStatusUpdate({id: "ORD-1", status: "paid"}), {
    id: "ORD-1",
    status: "PAID",
    userId: "staff"
  });
  assert.throws(() => sanitizeStatusUpdate({status: "PAID"}), /id pesanan/);
  assert.throws(() => sanitizeStatusUpdate({id: "ORD-1", status: "HACKED"}), /tidak valid/);
});

test("rateLimit menghitung per kunci dan reset setelah jendela", async () => {
  const key = `uji-${Math.random()}`;
  assert.equal(rateLimit(key, 2, 50), true);
  assert.equal(rateLimit(key, 2, 50), true);
  assert.equal(rateLimit(key, 2, 50), false);
  assert.equal(rateLimit(`${key}-lain`, 2, 50), true, "kunci lain tidak terpengaruh");
  await new Promise(r => setTimeout(r, 70));
  assert.equal(rateLimit(key, 2, 50), true, "jendela sudah reset");
});
