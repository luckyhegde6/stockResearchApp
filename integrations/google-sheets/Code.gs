const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const API_TOKEN = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
const HOME_TAB = 'StockResearch';
const INDEX_HEADERS = ['last_exported_at', 'symbol', 'dataset', 'tab_name', 'row_count', 'mode', 'screenshots_embedded', 'open_tab'];

function doGet() {
  return json_({
    ok: true,
    service: 'stock-research-sheet-sink',
    serviceVersion: '2',
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
    cleanupLegacyManagedTabs_(ss, home);
    const results = [];
    tabs.forEach(function(item) {
      const tabName = sanitizeTabName_(item.tabName || 'research');
      const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
      const rows = sanitizeRowsForSheet_(Array.isArray(item.rows) ? item.rows : []);
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
      upsertIndex_(home, {
        exportedAt: timestamp,
        symbol: symbol,
        dataset: result.dataset,
        tabName: result.tabName,
        rows: result.rows,
        mode: mode,
        screenshotsEmbedded: screenshots.length ? screenshotCount : 0,
        gid: result.gid,
        spreadsheetUrl: ss.getUrl()
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

function isLocalPathKey_(key) {
  return /^(?:path|localPath|relativePath|artifactPath|screenshotPath|evidencePath|reportPath|filePath|sourcePath|local_path|relative_path|artifact_path|screenshot_path|evidence_path|report_path|file_path|source_path)$/i.test(String(key || '')) ||
    /(?:local|relative|artifact|screenshot|evidence|report|file|source)[_-]?path/i.test(String(key || ''));
}

function isLocalPathValue_(value) {
  if (typeof value !== 'string') return false;
  var text = value.trim();
  var drivePath = /^[A-Za-z]:/.test(text) && (text.charAt(2) === '\\' || text.charAt(2) === '/');
  var uncPath = text.charAt(0) === '\\' && text.charAt(1) === '\\';
  return drivePath || uncPath ||
    text.indexOf('/Users/') === 0 || text.indexOf('/home/') === 0 || text.indexOf('/mnt/') === 0 ||
    text.indexOf('research/') === 0 || text.indexOf('research\\') === 0 ||
    text.indexOf('outputs/') === 0 || text.indexOf('outputs\\') === 0;
}

function redactEmbeddedLocalPaths_(text) {
  return String(text)
    .replace(/(^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/])(?:[^\\/\s"'<>|,;)}\]]+[\\/])*[^\\/\s"'<>|,;)}\]]*/g, '$1[local path redacted]')
    .replace(/\\\\[^\\/\s"'<>|]+\\[^\\/\s"'<>|]+(?:\\[^\s"'<>|,;)}\]]*)?/g, '[local path redacted]')
    .replace(/(^|[\s=:([{])(?:research|outputs)[\\/][^\s"'<>|,;)}\]]+/g, '$1[local path redacted]')
    .replace(/(^|[\s=:([{])\/(?:Users|home|mnt|tmp)\/[^\s"'<>|,;)}\]]+/g, '$1[local path redacted]');
}

function sanitizeNestedValue_(value, key) {
  if (isLocalPathKey_(key || '') || isLocalPathValue_(value)) return undefined;
  if (typeof value === 'string') return redactEmbeddedLocalPaths_(value);
  if (Array.isArray(value)) {
    return value.map(function(item) { return sanitizeNestedValue_(item, ''); })
      .filter(function(item) { return item !== undefined; });
  }
  if (value && typeof value === 'object') {
    var clean = {};
    Object.keys(value).forEach(function(childKey) {
      var child = sanitizeNestedValue_(value[childKey], childKey);
      if (child !== undefined) clean[childKey] = child;
    });
    return clean;
  }
  return value;
}

function sanitizeRowsForSheet_(rows) {
  return rows.map(function(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      var scalar = sanitizeNestedValue_(row, '');
      return { value: scalar === undefined ? '' : scalar };
    }
    var clean = {};
    Object.keys(row).forEach(function(key) {
      var value = sanitizeNestedValue_(row[key], key);
      if (value !== undefined) clean[key] = value;
    });
    return clean;
  });
}

function isLegacyManagedTab_(name) {
  return name === '_EXPORT_LOG' ||
    /^command-runs-/i.test(name) ||
    /^[A-Z0-9&-]+-\d{4}-\d{2}-\d{2}-(?:research|analysis)-(?:summary|evidence|sources|findings|quality|visual-evidence|scores|risks|catalysts|scenarios|audit)$/i.test(name);
}

function cleanupLegacyManagedTabs_(ss, indexSheet) {
  var removed = [];
  ss.getSheets().slice().forEach(function(sheet) {
    var name = sheet.getName();
    if (name !== HOME_TAB && isLegacyManagedTab_(name) && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
      removed.push(name);
    }
  });
  if (!removed.length || indexSheet.getLastRow() < 2) return;
  var removedSet = {};
  removed.forEach(function(name) { removedSet[name] = true; });
  var rowCount = indexSheet.getLastRow();
  var linkedNames = indexSheet.getRange(2, 4, rowCount - 1, 1).getValues();
  for (var i = linkedNames.length - 1; i >= 0; i -= 1) {
    var tabName = String(linkedNames[i][0] || '');
    if (removedSet[tabName] || isLegacyManagedTab_(tabName)) indexSheet.deleteRow(i + 2);
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
  sheet.setRowHeights(dataStartRow, values.length, 42);
  const recordTypeColumn = columns.indexOf('record_type') + 1;
  if (recordTypeColumn > 0) {
    values.forEach(function(row, index) {
      const targetRow = dataStartRow + index;
      if (row[recordTypeColumn - 1] === 'section_header') {
        sheet.getRange(targetRow, 1, 1, columns.length)
          .setFontWeight('bold')
          .setFontColor('#ffffff')
          .setBackground('#244062');
        sheet.setRowHeight(targetRow, 32);
      } else if (row[recordTypeColumn - 1] === 'visual_evidence') {
        sheet.setRowHeight(targetRow, 230);
      }
    });
  }
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

function setScreenshotOutcome_(sheet, rowIndex, headers, status, note) {
  ['value', 'status', 'embedding_status'].forEach(function(key) {
    const column = headers.indexOf(key) + 1;
    if (column > 0) sheet.getRange(rowIndex, column).setValue(status);
  });
  const notesColumn = headers.indexOf('notes') + 1;
  if (notesColumn > 0) sheet.getRange(rowIndex, notesColumn).setValue(note);
}

function embedScreenshots_(ss, screenshots) {
  const result = { embedded: 0, failed: 0, skipped: 0, errors: [] };
  screenshots.forEach(function(item) {
    const sheet = ss.getSheetByName(sanitizeTabName_(item.tabName || 'visual-evidence'));
    if (!sheet || !item.base64 || !item.rowIndex) {
      result.skipped += 1;
      return;
    }

    const rowIndex = Number(item.rowIndex);
    let insertedImage = null;
    try {
      const bytes = Utilities.base64Decode(item.base64);
      const byteLimit = 1800000; // Keep a clear margin below Apps Script's 2 MB Blob limit.
      if (bytes.length > byteLimit) {
        throw new Error('Optimized image is ' + bytes.length + ' bytes; upload limit is ' + byteLimit + ' bytes.');
      }

      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
      const widthColumn = headers.indexOf('image_width') + 1;
      const heightColumn = headers.indexOf('image_height') + 1;
      if (widthColumn > 0 && heightColumn > 0) {
        const width = Number(sheet.getRange(rowIndex, widthColumn).getValue());
        const height = Number(sheet.getRange(rowIndex, heightColumn).getValue());
        if (!(width > 0) || !(height > 0) || width * height > 1000000) {
          throw new Error('Optimized image dimensions are invalid or exceed the 1,000,000-pixel limit.');
        }
      }

      const blob = Utilities.newBlob(bytes, item.mimeType || 'image/jpeg', item.fileName || 'chart.jpg');
      const previewColumn = headers.indexOf('preview') + 1 || headers.length + 1;
      insertedImage = sheet.insertImage(blob, previewColumn, rowIndex);
      if (insertedImage.setAltTextTitle) insertedImage.setAltTextTitle(String(item.fileName || 'Research screenshot'));
      if (insertedImage.setAltTextDescription) insertedImage.setAltTextDescription('Embedded visual evidence from StockResearch; filename is preserved in the row.');

      // Preserve aspect ratio. Tall full-page captures remain tall/narrow instead of being distorted.
      const width = widthColumn > 0 ? Number(sheet.getRange(rowIndex, widthColumn).getValue()) : 480;
      const height = heightColumn > 0 ? Number(sheet.getRange(rowIndex, heightColumn).getValue()) : 220;
      const scale = Math.min(480 / width, 320 / height);
      const displayWidth = Math.max(1, Math.round(width * scale));
      const displayHeight = Math.max(1, Math.round(height * scale));
      insertedImage.setWidth(displayWidth);
      insertedImage.setHeight(displayHeight);
      sheet.setColumnWidth(previewColumn, 500);
      sheet.setRowHeight(rowIndex, Math.max(80, displayHeight));

      setScreenshotOutcome_(sheet, rowIndex, headers, 'embedded_in_sheet',
        'Image inserted successfully. Original filename and optimization metadata are retained in this row.');
      result.embedded += 1;
    } catch (err) {
      if (insertedImage) {
        try { insertedImage.remove(); } catch (ignoredImageRemove) {}
      }
      result.failed += 1;
      const errorMessage = String(err && err.message ? err.message : err).slice(0, 450);
      result.errors.push({
        fileName: String(item.fileName || 'unknown'),
        message: errorMessage
      });
      try {
        const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
        setScreenshotOutcome_(sheet, rowIndex, headers, 'embed_failed: ' + errorMessage.slice(0, 240),
          'Embedding failed: ' + errorMessage.slice(0, 300));
      } catch (ignoredStatusUpdate) {}
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

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
