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

/* ---------- Pembayaran, laporan, stok, pengaturan ---------- */

test("payOrder mencatat tunai, kembalian, dan status PAID", () => {
  const env = bootstrapped();
  const order = env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}]}).data;
  const bad = env.call("payOrder", {id: order.id, method: "CASH", paidAmount: 1000});
  assert.equal(bad.ok, false, "tunai kurang dari total harus ditolak");

  const paid = env.call("payOrder", {id: order.id, method: "CASH", paidAmount: 200000});
  assert.equal(paid.ok, true);
  assert.equal(paid.data.status, "PAID");
  assert.equal(paid.data.paymentMethod, "CASH");
  assert.equal(paid.data.paidAmount, 200000);
  assert.equal(paid.data.changeAmount, 200000 - paid.data.total);

  const qris = env.call("payOrder", {id: env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data.id, method: "QRIS"});
  assert.equal(qris.data.paidAmount, qris.data.total, "non-tunai selalu pas");
  assert.equal(qris.data.changeAmount, 0);
  assert.equal(env.call("payOrder", {id: order.id, method: "JUMBO"}).ok, false);
});

test("stok berkurang saat order dan habis ditolak", () => {
  const env = bootstrapped();
  const before = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  const stockAwal = Number(before[7]);

  const res = env.call("createOrder", {items: [{menuItemId: "m3", qty: 2}]});
  assert.equal(res.ok, true);
  const after = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  assert.equal(Number(after[7]), stockAwal - 2, "stok harus berkurang sebesar qty");

  const sisa = Number(after[7]);
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m3", qty: sisa + 1}]}).ok, false, "stok kurang ditolak");
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m3", qty: sisa}]}).ok, true);
  const habis = env.sheets.get("Menu").rows.find(r => r[0] === "m3");
  assert.equal(Number(habis[7]), 0);

  // Menu tanpa stok terlacak (string kosong) tidak dibatasi.
  const m1 = env.sheets.get("Menu").rows.find(r => r[0] === "m1");
  m1[7] = "";
  assert.equal(env.call("createOrder", {items: [{menuItemId: "m1", qty: 50}]}).ok, true);
});

test("diskon hanya dihormati untuk request admin (_admin)", () => {
  const env = bootstrapped();
  const publik = env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}], discount: 100000});
  assert.equal(publik.data.discount, 0, "tanpa _admin diskon diabaikan");

  const admin = env.call("createOrder", {_admin: true, items: [{menuItemId: "m1", qty: 1}], discount: 100000});
  assert.equal(admin.data.discount, 100000);
  assert.equal(admin.data.total, publik.data.subtotal - 100000 + publik.data.service);

  const berlebih = env.call("createOrder", {_admin: true, items: [{menuItemId: "m1", qty: 1}], discount: 99999999});
  assert.equal(berlebih.data.discount, berlebih.data.subtotal, "diskon tidak melebihi subtotal");
  assert.equal(berlebih.data.total, berlebih.data.service, "subtotal-0 berarti hanya pajak/service");
});

test("getMenu menyertakan nama kategori", () => {
  const env = bootstrapped();
  const menu = env.call("getMenu", {}).data;
  const beef = menu.find(m => m.id === "m1");
  assert.equal(beef.category, "Main Course");
});

test("getSettings & saveSettings", () => {
  const env = bootstrapped();
  const settings = env.call("getSettings", {}).data;
  assert.equal(settings.storeName, "Kastriva Grand Dining");
  assert.equal(Number(settings.serviceRate), 5);

  const saved = env.call("saveSettings", {name: "Kafe Baru", taxRate: 11, serviceRate: 0, phone: "0811xxx"});
  assert.equal(saved.ok, true);
  assert.equal(saved.data.name, "Kafe Baru");
  assert.equal(Number(saved.data.taxRate), 11);
  assert.equal(Number(saved.data.serviceRate), 0);
  const after = env.call("getSettings", {}).data;
  assert.equal(after.storeName, "Kafe Baru");
  assert.equal(Number(after.taxRate), 11);
});

test("getReport merangkum penjualan hari ini", () => {
  const env = bootstrapped();
  const o1 = env.call("createOrder", {items: [{menuItemId: "m1", qty: 2}, {menuItemId: "m4", qty: 1}]}).data;
  env.call("payOrder", {id: o1.id, method: "CASH", paidAmount: o1.total + 50000});
  const o2 = env.call("createOrder", {items: [{menuItemId: "m2", qty: 1}]}).data;

  const report = env.call("getReport", {range: "today"}).data;
  assert.equal(report.orderCount, 2);
  assert.equal(report.grossSales, 435000 + 125000);
  assert.equal(report.netSales, o1.total + o2.total);
  assert.equal(report.statusCount.PAID, 1);
  assert.equal(report.paymentMix.CASH, o1.total);
  assert.ok(report.topItems.some(t => t.name === "Beef Tenderloin" && t.qty === 2));
  assert.equal(report.series.length, 1);

  const week = env.call("getReport", {range: "7d"}).data;
  assert.equal(week.series.length, 7);
});

test("deleteData mematuhi whitelist", () => {
  const env = bootstrapped();
  assert.equal(env.call("deleteData", {sheet: "Orders", id: "ORD-1"}).ok, false, "Orders tidak boleh dihapus");
  assert.equal(env.call("deleteData", {sheet: "Menu", id: "m9"}).ok, true);
  assert.equal(env.call("deleteData", {sheet: "Menu", id: "m9"}).ok, false, "id yang sama sudah tidak ada");
});

test("saveTable menormalisasi kode & status", () => {
  const env = bootstrapped();
  const saved = env.call("saveTable", {code: " Meja Baru! ", seats: 6});
  assert.equal(saved.ok, true);
  assert.equal(saved.data.code, "meja-baru");
  assert.equal(saved.data.status, "AVAILABLE");
  assert.equal(env.call("saveTable", {code: "   "}).ok, false, "kode wajib");
});

test("getStaff menyembunyikan pinHash", () => {
  const env = bootstrapped();
  env.sheets.get("Staff").rows.push(["s1", "store-001", "Ayu", "Manager", "pin-hash", true, "2026-01-01"]);
  const staff = env.call("getStaff", {}).data;
  assert.equal(staff.length, 1);
  assert.equal("pinHash" in staff[0], false);
});

test("saveStaff: tambah, PIN ter-hash, update PIN lama dipertahankan", () => {
  const env = bootstrapped();

  const created = env.call("saveStaff", {name: "Rizky", role: "Kasir", pin: "1234", active: true});
  assert.equal(created.ok, true);
  assert.ok(created.data.id, "staff baru mendapat id");
  const savedRow = env.sheets.get("Staff").rows.find(r => r[0] === created.data.id);
  assert.match(String(savedRow[4]), /^sha256\$/, "PIN harus tersimpan sebagai hash");
  assert.equal(savedRow.includes("1234"), false, "PIN polos tidak boleh tersimpan");
  const hashLama = String(savedRow[4]); // snapshot: baris sheet adalah referensi yang termutasi

  const bad = env.call("saveStaff", {name: "Salah", pin: "12ab"});
  assert.equal(bad.ok, false, "PIN non-digit ditolak");
  assert.equal(env.call("saveStaff", {name: "Salah", pin: "12"}).ok, false, "PIN terlalu pendek ditolak");
  assert.equal(env.call("saveStaff", {name: ""}).ok, false, "nama wajib");

  const updated = env.call("saveStaff", {id: created.data.id, name: "Rizky P.", role: "Manager"});
  assert.equal(updated.ok, true);
  const updatedRow = env.sheets.get("Staff").rows.find(r => r[0] === created.data.id);
  assert.equal(updatedRow[3], "Manager");
  assert.equal(String(updatedRow[4]), hashLama, "PIN lama dipertahankan saat tidak diisi");

  const replaced = env.call("saveStaff", {id: created.data.id, name: "Rizky P.", role: "Manager", pin: "567890"});
  const replacedRow = env.sheets.get("Staff").rows.find(r => r[0] === created.data.id);
  assert.notEqual(String(replacedRow[4]), hashLama, "PIN baru menggantikan hash lama");
  assert.equal(replaced.data.name, "Rizky P.");
});

test("getOrders withItems menyertakan item", () => {
  const env = bootstrapped();
  env.call("createOrder", {items: [{menuItemId: "m1", qty: 1}, {menuItemId: "m2", qty: 2}]});
  const orders = env.call("getOrders", {withItems: true}).data;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].items.length, 2);
});
