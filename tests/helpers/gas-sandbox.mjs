/**
 * Stub Google Apps Script untuk menguji gas/Code.gs di Node.
 * Menyediakan SpreadsheetApp, PropertiesService, LockService, Utilities, ContentService
 * secukupnya agar seluruh alur backend bisa dijalankan tanpa Google.
 */
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CODE_PATH = join(ROOT, "gas", "Code.gs");

function makeSheet(name) {
  return {
    name,
    rows: [],
    frozen: 0,
    getLastRow() {
      return this.rows.length;
    },
    getLastColumn() {
      return this.rows.length ? this.rows[0].length : 0;
    },
    appendRow(row) {
      this.rows.push(row.slice());
    },
    setFrozenRows(n) {
      this.frozen = n;
    },
    deleteRow(row) {
      this.rows.splice(row - 1, 1);
    },
    getDataRange() {
      return {getValues: () => this.rows.map(r => r.slice())};
    },
    getRange(row, col, numRows, numCols) {
      const rows = this.rows;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = rows[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] === undefined ? "" : src[col - 1 + c]);
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            const target = row - 1 + r;
            while (rows.length <= target) rows.push([]);
            for (let c = 0; c < values[r].length; c++) rows[target][col - 1 + c] = values[r][c];
          }
        }
      };
    }
  };
}

/** Membuat sandbox baru berisi seluruh fungsi Code.gs. */
export function createGasSandbox({apiKey = "rahasia-panjang"} = {}) {
  const sheets = new Map();
  const state = {scriptProps: apiKey ? {GAS_API_KEY: apiKey} : {}, lockHeld: false, uuid: 0};

  const sandbox = {
    console: {log() {}, error() {}, warn() {}},
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: name => sheets.get(name) || null,
        insertSheet: name => {
          const sh = makeSheet(name);
          sheets.set(name, sh);
          return sh;
        }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => (key in state.scriptProps ? state.scriptProps[key] : null)
      })
    },
    Utilities: {getUuid: () => `uuid-${++state.uuid}`},
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (state.lockHeld) return false;
          state.lockHeld = true;
          return true;
        },
        releaseLock() {
          state.lockHeld = false;
        }
      })
    },
    ContentService: {
      MimeType: {JSON: "application/json"},
      createTextOutput: text => ({
        payload: text,
        setMimeType() {
          return this;
        }
      })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(readFileSync(CODE_PATH, "utf8"), sandbox, {filename: "Code.gs"});

  return {
    gas: sandbox,
    sheets,
    state,
    setApiKey(value) {
      state.scriptProps = value ? {GAS_API_KEY: value} : {};
    },
    holdLock(held) {
      state.lockHeld = held;
    },
    post(body) {
      return JSON.parse(sandbox.doPost({postData: {contents: JSON.stringify(body)}}).payload);
    },
    get(parameter) {
      return JSON.parse(sandbox.doGet({parameter}).payload);
    },
    call(action, payload, key = apiKey) {
      return this.post({key, action, payload});
    }
  };
}
