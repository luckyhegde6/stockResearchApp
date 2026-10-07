const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const API_TOKEN = PropertiesService.getScriptProperties().getProperty('API_TOKEN');

function doGet() {
  return json_({ ok: true, service: 'stock-research-sheet-sink' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'Missing request body' });
    }

    const payload = JSON.parse(e.postData.contents);
    if (!SHEET_ID) throw new Error('Missing Script Property: SHEET_ID');
    if (API_TOKEN && payload.token !== API_TOKEN) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const tabName = sanitizeTabName_(payload.tabName || 'research');
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const mode = payload.mode === 'append' ? 'append' : 'replace';
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);

    writeRows_(sheet, rows, mode);
    logExport_(ss, {
      exportedAt: new Date().toISOString(),
      tabName: tabName,
      dataset: payload.dataset || '',
      rows: rows.length,
      mode: mode
    });

    return json_({
      ok: true,
      spreadsheetId: SHEET_ID,
      tabName: tabName,
      rows: rows.length
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function sanitizeTabName_(name) {
  const cleaned = String(name)
    .replace(/[\\/?*\[\]:]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return cleaned || 'research';
}

function writeRows_(sheet, rows, mode) {
  if (mode === 'replace') sheet.clear();

  if (!rows.length) {
    sheet.getRange(1, 1).setValue('No rows returned');
    sheet.setFrozenRows(1);
    return;
  }

  const columns = [];
  const seen = {};
  rows.forEach(function(row) {
    Object.keys(row || {}).forEach(function(key) {
      if (!seen[key]) {
        seen[key] = true;
        columns.push(key);
      }
    });
  });

  const values = rows.map(function(row) {
    return columns.map(function(column) {
      return toCell_(row ? row[column] : '');
    });
  });

  const startRow = mode === 'append' && sheet.getLastRow() > 0 ? sheet.getLastRow() + 1 : 1;

  if (startRow === 1) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    styleHeader_(sheet, columns.length);
    sheet.setFrozenRows(1);
  }

  sheet.getRange(startRow === 1 ? 2 : startRow, 1, values.length, columns.length).setValues(values);

  const endColumn = Math.max(columns.length, 1);
  sheet.autoResizeColumns(1, endColumn);
}

function styleHeader_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setWrap(true);
}

function toCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function logExport_(ss, entry) {
  const name = '_EXPORT_LOG';
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 5).setValues([[
      'exportedAt', 'tabName', 'dataset', 'rows', 'mode'
    ]]);
    styleHeader_(sheet, 5);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    entry.exportedAt,
    entry.tabName,
    entry.dataset,
    entry.rows,
    entry.mode
  ]);
}
