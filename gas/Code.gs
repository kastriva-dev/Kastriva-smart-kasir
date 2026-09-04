/**
 * Kastriva Smart Kasir - Google Apps Script Backend
 * Database: Google Sheets
 *
 * Setup:
 * 1. Buat Google Spreadsheet baru.
 * 2. Extensions > Apps Script, tempel file ini sebagai Code.gs.
 * 3. Project Settings > Script properties, tambahkan GAS_API_KEY = secret acak
 *    (WAJIB; tanpa properti ini semua request akan ditolak).
 * 4. Jalankan setupDatabase() sekali dan izinkan akses.
 * 5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * 6. Simpan URL /exec ke environment Vercel sebagai GAS_WEB_APP_URL,
 *    dan GAS_API_KEY yang sama ke environment Vercel.
 *
 * Catatan keamanan: "Anyone" hanya berarti endpoint dapat diakses;
 * setiap request masih harus menyertakan key yang cocok.
 */

var SHEETS = {
  STORES: 'Stores',
  TABLES: 'Tables',
  CATEGORIES: 'Categories',
  MENU: 'Menu',
  ORDERS: 'Orders',
  ORDER_ITEMS: 'OrderItems',
  CUSTOMERS: 'Customers',
  RESERVATIONS: 'Reservations',
  INVENTORY: 'Inventory',
  STAFF: 'Staff',
  AUDIT: 'AuditLog',
  SETTINGS: 'Settings'
};

var HEADERS = {
  Stores: ['id','name','slug','phone','address','taxRate','serviceRate','createdAt'],
  Tables: ['id','storeId','code','seats','status','createdAt'],
  Categories: ['id','storeId','name','sortOrder','active'],
  Menu: ['id','storeId','categoryId','name','description','price','cost','stock','active','emoji','imageUrl','createdAt','updatedAt'],
  Orders: ['id','storeId','tableId','tableCode','customerName','phone','channel','status','subtotal','discount','tax','service','total','note','createdAt','updatedAt'],
  OrderItems: ['id','orderId','menuItemId','name','price','qty','note'],
  Customers: ['id','storeId','name','phone','email','tier','visits','totalSpend','preferences','createdAt','updatedAt'],
  Reservations: ['id','storeId','guestName','phone','partySize','reservedAt','status','note','createdAt'],
  Inventory: ['id','storeId','name','unit','stock','parLevel','cost','updatedAt'],
  Staff: ['id','storeId','name','role','pinHash','active','createdAt'],
  AuditLog: ['id','storeId','userId','action','entity','entityId','detail','createdAt'],
  Settings: ['key','value','updatedAt']
};

var ORDER_STATUSES = ['NEW','CONFIRMED','COOKING','READY','SERVED','PAID','CANCELLED'];
var ORDER_CHANNELS = ['POS','QR','WA'];
var LOCK_TIMEOUT_MS = 20000;

/**
 * Membuat semua sheet dan header bila belum ada.
 * Header yang berbeda TIDAK lagi memicu sh.clear() (versi lama menghapus semua data);
 * kolom yang kurang ditambahkan di belakang, kolom asing dibiarkan.
 */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  Object.keys(SHEETS).forEach(function(key) {
    var name = SHEETS[key];
    var headers = HEADERS[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(headers);
      report.push(name + ': created');
    } else if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      report.push(name + ': header added');
    } else {
      var width = Math.max(sh.getLastColumn(), 1);
      var current = sh.getRange(1, 1, 1, width).getValues()[0].map(function(v) { return String(v); });
      var missing = headers.filter(function(h) { return current.indexOf(h) === -1; });
      if (missing.length) {
        sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
        report.push(name + ': added columns ' + missing.join(','));
      }
    }
    sh.setFrozenRows(1);
  });
  seedDemoData_();
  return report.join(' | ') || 'Database sudah sesuai';
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    auth_(params.key);
    var payload = params.payload ? JSON.parse(params.payload) : {};
    return json_(dispatch_(params.action || 'health', payload));
  } catch (err) {
    return json_(errorPayload_(err));
  }
}

function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    auth_(body.key);
    return json_(dispatch_(body.action || 'health', body.payload || {}));
  } catch (err) {
    return json_(errorPayload_(err));
  }
}

function dispatch_(action, p) {
  p = p || {};
  switch (action) {
    case 'health':
      return {ok: true, service: 'Kastriva GAS', time: iso_()};
    case 'getMenu':
      return {ok: true, data: listObjects_('Menu').filter(isActive_)};
    case 'getOrders':
      return {ok: true, data: listOrders_(p)};
    case 'getOrder':
      return {ok: true, data: getOrderWithItems_(requireId_(p.id))};
    case 'createOrder':
      return withLock_(function() { return createOrder_(p); });
    case 'updateOrderStatus':
      return withLock_(function() { return updateOrderStatus_(p); });
    case 'getTables':
      return {ok: true, data: listObjects_('Tables')};
    case 'getCustomers':
      return {ok: true, data: listObjects_('Customers')};
    case 'getInventory':
      return {ok: true, data: listObjects_('Inventory')};
    case 'getReservations':
      return {ok: true, data: listObjects_('Reservations')};
    case 'saveMenu':
      return withLock_(function() { return upsertObject_('Menu', normalizeMenu_(p)); });
    case 'saveTable':
      return withLock_(function() { return upsertObject_('Tables', p); });
    case 'saveInventory':
      return withLock_(function() { return upsertObject_('Inventory', p); });
    case 'saveReservation':
      return withLock_(function() { return upsertObject_('Reservations', p); });
    case 'deleteMenu':
      return withLock_(function() { return deleteObject_('Menu', requireId_(p.id)); });
    case 'audit':
      return withLock_(function() {
        return appendObject_('AuditLog', {
          id: uuid_(),
          storeId: str_(p.storeId, 64),
          userId: str_(p.userId, 64),
          action: str_(p.action, 32),
          entity: str_(p.entity, 32),
          entityId: str_(p.entityId, 64),
          detail: str_(p.detail, 2000),
          createdAt: iso_()
        });
      });
    default:
      throw new Error('Unknown action: ' + String(action).slice(0, 40));
  }
}

/* ---------------- Orders ---------------- */

/**
 * Membuat order. Harga SELALU dibaca dari sheet Menu, bukan dari client,
 * supaya pelanggan tidak bisa mengirim harga sendiri lewat DevTools.
 */
function createOrder_(p) {
  var items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) throw new Error('Pesanan tidak boleh kosong');
  if (items.length > 60) throw new Error('Terlalu banyak item dalam satu pesanan');

  var store = resolveStore_(p.storeId);
  var menuById = indexBy_(listObjects_('Menu'), 'id');

  var subtotal = 0;
  var cleanItems = items.map(function(raw, index) {
    var menuItemId = str_(raw && (raw.menuItemId || raw.id), 64);
    if (!menuItemId) throw new Error('Item #' + (index + 1) + ' tidak memiliki menuItemId');
    var menuItem = menuById[menuItemId];
    if (!menuItem) throw new Error('Menu tidak ditemukan: ' + menuItemId);
    if (!isActive_(menuItem)) throw new Error('Menu tidak tersedia: ' + (menuItem.name || menuItemId));

    var qty = Math.floor(Number(raw.qty));
    if (!isFinite(qty) || qty < 1 || qty > 99) throw new Error('Qty item #' + (index + 1) + ' harus 1-99');

    var price = Number(menuItem.price) || 0;
    subtotal += price * qty;
    return {
      id: uuid_(),
      menuItemId: menuItemId,
      name: String(menuItem.name || ''),
      price: price,
      qty: qty,
      note: str_(raw.note, 200)
    };
  });

  var taxRate = numberOr_(store.taxRate, 0);
  var serviceRate = numberOr_(store.serviceRate, 0);
  var discount = 0;
  var tax = Math.round(subtotal * (taxRate > 1 ? taxRate / 100 : taxRate));
  var service = Math.round(subtotal * (serviceRate > 1 ? serviceRate / 100 : serviceRate));

  var channel = String(str_(p.channel, 8)).toUpperCase();
  if (ORDER_CHANNELS.indexOf(channel) === -1) channel = 'QR';

  var tableCode = str_(p.tableCode, 32);
  var order = {
    id: 'ORD-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    storeId: store.id || str_(p.storeId, 64),
    tableId: resolveTableId_(store.id, tableCode, str_(p.tableId, 64)),
    tableCode: tableCode,
    customerName: str_(p.customerName, 80),
    phone: str_(p.phone, 20).replace(/[^0-9+]/g, ''),
    channel: channel,
    status: 'NEW',
    subtotal: subtotal,
    discount: discount,
    tax: tax,
    service: service,
    total: subtotal - discount + tax + service,
    note: str_(p.note, 300),
    createdAt: iso_(),
    updatedAt: iso_()
  };

  appendObject_('Orders', order);
  appendRows_('OrderItems', cleanItems.map(function(item) {
    return Object.assign({orderId: order.id}, item);
  }));

  if (order.phone) upsertCustomer_(order);

  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: order.storeId,
    userId: 'customer',
    action: 'CREATE',
    entity: 'ORDER',
    entityId: order.id,
    detail: JSON.stringify({channel: order.channel, table: order.tableCode, total: order.total}),
    createdAt: iso_()
  });

  return {ok: true, data: Object.assign({}, order, {items: cleanItems})};
}

function updateOrderStatus_(p) {
  var id = requireId_(p.id);
  var status = String(str_(p.status, 16)).toUpperCase();
  if (ORDER_STATUSES.indexOf(status) === -1) throw new Error('Status tidak valid: ' + status);

  var row = findRow_('Orders', id);
  if (!row) throw new Error('Order tidak ditemukan');

  var order = getObject_('Orders', id);
  order.status = status;
  order.updatedAt = iso_();
  updateRow_('Orders', row, order);

  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: order.storeId,
    userId: str_(p.userId, 64) || 'staff',
    action: 'STATUS',
    entity: 'ORDER',
    entityId: id,
    detail: JSON.stringify({status: status}),
    createdAt: iso_()
  });

  return {ok: true, data: order};
}

function listOrders_(p) {
  var limit = Math.min(Math.max(Math.floor(Number(p && p.limit) || 200), 1), 1000);
  var storeId = str_(p && p.storeId, 64);
  var status = String(str_(p && p.status, 16)).toUpperCase();
  var rows = listObjects_('Orders');
  if (storeId) rows = rows.filter(function(o) { return String(o.storeId) === storeId; });
  if (status && ORDER_STATUSES.indexOf(status) !== -1) {
    rows = rows.filter(function(o) { return String(o.status).toUpperCase() === status; });
  }
  rows.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return rows.slice(0, limit);
}

function getOrderWithItems_(id) {
  var order = getObject_('Orders', id);
  if (!order) throw new Error('Order tidak ditemukan');
  order.items = listObjects_('OrderItems').filter(function(item) {
    return String(item.orderId) === String(id);
  });
  return order;
}

function upsertCustomer_(order) {
  var rows = listObjects_('Customers');
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].phone && String(rows[i].phone) === String(order.phone)) { found = rows[i]; break; }
  }
  if (found) {
    found.visits = (Number(found.visits) || 0) + 1;
    found.totalSpend = (Number(found.totalSpend) || 0) + (Number(order.total) || 0);
    found.name = order.customerName || found.name;
    found.updatedAt = iso_();
    var row = findRow_('Customers', found.id);
    if (row) updateRow_('Customers', row, found);
    return;
  }
  appendObject_('Customers', {
    id: uuid_(),
    storeId: order.storeId,
    name: order.customerName || 'Guest',
    phone: order.phone,
    email: '',
    tier: 'MEMBER',
    visits: 1,
    totalSpend: Number(order.total) || 0,
    preferences: '{}',
    createdAt: iso_(),
    updatedAt: iso_()
  });
}

/* ---------------- Sheet helpers ---------------- */

function listObjects_(sheetName) {
  var sh = sheet_(sheetName);
  var lastRow = sh.getLastRow();
  var headers = HEADERS[sheetName];
  if (lastRow < 2) return [];
  var values = sh.getRange(1, 1, lastRow, Math.max(sh.getLastColumn(), headers.length)).getValues();
  var sheetHeaders = values[0].map(function(h) { return String(h); });
  return values.slice(1)
    .filter(function(row) { return row.join('') !== ''; })
    .map(function(row) { return rowToObject_(sheetHeaders, row); });
}

function rowToObject_(headers, row) {
  var out = {};
  for (var i = 0; i < headers.length; i++) {
    if (!headers[i]) continue;
    out[headers[i]] = normalize_(row[i]);
  }
  return out;
}

function getObject_(sheetName, id) {
  if (!id) return null;
  var row = findRow_(sheetName, id);
  if (!row) return null;
  var sh = sheet_(sheetName);
  var width = Math.max(sh.getLastColumn(), HEADERS[sheetName].length);
  var headers = sh.getRange(1, 1, 1, width).getValues()[0].map(function(h) { return String(h); });
  return rowToObject_(headers, sh.getRange(row, 1, 1, width).getValues()[0]);
}

function upsertObject_(sheetName, p) {
  var id = str_(p.id, 64) || uuid_();
  p.id = id;
  var row = findRow_(sheetName, id);
  if (row) updateRow_(sheetName, row, p);
  else appendObject_(sheetName, p);
  return {ok: true, data: getObject_(sheetName, id)};
}

function appendObject_(sheetName, p) {
  var headers = HEADERS[sheetName];
  var row = headers.map(function(h) { return p[h] !== undefined && p[h] !== null ? p[h] : ''; });
  sheet_(sheetName).appendRow(row);
  return {ok: true, data: p};
}

/** Menulis banyak baris dalam satu operasi: jauh lebih cepat dari appendRow berulang. */
function appendRows_(sheetName, objects) {
  if (!objects || !objects.length) return {ok: true, data: []};
  var headers = HEADERS[sheetName];
  var sh = sheet_(sheetName);
  var rows = objects.map(function(p) {
    return headers.map(function(h) { return p[h] !== undefined && p[h] !== null ? p[h] : ''; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  return {ok: true, data: objects};
}

function updateRow_(sheetName, row, p) {
  var headers = HEADERS[sheetName];
  var sh = sheet_(sheetName);
  var old = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  var next = headers.map(function(h, i) { return p[h] !== undefined && p[h] !== null ? p[h] : old[i]; });
  sh.getRange(row, 1, 1, headers.length).setValues([next]);
}

function deleteObject_(sheetName, id) {
  var row = findRow_(sheetName, id);
  if (!row) throw new Error('Data tidak ditemukan: ' + id);
  sheet_(sheetName).deleteRow(row);
  return {ok: true, data: {id: id}};
}

function findRow_(sheetName, id) {
  var sh = sheet_(sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var values = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 2;
  }
  return null;
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ada. Jalankan setupDatabase().');
  return sh;
}

function getSetting_(key) {
  var rows = listObjects_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === String(key)) return rows[i].value;
  }
  return '';
}

/* ---------------- Auth, lock, util ---------------- */

/**
 * Fail-closed: bila GAS_API_KEY belum diisi di Script Properties, semua request ditolak.
 * Versi sebelumnya melewatkan semua request ketika properti kosong (fail-open).
 */
function auth_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('GAS_API_KEY');
  if (!expected) throw new Error('Server belum dikonfigurasi: script property GAS_API_KEY kosong');
  var sent = String(key == null ? '' : key);
  if (sent.length !== String(expected).length) throw new Error('Unauthorized');
  var diff = 0;
  for (var i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ String(expected).charCodeAt(i);
  if (diff !== 0) throw new Error('Unauthorized');
}

/** Serialisasi tulis agar dua pesanan bersamaan tidak menimpa baris yang sama. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) throw new Error('Server sibuk, coba lagi sebentar');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function resolveStore_(storeIdOrSlug) {
  var key = str_(storeIdOrSlug, 64);
  var stores = listObjects_('Stores');
  var fallbackId = getSetting_('DEFAULT_STORE_ID');
  var match = null;
  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    if (key && (String(s.id) === key || String(s.slug) === key)) { match = s; break; }
    if (!match && fallbackId && String(s.id) === String(fallbackId)) match = s;
  }
  if (match) return match;
  if (stores.length) return stores[0];
  return {id: key || 'store-001', taxRate: 0, serviceRate: 0};
}

function resolveTableId_(storeId, tableCode, providedTableId) {
  if (providedTableId) return providedTableId;
  if (!tableCode) return '';
  var tables = listObjects_('Tables');
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    var sameStore = !storeId || String(t.storeId) === String(storeId);
    if (sameStore && String(t.code).toLowerCase() === String(tableCode).toLowerCase()) return t.id;
  }
  return '';
}

function normalizeMenu_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 120);
  if (!out.name) throw new Error('Nama menu wajib diisi');
  out.price = Math.max(0, Number(p.price) || 0);
  out.cost = Math.max(0, Number(p.cost) || 0);
  out.stock = Number(p.stock) || 0;
  out.active = p.active === false || p.active === 'false' ? false : true;
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

function isActive_(obj) {
  return obj && obj.active !== false && String(obj.active).toLowerCase() !== 'false';
}

function indexBy_(rows, key) {
  var out = {};
  for (var i = 0; i < rows.length; i++) out[String(rows[i][key])] = rows[i];
  return out;
}

function requireId_(id) {
  var clean = str_(id, 64);
  if (!clean) throw new Error('Parameter id wajib diisi');
  return clean;
}

function str_(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
}

function numberOr_(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function normalize_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function errorPayload_(err) {
  var message = String((err && err.message) || err || 'Unknown error');
  console.error('dispatch error: ' + message);
  return {ok: false, error: message};
}

function uuid_() { return Utilities.getUuid(); }
function iso_() { return new Date().toISOString(); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Seed ---------------- */

function seedDemoData_() {
  if (sheet_('Stores').getLastRow() > 1) return;

  appendObject_('Stores', {
    id: 'store-001', name: 'Kastriva Grand Dining', slug: 'kastriva',
    phone: '', address: '', taxRate: 0, serviceRate: 5, createdAt: iso_()
  });

  var tableCodes = ['meja-01','meja-02','meja-03','meja-04','meja-05','meja-06','meja-07','meja-08','meja-09','meja-10'];
  var seats = [2,2,4,4,6];
  appendRows_('Tables', tableCodes.map(function(code, i) {
    return {
      id: 'table-' + (i + 1), storeId: 'store-001', code: code,
      seats: seats[i % seats.length], status: 'AVAILABLE', createdAt: iso_()
    };
  }));

  var cats = ['Starter','Main Course','Beverage','Dessert'];
  appendRows_('Categories', cats.map(function(name, i) {
    return {id: 'cat-' + i, storeId: 'store-001', name: name, sortOrder: i, active: true};
  }));

  var menuRows = [
    ['m1','Main Course','Beef Tenderloin',185000,85000,18,'\uD83E\uDD69'],
    ['m2','Main Course','Truffle Pasta',125000,55000,24,'\uD83C\uDF5D'],
    ['m3','Main Course','Salmon Miso',165000,70000,12,'\uD83C\uDF63'],
    ['m4','Starter','Garden Salad',65000,25000,30,'\uD83E\uDD57'],
    ['m5','Starter','Mushroom Soup',55000,18000,25,'\uD83C\uDF72'],
    ['m6','Beverage','Signature Mocktail',48000,12000,40,'\uD83C\uDF79'],
    ['m7','Beverage','Espresso Martini',85000,25000,16,'\uD83C\uDF78'],
    ['m8','Dessert','Tiramisu',58000,20000,20,'\uD83C\uDF70'],
    ['m9','Dessert','Cheesecake',52000,18000,14,'\uD83C\uDF6E']
  ];
  appendRows_('Menu', menuRows.map(function(m) {
    return {
      id: m[0], storeId: 'store-001', categoryId: '', name: m[2], description: '',
      price: m[3], cost: m[4], stock: m[5], active: true, emoji: m[6], imageUrl: '',
      createdAt: iso_(), updatedAt: iso_()
    };
  }));

  appendObject_('Settings', {key: 'DEFAULT_STORE_ID', value: 'store-001', updatedAt: iso_()});
}
