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
 *
 * Flag `_admin`: hanya boleh disetel oleh proxy Next.js (server), bukan browser.
 * Bila true, payload createOrder boleh membawa `discount`, dan action admin tersedia.
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

// Kolom baru Orders (paymentMethod, paidAmount, changeAmount) sengaja diurutan
// terakhir: setupDatabase menambahkan kolom yang hilang di belakang, jadi database
// lama maupun baru selalu punya urutan kolom yang cocok dengan daftar ini.
var HEADERS = {
  Stores: ['id','name','slug','phone','address','taxRate','serviceRate','createdAt'],
  Tables: ['id','storeId','code','seats','status','createdAt'],
  Categories: ['id','storeId','name','sortOrder','active'],
  Menu: ['id','storeId','categoryId','name','description','price','cost','stock','active','emoji','imageUrl','createdAt','updatedAt'],
  Orders: ['id','storeId','tableId','tableCode','customerName','phone','channel','status','subtotal','discount','tax','service','total','note','createdAt','updatedAt','paymentMethod','paidAmount','changeAmount'],
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
var PAYMENT_METHODS = ['CASH','QRIS','DEBIT','EWALLET','TRANSFER'];
var RESERVATION_STATUSES = ['BOOKED','CONFIRMED','SEATED','CANCELLED'];
// Sheet yang boleh dihapus barisnya lewat action deleteData.
var DELETABLE_SHEETS = {Menu: true, Tables: true, Inventory: true, Reservations: true, Customers: true, Staff: true};
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
      return {ok: true, data: listMenuForClient_()};
    case 'getSettings':
      return {ok: true, data: getPublicSettings_()};
    case 'getOrders':
      return {ok: true, data: listOrders_(p)};
    case 'getOrder':
      return {ok: true, data: getOrderWithItems_(requireId_(p.id))};
    case 'createOrder':
      return withLock_(function() { return createOrder_(p); });
    case 'updateOrderStatus':
      return withLock_(function() { return updateOrderStatus_(p); });
    case 'payOrder':
      return withLock_(function() { return payOrder_(p); });
    case 'getTables':
      return {ok: true, data: listObjects_('Tables')};
    case 'getCustomers':
      return {ok: true, data: listObjects_('Customers')};
    case 'getInventory':
      return {ok: true, data: listObjects_('Inventory')};
    case 'getReservations':
      return {ok: true, data: listObjects_('Reservations')};
    case 'getStaff':
      return {ok: true, data: listObjects_('Staff').map(stripPin_)};
    case 'getCategories':
      return {ok: true, data: listObjects_('Categories')};
    case 'getReport':
      return {ok: true, data: getReport_(p)};
    case 'saveMenu':
      return withLock_(function() { return upsertObject_('Menu', normalizeMenu_(p)); });
    case 'saveCategory':
      return withLock_(function() { return upsertObject_('Categories', normalizeCategory_(p)); });
    case 'saveTable':
      return withLock_(function() { return upsertObject_('Tables', normalizeTable_(p)); });
    case 'saveInventory':
      return withLock_(function() { return upsertObject_('Inventory', normalizeInventory_(p)); });
    case 'saveReservation':
      return withLock_(function() { return upsertObject_('Reservations', normalizeReservation_(p)); });
    case 'saveCustomer':
      return withLock_(function() { return upsertObject_('Customers', normalizeCustomer_(p)); });
    case 'saveStaff':
      return withLock_(function() { return upsertObject_('Staff', normalizeStaff_(p)); });
    case 'saveSettings':
      return withLock_(function() { return saveSettings_(p); });
    case 'deleteData':
      return withLock_(function() { return deleteData_(p); });
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
 * Diskon hanya dihormati bila payload ditandai `_admin` oleh proxy server.
 * Stok menu yang terlacak otomatis berkurang; item dengan stok kurang ditolak.
 */
function createOrder_(p) {
  var items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) throw new Error('Pesanan tidak boleh kosong');
  if (items.length > 60) throw new Error('Terlalu banyak item dalam satu pesanan');

  var trusted = p._admin === true;
  var store = resolveStore_(p.storeId);
  var menuRows = listObjects_('Menu');
  var menuById = indexBy_(menuRows, 'id');

  var subtotal = 0;
  var stockUsage = {}; // menuItemId -> qty total dalam pesanan ini
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
    stockUsage[menuItemId] = (stockUsage[menuItemId] || 0) + qty;
    return {
      id: uuid_(),
      menuItemId: menuItemId,
      name: String(menuItem.name || ''),
      price: price,
      qty: qty,
      note: str_(raw.note, 200)
    };
  });

  // Stok terlacak: kolom stock terisi angka. Kosong berarti tidak dipantau.
  var stockDecimals = {};
  Object.keys(stockUsage).forEach(function(menuItemId) {
    var menuItem = menuById[menuItemId];
    var stock = menuItem.stock;
    if (stock === '' || stock === null || stock === undefined || !isFinite(Number(stock))) return;
    var available = Math.floor(Number(stock));
    var needed = stockUsage[menuItemId];
    if (available < needed) {
      throw new Error('Stok tidak cukup untuk ' + menuItem.name + ' (sisa ' + Math.max(available, 0) + ')');
    }
    stockDecimals[menuItemId] = available - needed;
  });

  var taxRate = numberOr_(store.taxRate, 0);
  var serviceRate = numberOr_(store.serviceRate, 0);
  var requestedDiscount = trusted ? Math.round(Number(p.discount) || 0) : 0;
  var discount = Math.min(Math.max(requestedDiscount, 0), subtotal);
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
    updatedAt: iso_(),
    paymentMethod: '',
    paidAmount: '',
    changeAmount: ''
  };

  appendObject_('Orders', order);
  appendRows_('OrderItems', cleanItems.map(function(item) {
    return Object.assign({orderId: order.id}, item);
  }));

  // Kurangi stok setelah order benar-benar tersimpan.
  Object.keys(stockDecimals).forEach(function(menuItemId) {
    var row = findRow_('Menu', menuItemId);
    if (!row) return;
    var menuItem = menuById[menuItemId];
    menuItem.stock = stockDecimals[menuItemId];
    menuItem.updatedAt = iso_();
    updateRow_('Menu', row, menuItem);
  });

  if (order.phone) upsertCustomer_(order);

  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: order.storeId,
    userId: trusted ? 'staff' : 'customer',
    action: 'CREATE',
    entity: 'ORDER',
    entityId: order.id,
    detail: JSON.stringify({channel: order.channel, table: order.tableCode, total: order.total, discount: order.discount}),
    createdAt: iso_()
  });

  return {ok: true, data: Object.assign({}, order, {items: cleanItems})};
}

/**
 * Mencatat pembayaran dan menandai order PAID.
 * Tunai wajib dibayar >= total; metode non-tunai selalu dianggap pas.
 */
function payOrder_(p) {
  var id = requireId_(p.id);
  var method = String(str_(p.method, 16)).toUpperCase();
  if (PAYMENT_METHODS.indexOf(method) === -1) throw new Error('Metode pembayaran tidak valid');

  var order = getObject_('Orders', id);
  if (!order) throw new Error('Order tidak ditemukan');
  if (String(order.status) === 'CANCELLED') throw new Error('Order sudah dibatalkan');

  var total = Math.round(Number(order.total) || 0);
  var paid = Math.round(Number(p.paidAmount) || 0);
  if (method === 'CASH') {
    if (paid < total) throw new Error('Uang yang dibayar kurang dari total');
  } else {
    paid = total;
  }

  order.paymentMethod = method;
  order.paidAmount = paid;
  order.changeAmount = method === 'CASH' ? paid - total : 0;
  order.status = 'PAID';
  order.updatedAt = iso_();
  var row = findRow_('Orders', id);
  if (row) updateRow_('Orders', row, order);

  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: order.storeId,
    userId: str_(p.userId, 64) || 'staff',
    action: 'PAYMENT',
    entity: 'ORDER',
    entityId: id,
    detail: JSON.stringify({method: method, total: total, paid: paid, change: order.changeAmount}),
    createdAt: iso_()
  });

  return {ok: true, data: order};
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
  var withItems = p && p.withItems === true;
  var rows = listObjects_('Orders');
  if (storeId) rows = rows.filter(function(o) { return String(o.storeId) === storeId; });
  if (status && ORDER_STATUSES.indexOf(status) !== -1) {
    rows = rows.filter(function(o) { return String(o.status).toUpperCase() === status; });
  }
  rows.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  rows = rows.slice(0, limit);

  // Sambungkan item dalam satu pembacaan sheet (bukan satu panggilan per order).
  if (withItems && rows.length) {
    var byOrder = {};
    listObjects_('OrderItems').forEach(function(item) {
      var key = String(item.orderId);
      (byOrder[key] = byOrder[key] || []).push(item);
    });
    rows = rows.map(function(o) {
      o.items = byOrder[String(o.id)] || [];
      return o;
    });
  }
  return rows;
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

/* ---------------- Laporan ---------------- */

/**
 * Rekap penjualan untuk dashboard & halaman laporan.
 * range: 'today' | '7d' | '30d'. Order CANCELLED dikecualikan dari angka penjualan.
 */
function getReport_(p) {
  var range = String(str_(p && p.range, 8) || 'today').toLowerCase();
  var now = new Date();
  var tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'Asia/Jakarta';
  var todayKey = formatDateKey_(now, tz);

  var orders = listObjects_('Orders').filter(function(o) {
    return String(o.status).toUpperCase() !== 'CANCELLED';
  });

  var inRange;
  if (range === '7d' || range === '30d') {
    var days = range === '7d' ? 7 : 30;
    var since = now.getTime() - days * 24 * 3600 * 1000;
    inRange = orders.filter(function(o) {
      var t = Date.parse(String(o.createdAt));
      return isFinite(t) && t >= since;
    });
  } else {
    inRange = orders.filter(function(o) {
      return dateKeyOf_(o.createdAt, tz) === todayKey;
    });
  }

  var grossSales = 0, discountTotal = 0, taxTotal = 0, serviceTotal = 0, netSales = 0;
  var paymentMix = {};
  var statusCount = {};
  var byDay = {};
  var orderIds = {};

  inRange.forEach(function(o) {
    var subtotal = Number(o.subtotal) || 0;
    var total = Number(o.total) || 0;
    grossSales += subtotal;
    discountTotal += Number(o.discount) || 0;
    taxTotal += Number(o.tax) || 0;
    serviceTotal += Number(o.service) || 0;
    netSales += total;
    orderIds[String(o.id)] = true;
    statusCount[String(o.status)] = (statusCount[String(o.status)] || 0) + 1;

    if (String(o.status).toUpperCase() === 'PAID') {
      var method = String(o.paymentMethod || 'UNPAID-METHOD');
      paymentMix[method] = (paymentMix[method] || 0) + total;
    }

    var key = range === '7d' || range === '30d'
      ? dateKeyOf_(o.createdAt, tz)
      : todayKey;
    byDay[key] = (byDay[key] || 0) + total;
  });

  var topMap = {};
  if (Object.keys(orderIds).length) {
    listObjects_('OrderItems').forEach(function(item) {
      if (!orderIds[String(item.orderId)]) return;
      var name = String(item.name || item.menuItemId);
      var entry = topMap[name] = topMap[name] || {name: name, qty: 0, revenue: 0};
      entry.qty += Number(item.qty) || 0;
      entry.revenue += (Number(item.price) || 0) * (Number(item.qty) || 0);
    });
  }
  var topItems = Object.keys(topMap).map(function(k) { return topMap[k]; });
  topItems.sort(function(a, b) { return b.qty - a.qty; });
  topItems = topItems.slice(0, 10);

  var dayCount = range === '30d' ? 30 : range === '7d' ? 7 : 1;
  var series = [];
  for (var i = dayCount - 1; i >= 0; i--) {
    var key2 = formatDateKey_(new Date(now.getTime() - i * 24 * 3600 * 1000), tz);
    series.push({date: key2, total: byDay[key2] || 0});
  }

  var count = inRange.length;
  return {
    range: range === '7d' ? '7d' : range === '30d' ? '30d' : 'today',
    orderCount: count,
    grossSales: grossSales,
    discount: discountTotal,
    tax: taxTotal,
    service: serviceTotal,
    netSales: netSales,
    avgCheck: count ? Math.round(netSales / count) : 0,
    paymentMix: paymentMix,
    statusCount: statusCount,
    topItems: topItems,
    series: series
  };
}

function dateKeyOf_(value, tz) {
  var t = Date.parse(String(value));
  if (!isFinite(t)) return '';
  return formatDateKey_(new Date(t), tz);
}

function formatDateKey_(date, tz) {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  }
  return date.toISOString().slice(0, 10);
}

/* ---------------- Pengaturan ---------------- */

/** Subset pengaturan yang aman untuk dikonsumsi halaman publik. */
function getPublicSettings_() {
  var store = resolveStore_('');
  return {
    storeId: store.id || '',
    storeName: String(store.name || ''),
    phone: String(store.phone || ''),
    address: String(store.address || ''),
    taxRate: numberOr_(store.taxRate, 0),
    serviceRate: numberOr_(store.serviceRate, 0)
  };
}

function saveSettings_(p) {
  var store = resolveStore_(str_(p.storeId, 64));
  var row = findRow_('Stores', store.id);
  var next = {
    id: store.id,
    name: str_(p.name, 120) || String(store.name || ''),
    slug: String(store.slug || ''),
    phone: str_(p.phone, 20).replace(/[^0-9+]/g, ''),
    address: str_(p.address, 300),
    taxRate: p.taxRate === undefined || p.taxRate === '' ? numberOr_(store.taxRate, 0) : Math.max(0, Number(p.taxRate) || 0),
    serviceRate: p.serviceRate === undefined || p.serviceRate === '' ? numberOr_(store.serviceRate, 0) : Math.max(0, Number(p.serviceRate) || 0),
    createdAt: store.createdAt || iso_()
  };
  if (row) updateRow_('Stores', row, next);
  else appendObject_('Stores', next);

  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: next.id,
    userId: str_(p.userId, 64) || 'staff',
    action: 'UPDATE',
    entity: 'SETTINGS',
    entityId: next.id,
    detail: JSON.stringify({name: next.name, taxRate: next.taxRate, serviceRate: next.serviceRate}),
    createdAt: iso_()
  });
  return {ok: true, data: next};
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

/** Menu siap pakai client: kategori berupa nama (bukan id), hanya yang aktif. */
function listMenuForClient_() {
  var catById = indexBy_(listObjects_('Categories'), 'id');
  return listObjects_('Menu').filter(isActive_).map(function(m) {
    var out = Object.assign({}, m);
    var cat = catById[String(m.categoryId)];
    out.category = cat ? String(cat.name) : '';
    return out;
  });
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

function deleteData_(p) {
  var sheetName = String(str_(p.sheet, 32));
  if (!DELETABLE_SHEETS[sheetName]) throw new Error('Sheet tidak boleh dihapus lewat API: ' + sheetName);
  var result = deleteObject_(sheetName, requireId_(p.id));
  appendObject_('AuditLog', {
    id: uuid_(),
    storeId: str_(p.storeId, 64),
    userId: str_(p.userId, 64) || 'staff',
    action: 'DELETE',
    entity: sheetName.toUpperCase(),
    entityId: String(result.data.id),
    detail: '',
    createdAt: iso_()
  });
  return result;
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

/* ---------------- Normalizer ---------------- */

function normalizeMenu_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 120);
  if (!out.name) throw new Error('Nama menu wajib diisi');
  out.price = Math.max(0, Number(p.price) || 0);
  out.cost = Math.max(0, Number(p.cost) || 0);
  out.stock = p.stock === '' || p.stock === null || p.stock === undefined ? '' : Number(p.stock) || 0;
  out.categoryId = str_(p.categoryId, 64);
  out.emoji = str_(p.emoji, 8);
  out.description = str_(p.description, 300);
  out.active = p.active === false || p.active === 'false' ? false : true;
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeCategory_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 60);
  if (!out.name) throw new Error('Nama kategori wajib diisi');
  out.sortOrder = Number(p.sortOrder) || 99;
  out.active = p.active === false || p.active === 'false' ? false : true;
  return out;
}

function normalizeTable_(p) {
  var out = Object.assign({}, p);
  out.code = str_(p.code, 32).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out.code) throw new Error('Kode meja wajib diisi');
  out.seats = Math.max(1, Math.floor(Number(p.seats)) || 4);
  var status = String(str_(p.status, 16)).toUpperCase();
  out.status = ['AVAILABLE', 'OCCUPIED', 'RESERVED'].indexOf(status) !== -1 ? status : 'AVAILABLE';
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeInventory_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 120);
  if (!out.name) throw new Error('Nama bahan wajib diisi');
  out.unit = str_(p.unit, 16) || 'pcs';
  out.stock = Number(p.stock) || 0;
  out.parLevel = Number(p.parLevel) || 0;
  out.cost = Math.max(0, Number(p.cost) || 0);
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeReservation_(p) {
  var out = Object.assign({}, p);
  out.guestName = str_(p.guestName, 80);
  if (!out.guestName) throw new Error('Nama tamu wajib diisi');
  out.phone = str_(p.phone, 20).replace(/[^0-9+]/g, '');
  out.partySize = Math.max(1, Math.floor(Number(p.partySize)) || 2);
  out.reservedAt = str_(p.reservedAt, 32);
  var status = String(str_(p.status, 16)).toUpperCase();
  out.status = RESERVATION_STATUSES.indexOf(status) !== -1 ? status : 'BOOKED';
  out.note = str_(p.note, 300);
  if (!p.id) out.createdAt = iso_();
  return out;
}

function normalizeCustomer_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 80);
  if (!out.name) throw new Error('Nama pelanggan wajib diisi');
  out.phone = str_(p.phone, 20).replace(/[^0-9+]/g, '');
  var tier = String(str_(p.tier, 16)).toUpperCase();
  out.tier = ['MEMBER', 'SILVER', 'GOLD', 'PLATINUM'].indexOf(tier) !== -1 ? tier : 'MEMBER';
  out.updatedAt = iso_();
  if (!p.id) out.createdAt = iso_();
  return out;
}

/**
 * PIN kasir disimpan sebagai hash SHA-256 + prefix, tidak pernah sebagai teks polos.
 * Kosong pada update berarti PIN lama dipertahankan.
 */
function hashPin_(pin) {
  var digest = Utilities.computeDigest('kastriva-pin:' + String(pin), Utilities.Charset.UTF_8, Utilities.DigestAlgorithm.SHA_256);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var v = (digest[i] + 256) % 256;
    hex += ('0' + v.toString(16)).slice(-2);
  }
  return 'sha256$' + hex;
}

function normalizeStaff_(p) {
  var out = Object.assign({}, p);
  out.name = str_(p.name, 80);
  if (!out.name) throw new Error('Nama staff wajib diisi');
  out.role = str_(p.role, 32) || 'Kasir';
  var pin = str_(p.pin, 12);
  if (pin) {
    if (!/^[0-9]{4,8}$/.test(pin)) throw new Error('PIN harus 4-8 digit angka');
    out.pinHash = hashPin_(pin);
  } else if (p.pinHash) {
    out.pinHash = str_(p.pinHash, 128);
  }
  out.active = p.active === false || p.active === 'false' ? false : true;
  if (!p.id) out.createdAt = iso_();
  delete out.pin; // PIN polos tidak boleh tersimpan
  return out;
}

function stripPin_(staff) {
  var out = Object.assign({}, staff);
  delete out.pinHash;
  return out;
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
  return {id: key || 'store-001', name: key || 'Store', slug: '', phone: '', address: '', taxRate: 0, serviceRate: 0};
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
  var catId = {'Starter': 'cat-0', 'Main Course': 'cat-1', 'Beverage': 'cat-2', 'Dessert': 'cat-3'};

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
      id: m[0], storeId: 'store-001', categoryId: catId[m[1]], name: m[2], description: '',
      price: m[3], cost: m[4], stock: m[5], active: true, emoji: m[6], imageUrl: '',
      createdAt: iso_(), updatedAt: iso_()
    };
  }));

  appendObject_('Settings', {key: 'DEFAULT_STORE_ID', value: 'store-001', updatedAt: iso_()});
}
