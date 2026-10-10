const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const API_TOKEN = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
const HOME_TAB = 'StockResearch';
const INDEX_HEADERS = ['last_exported_at', 'symbol', 'dataset', 'tab_name', 'row_count', 'mode', 'screenshots_embedded', 'open_tab'];
const LOG_HEADERS = ['exported_at', 'run_id', 'symbol', 'dataset', 'tab_name', 'row_count', 'mode', 'screenshots_embedded', 'status'];

function doGet() {
  return json_({
    ok: true,
    service: 'stock-research-sheet-sink',
    workbookUrl: SHEET_ID ? 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit' : ''
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'Missing request body' });
    }
    if (!SHEET_ID) throw new Error('Missing Script Property: SHEET_ID');
    if (!API_TOKEN) throw new Error('Missing Script Property: API_TOKEN. Export is disabled until a token is configured.');

    const payload = JSON.parse(e.postData.contents);
    if (payload.token !== API_TOKEN) return json_({ ok: false, error: 'Unauthorized' });
    if (payload.spreadsheetId && payload.spreadsheetId !== SHEET_ID) {
      throw new Error('Configured spreadsheet ID does not match the requested workbook');
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const mode = payload.mode === 'append' ? 'append' : 'replace';
    const runId = String(payload.runId || new Date().getTime());
    const symbol = String(payload.symbol || '').toUpperCase();
    const tabs = Array.isArray(payload.tabs) && payload.tabs.length
      ? payload.tabs
      : [{ tabName: payload.tabName || 'research', dataset: payload.dataset || 'research', rows: payload.rows || [] }];
    const timestamp = new Date().toISOString();

    const home = ensureIndex_(ss);
    const results = [];
    tabs.forEach(function(item) {
      const tabName = sanitizeTabName_(item.tabName || 'research');
      const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
      const rows = Array.isArray(item.rows) ? item.rows : [];
      const dataStartRow = writeRows_(sheet, rows, mode);
      results.push({
        tabName: tabName,
        dataset: String(item.dataset || payload.dataset || ''),
        rows: rows.length,
        gid: sheet.getSheetId(),
        dataStartRow: dataStartRow
      });
    });

    const screenshots = Array.isArray(payload.screenshots) ? payload.screenshots : [];
    screenshots.forEach(function(item) {
      const tabResult = results.find(function(result) { return result.tabName === sanitizeTabName_(item.tabName || 'visual-evidence'); });
      if (tabResult && tabResult.dataStartRow) {
        item.rowIndex = tabResult.dataStartRow + (Number(item.rowIndex || 2) - 2);
      }
    });
    const screenshotResult = embedScreenshots_(ss, screenshots);
    const screenshotCount = screenshotResult.embedded;
    results.forEach(function(result) {
      const sheet = ss.getSheetByName(result.tabName);
      const countForTab = result.dataset === 'visual-evidence' ? screenshotCount : 0;
      upsertIndex_(home, {
        exportedAt: timestamp,
        symbol: symbol,
        dataset: result.dataset,
        tabName: result.tabName,
        rows: result.rows,
        mode: mode,
        screenshotsEmbedded: countForTab,
        gid: result.gid,
        spreadsheetUrl: ss.getUrl()
      });
      logExport_(ss, {
        exportedAt: timestamp,
        runId: runId,
        symbol: symbol,
        dataset: result.dataset,
        tabName: result.tabName,
        rows: result.rows,
        mode: mode,
        screenshotsEmbedded: countForTab,
        status: 'ok'
      });
    });

    SpreadsheetApp.flush();
    return json_({
      ok: true,
      runId: runId,
      spreadsheetId: SHEET_ID,
      spreadsheetUrl: ss.getUrl(),
      mode: mode,
      tabs: results,
      screenshotsEmbedded: screenshotResult.embedded,
      screenshotsFailed: screenshotResult.failed,
      screenshotsSkipped: screenshotResult.skipped,
      screenshotErrors: screenshotResult.errors
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
  if (mode === 'replace') {
    sheet.clear();
    sheet.getImages().forEach(function(image) { image.remove(); });
  }

  if (!rows.length) {
    sheet.getRange(1, 1).setValue('No rows returned');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 280);
    return 2;
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
  if (!columns.length) columns.push('value');

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
    sheet.getRange(1, 1, Math.max(values.length + 1, 1), columns.length).setWrap(true);
    try {
      if (sheet.getFilter()) sheet.getFilter().remove();
      sheet.getRange(1, 1, Math.max(values.length + 1, 1), columns.length).createFilter();
    } catch (ignored) {}
  }

  const dataStartRow = startRow === 1 ? 2 : startRow;
  sheet.getRange(dataStartRow, 1, values.length, columns.length).setValues(values);
  const previewColumn = columns.indexOf('preview') + 1;
  if (previewColumn > 0) sheet.setColumnWidth(previewColumn, 500);
  for (let column = 1; column <= columns.length; column += 1) {
    if (column !== previewColumn) sheet.autoResizeColumn(column);
    if (sheet.getColumnWidth(column) > 420) sheet.setColumnWidth(column, 420);
    if (sheet.getColumnWidth(column) < 100) sheet.setColumnWidth(column, 120);
  }
  sheet.setRowHeights(dataStartRow, values.length, previewColumn > 0 ? 230 : 48);
  return dataStartRow;
}

function styleHeader_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#17365d')
    .setWrap(true)
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 42);
}

function toCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^[=+@]/.test(value)) return "'" + value;
  if (typeof value === 'string' && /^-\D/.test(value)) return "'" + value;
  return value;
}

function embedScreenshots_(ss, screenshots) {
  const result = { embedded: 0, failed: 0, skipped: 0, errors: [] };
  screenshots.forEach(function(item) {
    const sheet = ss.getSheetByName(sanitizeTabName_(item.tabName || 'visual-evidence'));
    if (!sheet || !item.base64 || !item.rowIndex) {
      result.skipped += 1;
      return;
    }
    try {
      const bytes = Utilities.base64Decode(item.base64);
      const blob = Utilities.newBlob(bytes, item.mimeType || 'image/png', item.fileName || 'chart.png');
      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
      const statusColumn = headers.indexOf('embedding_status') + 1;
      const previewColumn = headers.indexOf('preview') + 1 || headers.length + 1;
      const image = sheet.insertImage(blob, previewColumn, Number(item.rowIndex));
      image.setWidth(480);
      image.setHeight(220);
      if (image.setAltTextTitle) image.setAltTextTitle(String(item.fileName || 'Research screenshot'));
      if (image.setAltTextDescription) image.setAltTextDescription('Embedded visual evidence from StockResearch; source: ' + String(item.fileName || 'chart'));
      if (statusColumn > 0) sheet.getRange(Number(item.rowIndex), statusColumn).setValue('embedded_in_sheet');
      sheet.setColumnWidth(previewColumn, 500);
      sheet.setRowHeight(Number(item.rowIndex), 230);
      result.embedded += 1;
    } catch (err) {
      result.failed += 1;
      const errorMessage = String(err && err.message ? err.message : err).slice(0, 500);
      result.errors.push({
        fileName: String(item.fileName || 'unknown'),
        message: errorMessage
      });
      try {
        const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
        const statusColumn = headers.indexOf('embedding_status') + 1;
        if (statusColumn > 0) sheet.getRange(Number(item.rowIndex), statusColumn).setValue('embed_failed: ' + errorMessage.slice(0, 300));
      } catch (ignored) {}
    }
  });
  return result;
}

function ensureIndex_(ss) {
  let sheet = ss.getSheetByName(HOME_TAB);
  if (!sheet) sheet = ss.insertSheet(HOME_TAB, 0);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
    styleHeader_(sheet, INDEX_HEADERS.length);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
    styleHeader_(sheet, INDEX_HEADERS.length);
  }
  try {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  } catch (ignored) {}
  return sheet;
}

function upsertIndex_(sheet, item) {
  const count = Math.max(sheet.getLastRow() - 1, 0);
  const names = count ? sheet.getRange(2, 4, count, 1).getValues().map(function(row) { return String(row[0]); }) : [];
  const found = names.indexOf(item.tabName);
  const rowIndex = found >= 0 ? found + 2 : sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 7).setValues([[
    item.exportedAt,
    item.symbol,
    item.dataset,
    item.tabName,
    item.rows,
    item.mode,
    item.screenshotsEmbedded
  ]]);
  const targetUrl = item.spreadsheetUrl + '#gid=' + item.gid;
  sheet.getRange(rowIndex, 8).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText('Open tab').setLinkUrl(targetUrl).build()
  );
  sheet.autoResizeColumns(1, 7);
  for (let column = 1; column <= 7; column += 1) {
    if (sheet.getColumnWidth(column) > 320) sheet.setColumnWidth(column, 320);
  }
}

function logExport_(ss, entry) {
  const name = '_EXPORT_LOG';
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  styleHeader_(sheet, LOG_HEADERS.length);
  sheet.setFrozenRows(1);
  sheet.appendRow([
    entry.exportedAt,
    entry.runId,
    entry.symbol,
    entry.dataset,
    entry.tabName,
    entry.rows,
    entry.mode,
    entry.screenshotsEmbedded,
    entry.status
  ]);
  sheet.autoResizeColumns(1, LOG_HEADERS.length);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
