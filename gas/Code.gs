/**
 * Kastriva Smart Kasir - Google Apps Script Backend
 * Database: Google Sheets
 *
 * 1. Create a Google Spreadsheet.
 * 2. Extensions > Apps Script.
 * 3. Put this Code.gs in the Apps Script project.
 * 4. Run setupDatabase() once and authorize.
 * 5. Deploy > New deployment > Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6. Put the deployment URL in Vercel as GAS_WEB_APP_URL.
 * 7. Put the same API key in Script Properties (GAS_API_KEY)
 *    and Vercel environment variable GAS_API_KEY.
 */

const SHEETS = {
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

const HEADERS = {
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

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function(k) {
    const name = SHEETS[k];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(HEADERS[name]);
    else {
      const current = sh.getRange(1,1,1,HEADERS[name].length).getValues()[0];
      if (current.join('|') !== HEADERS[name].join('|')) {
        sh.clear();
        sh.appendRow(HEADERS[name]);
      }
    }
    sh.setFrozenRows(1);
  });
  seedDemoData_(ss);
  return json_({ok:true,message:'Database initialized'});
}

function doGet(e) {
  try {
    auth_(e && e.parameter ? e.parameter.key : '');
    const action = (e && e.parameter && e.parameter.action) || 'health';
    const payload = e && e.parameter && e.parameter.payload
      ? JSON.parse(e.parameter.payload) : {};
    return json_(dispatch_(action, payload));
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents) : {};
    auth_(body.key);
    return json_(dispatch_(body.action || 'health', body.payload || {}));
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function dispatch_(action, p) {
  switch (action) {
    case 'health': return {ok:true,service:'Kastriva GAS',time:new Date().toISOString()};
    case 'getMenu': return {ok:true,data:listObjects_('Menu').filter(function(x){return x.active !== false && x.active !== 'false';})};
    case 'getOrders': return {ok:true,data:listObjects_('Orders').sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));})};
    case 'getOrder': return {ok:true,data:getObject_('Orders',p.id)};
    case 'createOrder': return createOrder_(p);
    case 'updateOrderStatus': return updateOrderStatus_(p);
    case 'getTables': return {ok:true,data:listObjects_('Tables')};
    case 'getCustomers': return {ok:true,data:listObjects_('Customers')};
    case 'getInventory': return {ok:true,data:listObjects_('Inventory')};
    case 'getReservations': return {ok:true,data:listObjects_('Reservations')};
    case 'saveMenu': return upsertObject_('Menu',p);
    case 'saveTable': return upsertObject_('Tables',p);
    case 'saveInventory': return upsertObject_('Inventory',p);
    case 'saveReservation': return upsertObject_('Reservations',p);
    case 'deleteMenu': return deleteObject_('Menu',p.id);
    case 'audit': return appendObject_('AuditLog',Object.assign({},p,{id:uuid_(),createdAt:iso_()}));
    default: throw new Error('Unknown action: '+action);
  }
}

function createOrder_(p) {
  if (!p.storeId) p.storeId = getSetting_('DEFAULT_STORE_ID') || 'kastriva';
  if (!p.id) p.id = 'ORD-'+Utilities.getUuid().slice(0,8).toUpperCase();
  p.status = p.status || 'NEW';
  p.channel = p.channel || 'QR';
  p.createdAt = p.createdAt || iso_();
  p.updatedAt = iso_();

  const items = Array.isArray(p.items) ? p.items : [];
  let subtotal = 0;
  items.forEach(function(i) {
    const qty = Number(i.qty || 0);
    const price = Number(i.price || 0);
    subtotal += qty * price;
  });
  p.subtotal = Number(p.subtotal || subtotal);
  p.discount = Number(p.discount || 0);
  p.tax = Number(p.tax || 0);
  p.service = Number(p.service || 0);
  p.total = Number(p.total || (p.subtotal - p.discount + p.tax + p.service));

  const clean = {
    id:p.id,storeId:p.storeId,tableId:p.tableId||'',tableCode:p.tableCode||'',
    customerName:p.customerName||'',phone:p.phone||'',channel:p.channel,status:p.status,
    subtotal:p.subtotal,discount:p.discount,tax:p.tax,service:p.service,total:p.total,
    note:p.note||'',createdAt:p.createdAt,updatedAt:p.updatedAt
  };
  appendObject_('Orders',clean);

  items.forEach(function(i){
    appendObject_('OrderItems',{
      id:uuid_(),orderId:p.id,menuItemId:i.menuItemId||i.id||'',
      name:i.name||'',price:Number(i.price||0),qty:Number(i.qty||1),note:i.note||''
    });
  });

  if (p.customerName || p.phone) {
    upsertCustomer_(p);
  }

  appendObject_('AuditLog',{
    id:uuid_(),storeId:p.storeId,userId:p.userId||'customer',
    action:'CREATE',entity:'ORDER',entityId:p.id,
    detail:JSON.stringify({channel:p.channel,table:p.tableCode,total:p.total}),createdAt:iso_()
  });

  return {ok:true,data:getObject_('Orders',p.id)};
}

function updateOrderStatus_(p) {
  if (!p.id || !p.status) throw new Error('id and status are required');
  const row = findRow_('Orders',p.id);
  if (!row) throw new Error('Order not found');
  const obj = getObject_('Orders',p.id);
  obj.status = p.status;
  obj.updatedAt = iso_();
  updateRow_('Orders',row,obj);
  appendObject_('AuditLog',{
    id:uuid_(),storeId:obj.storeId,userId:p.userId||'staff',
    action:'STATUS',entity:'ORDER',entityId:p.id,
    detail:JSON.stringify({status:p.status}),createdAt:iso_()
  });
  return {ok:true,data:obj};
}

function upsertCustomer_(p) {
  const sh = sheet_('Customers');
  const rows = listObjects_('Customers');
  const found = rows.find(function(x){
    return p.phone && x.phone && String(x.phone) === String(p.phone);
  });
  if (found) {
    found.visits = Number(found.visits||0)+1;
    found.totalSpend = Number(found.totalSpend||0)+Number(p.total||0);
    found.updatedAt = iso_();
    updateRow_('Customers',findRow_('Customers',found.id),found);
  } else {
    appendObject_('Customers',{
      id:uuid_(),storeId:p.storeId,name:p.customerName||'Guest',phone:p.phone||'',
      email:'',tier:'MEMBER',visits:1,totalSpend:Number(p.total||0),
      preferences:'{}',createdAt:iso_(),updatedAt:iso_()
    });
  }
}

function listObjects_(sheetName) {
  const sh = sheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(function(r){return r.join('') !== '';}).map(function(r){
    const o = {};
    headers.forEach(function(h,i){o[h]=normalize_(r[i]);});
    return o;
  });
}

function getObject_(sheetName,id) {
  if (!id) return null;
  const row = findRow_(sheetName,id);
  if (!row) return null;
  const headers = HEADERS[sheetName];
  const values = sheet_(sheetName).getRange(row,1,1,headers.length).getValues()[0];
  const o={}; headers.forEach(function(h,i){o[h]=normalize_(values[i]);}); return o;
}

function upsertObject_(sheetName,p) {
  const id = p.id || uuid_();
  p.id = id;
  const row = findRow_(sheetName,id);
  if (row) updateRow_(sheetName,row,p); else appendObject_(sheetName,p);
  return {ok:true,data:getObject_(sheetName,id)};
}

function appendObject_(sheetName,p) {
  const headers = HEADERS[sheetName];
  const row = headers.map(function(h){return p[h] !== undefined ? p[h] : '';});
  sheet_(sheetName).appendRow(row);
  return {ok:true,data:p};
}

function updateRow_(sheetName,row,p) {
  const headers=HEADERS[sheetName];
  const sh=sheet_(sheetName);
  const old=sh.getRange(row,1,1,headers.length).getValues()[0];
  const next=headers.map(function(h,i){return p[h] !== undefined ? p[h] : old[i];});
  sh.getRange(row,1,1,headers.length).setValues([next]);
}

function deleteObject_(sheetName,id) {
  const row=findRow_(sheetName,id);
  if (!row) return {ok:false,error:'Not found'};
  sheet_(sheetName).deleteRow(row);
  return {ok:true};
}

function findRow_(sheetName,id) {
  const sh=sheet_(sheetName);
  if (sh.getLastRow()<2) return null;
  const vals=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
  for (let i=0;i<vals.length;i++) if (String(vals[i][0])===String(id)) return i+2;
  return null;
}

function sheet_(name) {
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: '+name+'. Run setupDatabase().');
  return sh;
}

function getSetting_(key) {
  const rows=listObjects_('Settings');
  const found=rows.find(function(x){return x.key===key;});
  return found ? found.value : '';
}

function auth_(key) {
  const expected=PropertiesService.getScriptProperties().getProperty('GAS_API_KEY');
  if (expected && String(key||'') !== String(expected)) throw new Error('Unauthorized');
}

function seedDemoData_(ss) {
  if (sheet_('Stores').getLastRow()>1) return;
  appendObject_('Stores',{id:'store-001',name:'Kastriva Grand Dining',slug:'kastriva',phone:'',address:'',taxRate:11,serviceRate:5,createdAt:iso_()});
  ['T-01','T-02','T-03','T-04','T-05','T-06','T-07','T-08','T-09','T-10'].forEach(function(code,i){
    appendObject_('Tables',{id:'table-'+(i+1),storeId:'store-001',code:code,seats:[2,2,4,4,6][i%5],status:'AVAILABLE',createdAt:iso_()});
  });
  const cats=['Starter','Main Course','Beverage','Dessert'];
  cats.forEach(function(c,i){appendObject_('Categories',{id:'cat-'+i,storeId:'store-001',name:c,sortOrder:i,active:true});});
  const menus=[
    ['m1','Main Course','Beef Tenderloin',185000,85000,18,'🥩'],
    ['m2','Main Course','Truffle Pasta',125000,55000,24,'🍝'],
    ['m3','Main Course','Salmon Miso',165000,70000,12,'🍣'],
    ['m4','Starter','Garden Salad',65000,25000,30,'🥗'],
    ['m5','Starter','Mushroom Soup',55000,18000,25,'🍲'],
    ['m6','Beverage','Signature Mocktail',48000,12000,40,'🍹'],
    ['m7','Beverage','Espresso Martini',85000,25000,16,'🍸'],
    ['m8','Dessert','Tiramisu',58000,20000,20,'🍰'],
    ['m9','Dessert','Cheesecake',52000,18000,14,'🍮']
  ];
  menus.forEach(function(m){
    appendObject_('Menu',{id:m[0],storeId:'store-001',categoryId:'',name:m[2],description:'',price:m[3],cost:m[4],stock:m[5],active:true,emoji:m[6],imageUrl:'',createdAt:iso_(),updatedAt:iso_()});
  });
  appendObject_('Settings',{key:'DEFAULT_STORE_ID',value:'store-001',updatedAt:iso_()});
}

function normalize_(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}
function uuid_(){return Utilities.getUuid();}
function iso_(){return new Date().toISOString();}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
