/** Tes backend Google Apps Script (gas/Code.gs) memakai stub Sheets. */
import assert from "node:assert/strict";
import test from "node:test";
import {createGasSandbox} from "./helpers/gas-sandbox.mjs";

const KEY = "rahasia-panjang";

function bootstrapped() {
  const env = createGasSandbox({apiKey: KEY});
  env.gas.setupDatabase();
  return env;
}

test("auth fail-closed saat GAS_API_KEY belum diisi", () => {
  const env = createGasSandbox({apiKey: ""});
  assert.throws(() => env.gas.auth_("apa-saja"), /belum dikonfigurasi/);
  const res = env.post({action: "health"});
  assert.equal(res.ok, false);
});

test("auth menolak key salah dan menerima key benar", () => {
  const env = createGasSandbox({apiKey: KEY});
  assert.throws(() => env.gas.auth_("salah"), /Unauthorized/);
  assert.throws(() => env.gas.auth_(""), /Unauthorized/);
  assert.doesNotThrow(() => env.gas.auth_(KEY));
});

test("setupDatabase membuat 12 sheet dengan header dan seed", () => {
  const env = bootstrapped();
  assert.equal(env.sheets.size, 12);
  assert.deepEqual(env.sheets.get("Orders").rows[0], env.gas.HEADERS.Orders);
  assert.equal(env.sheets.get("Menu").rows.length, 10); // header + 9 menu
  assert.equal(env.sheets.get("Orders").frozen, 1);
});

test("setupDatabase idempoten: data lama tidak dihapus", () => {
  const env = bootstrapped();
  const before = env.sheets.get("Menu").rows.length;
  env.gas.setupDatabase();
  assert.equal(env.sheets.get("Menu").rows.length, before);
});

test("setupDatabase menambah kolom yang hilang, bukan menghapus sheet", () => {
  const env = bootstrapped();
  const inv = env.sheets.get("Inventory");
  inv.rows = [["id", "storeId", "name"], ["i1", "store-001", "Beras"]];
  env.gas.setupDatabase();
  assert.equal(inv.rows[0].length, env.gas.HEADERS.Inventory.length);
  assert.equal(inv.rows.length, 2);
  assert.equal(inv.rows[1][2], "Beras");
});

test("createOrder menghitung harga dari sheet dan mengabaikan harga client", () => {
  const env = bootstrapped();
  const res = env.call("createOrder", {
    storeId: "kastriva",
    tableCode: "meja-03",
    customerName: "Budi",
    phone: "+62 811-2222-3333",
    channel: "QR",
    items: [
      {menuItemId: "m1", qty: 2, price: 1},
      {menuItemId: "m4", qty: 1, price: 0}
    ]
  });

  assert.equal(res.ok, true);
  const order = res.data;
  assert.equal(order.subtotal, 435000); // 2*185000 + 65000
  assert.equal(order.service, 21750); // serviceRate seed 5%
  assert.equal(order.tax, 0);
  assert.equal(order.total, 456750);
  assert.equal(order.items[0].price, 185000, "harga client harus diabaikan");
  assert.equal(order.status, "NEW");
  assert.equal(order.tableId, "table-3");
  assert.equal(order.phone, "+6281122223333");
  assert.equal(env.sheets.get("OrderItems").rows.length, 3);
  assert.equal(env.sheets.get("Customers").rows.length, 2);
});

test("createOrder menolak payload tidak valid", () => {
  const env = bootstrapped();
  const bad = payload => env.call("createOrder", payload).ok;
  assert.equal(bad({items: []}), false);
  assert.equal(bad({items: [{menuItemId: "m1", qty: 0}]}), false);
  assert.equal(bad({items: [{menuItemId: "m1", qty: 100}]}), false);
  assert.equal(bad({items: [{menuItemId: "m1", qty: -3}]}), false);
  assert.equal(bad({items: [{menuItemId: "tidak-ada", qty: 1}]}), false);
  assert.equal(bad({items: new Array(61).fill({menuItemId: "m1", qty: 1})}), false);
});

test("menu nonaktif tidak bisa dipesan dan tidak muncul di getMenu", () => {
  const env = bootstrapped();
  env.sheets.get("Menu").rows[1][8] = false; // m1.active = false
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}]}).ok, false);
  assert.ok(env.call("getMenu", {}).data.every(m => m.id !== "m1"));
});

test("updateOrderStatus memvalidasi status", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data;
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "cooking"}).data.status, "COOKING");
  assert.equal(env.call("updateOrderStatus", {id: order.id, status: "HACK"}).ok, false);
  assert.equal(env.call("updateOrderStatus", {id: "ORD-XXX", status: "PAID"}).ok, false);
  assert.equal(env.call("updateOrderStatus", {status: "PAID"}).ok, false);
});

test("getOrder menyertakan item, getOrders menghormati limit", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}, {menuItemId: "m2", qty: 2}]}).data;
  const fetched = env.call("getOrder", {id: order.id});
  assert.equal(fetched.data.items.length, 2);

  env.call("createOrder", {items: [{menuItemId: "m3", qty: 1}]});
  assert.equal(env.call("getOrders", {limit: 1}).data.length, 1);
  assert.ok(env.call("getOrders", {}).data.length >= 2);
});

test("saveMenu dan deleteMenu", () => {
  const env = bootstrapped();
  const saved = env.call("saveMenu", {name: "Es Teh", price: 12000, cost: 3000, stock: 50, storeId: "store-001"});
  assert.equal(saved.ok, true);
  assert.ok(saved.data.id);
  assert.equal(env.call("saveMenu", {name: "Gratisan", price: -5}).data.price, 0);
  assert.equal(env.call("saveMenu", {price: 100}).ok, false, "nama wajib");
  assert.equal(env.call("deleteMenu", {id: saved.data.id}).ok, true);
  assert.equal(env.call("deleteMenu", {id: "nope"}).ok, false);
});

test("action tidak dikenal ditolak", () => {
  const env = bootstrapped();
  assert.equal(env.call("dropTable", {}).ok, false);
});

test("lock mencegah tulis bersamaan", () => {
  const env = bootstrapped();
  env.holdLock(true);
  const busy = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]});
  assert.equal(busy.ok, false);
  assert.match(busy.error, /sibuk/);
  env.holdLock(false);
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).ok, true);
});

test("doGet menghormati auth", () => {
  const env = bootstrapped();
  assert.equal(env.get({key: KEY, action: "getMenu"}).ok, true);
  assert.equal(env.get({key: "salah", action: "getMenu"}).ok, false);
});
