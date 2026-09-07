/**
 * FreeAds Post - Google Sheets Access Layer
 * 
 * Provides an abstract, safe CRUD interface over Google Sheets.
 * Enforces transactional locking via LockService to prevent race conditions during write operations.
 * Operates purely on column headers (Row 1) and stable business IDs.
 */

const Sheets = (function() {
  let cachedSpreadsheet = null;
  const cachedSheets = {};
  const readCache = {};

  /**
   * Clears the in-execution sheet read cache.
   * Can clear a specific sheet or all sheets.
   */
  function clearCache(sheetName = null) {
    if (sheetName) {
      delete readCache[sheetName];
    } else {
      for (const k of Object.keys(readCache)) {
        delete readCache[k];
      }
    }
  }

  /**
   * Retrieves the target Google Spreadsheet instance.
   * Memoizes the instance across the execution lifecycle to avoid redundant openById() RPCs.
   */
  function getSpreadsheet() {
    if (cachedSpreadsheet) {
      return cachedSpreadsheet;
    }
    const spreadsheetId = Config.get('SPREADSHEET_ID');
    if (spreadsheetId) {
      cachedSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
      return cachedSpreadsheet;
    }
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      cachedSpreadsheet = active;
      return cachedSpreadsheet;
    }
    throw new Error('Spreadsheet not configured. Set SPREADSHEET_ID in Script Properties.');
  }

  /**
   * Retrieves a worksheet by name.
   * Memoizes sheet instances to avoid repeated getSheetByName() calls.
   */
  function getSheet(sheetName) {
    if (cachedSheets[sheetName]) {
      return cachedSheets[sheetName];
    }
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet.`);
    }
    cachedSheets[sheetName] = sheet;
    return sheet;
  }

  /**
   * Executes a callback function inside a transactional script lock.
   */
  function withLock(callback, timeoutMs = null) {
    const lock = LockService.getScriptLock();
    const waitTime = timeoutMs || Number(Config.get('LOCK_TIMEOUT_MS', 15000));
    const hasLock = lock.tryLock(waitTime);

    if (!hasLock) {
      throw new Error('Database is currently busy. Please try again.');
    }

    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Neutralizes formula / CSV injection vulnerabilities.
   * If a string value starts with =, +, -, @, \t, or \r, it is prefixed with an apostrophe (').
   * In Google Sheets and Excel, a leading apostrophe instructs the engine to treat the cell purely
   * as literal text, preventing formula and macro execution.
   */
  function sanitizeCellValue(val) {
    if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
      return "'" + val;
    }
    return val;
  }

  /**
   * Unescapes sanitized formula cell values when read from sheets.
   */
  function unescapeCellValue(val) {
    if (typeof val === 'string' && val.startsWith("'") && /^[=+\-@\t\r]/.test(val.substring(1))) {
      return val.substring(1);
    }
    return val;
  }

  /**
   * Reads all records from a worksheet as an array of JavaScript objects.
   * Row 1 must contain column headers.
   * Utilizes in-execution readCache to prevent duplicate sheet range reads.
   */
  function getAll(sheetName) {
    if (readCache[sheetName]) {
      return readCache[sheetName].slice();
    }

    const sheet = getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1 || lastCol < 1) {
      readCache[sheetName] = [];
      return [];
    }

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values[0];
    const records = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const record = { _rowNumber: i + 1 };
      let hasData = false;

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header) {
          record[header] = unescapeCellValue(row[j]);
          if (row[j] !== '' && row[j] !== null) hasData = true;
        }
      }

      if (hasData) {
        records.push(record);
      }
    }

    readCache[sheetName] = records;
    return records.slice();
  }

  /**
   * Finds the first record matching a predicate function.
   */
  function findOne(sheetName, predicate) {
    const all = getAll(sheetName);
    for (let i = 0; i < all.length; i++) {
      if (predicate(all[i])) {
        return all[i];
      }
    }
    return null;
  }

  /**
   * Finds a record by a specific key-value pair.
   * Uses in-memory cache if available; otherwise performs targeted TextFinder row lookup
   * to avoid reading and parsing the entire sheet unnecessarily.
   */
  function findByKey(sheetName, keyColumn, value) {
    if (value === undefined || value === null) return null;
    const strVal = String(value).toLowerCase();

    // 1. Fast in-memory scan if sheet is already cached in this execution
    if (readCache[sheetName]) {
      const all = readCache[sheetName];
      for (let i = 0; i < all.length; i++) {
        if (String(all[i][keyColumn]).toLowerCase() === strVal) {
          return Object.assign({}, all[i]);
        }
      }
      return null;
    }

    // 2. Targeted single-row lookup via native TextFinder on the key column
    try {
      const sheet = getSheet(sheetName);
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol < 1) return null;

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const colIdx = headers.indexOf(keyColumn);

      if (colIdx !== -1 && typeof sheet.createTextFinder === 'function') {
        const finder = sheet.getRange(2, colIdx + 1, lastRow - 1, 1)
          .createTextFinder(String(value))
          .matchEntireCell(true)
          .matchCase(false);
        const matchCell = finder.findNext();
        if (matchCell) {
          const rowNum = matchCell.getRow();
          const rowVals = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
          const record = { _rowNumber: rowNum };
          for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
              record[headers[j]] = unescapeCellValue(rowVals[j]);
            }
          }
          return record;
        }
        return null;
      }
    } catch (finderErr) {
      // Fallback to in-memory findOne if TextFinder is not supported
    }

    return findOne(sheetName, function(row) {
      return String(row[keyColumn]).toLowerCase() === strVal;
    });
  }

  /**
   * Finds all records matching a predicate function.
   */
  function findMany(sheetName, predicate = null) {
    const all = getAll(sheetName);
    if (!predicate) return all;
    return all.filter(predicate);
  }

  /**
   * Inserts a single record object into the sheet.
   * Matches object keys to column headers in Row 1.
   */
  function insert(sheetName, recordObj) {
    return withLock(function() {
      const sheet = getSheet(sheetName);
      const lastCol = sheet.getLastColumn();
      if (lastCol < 1) {
        throw new Error(`Sheet "${sheetName}" has no columns defined.`);
      }

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const rowData = [];

      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        let val = recordObj[header];
        if (val === undefined || val === null) {
          val = '';
        } else if (typeof val === 'boolean') {
          val = val ? true : false;
        } else if (typeof val === 'object' && !(val instanceof Date)) {
          val = JSON.stringify(val);
        } else if (typeof val === 'string') {
          val = sanitizeCellValue(val);
        }
        rowData.push(val);
      }

      sheet.appendRow(rowData);
      clearCache(sheetName);
      return recordObj;
    });
  }

  /**
   * Updates an existing record in the sheet matched by a key column and value.
   * Writes the entire updated row in a single atomic setValues() call rather than looping setValue().
   */
  function update(sheetName, keyColumn, keyValue, updateObj) {
    return withLock(function() {
      const sheet = getSheet(sheetName);
      const all = getAll(sheetName);
      const target = all.find(function(row) {
        return String(row[keyColumn]) === String(keyValue);
      });

      if (!target) {
        return null;
      }

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowNumber = target._rowNumber;
      const currentRowValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];

      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const header = headers[colIdx];
        if (header in updateObj) {
          let val = updateObj[header];
          if (val === undefined || val === null) {
            val = '';
          } else if (typeof val === 'boolean') {
            val = val ? true : false;
          } else if (typeof val === 'object' && !(val instanceof Date)) {
            val = JSON.stringify(val);
          } else if (typeof val === 'string') {
            val = sanitizeCellValue(val);
          }
          currentRowValues[colIdx] = val;
          target[header] = unescapeCellValue(val);
        }
      }

      // Single atomic row write
      const targetRange = sheet.getRange(rowNumber, 1, 1, headers.length);
      if (typeof targetRange.setValues === 'function') {
        targetRange.setValues([currentRowValues]);
      } else {
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          sheet.getRange(rowNumber, colIdx + 1).setValue(currentRowValues[colIdx]);
        }
      }
      clearCache(sheetName);

      delete target._rowNumber;
      return target;
    });
  }

  /**
   * Deletes a record from a sheet by key column and value.
   */
  function remove(sheetName, keyColumn, keyValue) {
    return withLock(function() {
      const sheet = getSheet(sheetName);
      const all = getAll(sheetName);
      const target = all.find(function(row) {
        return String(row[keyColumn]) === String(keyValue);
      });

      if (!target) {
        return false;
      }

      sheet.deleteRow(target._rowNumber);
      clearCache(sheetName);
      return true;
    });
  }

  /**
   * Generates a stable unique ID with an optional prefix.
   */
  function generateId(prefix = 'id') {
    const rawUuid = Utilities.getUuid().replace(/-/g, '');
    return `${prefix}_${rawUuid}`;
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    clearCache: clearCache,
    withLock: withLock,
    getAll: getAll,
    findOne: findOne,
    findByKey: findByKey,
    findMany: findMany,
    insert: insert,
    update: update,
    remove: remove,
    generateId: generateId,
    sanitizeCellValue: sanitizeCellValue,
    unescapeCellValue: unescapeCellValue
  };
})();
