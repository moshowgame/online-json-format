/* =========================================================
   main.js — 單頁應用入口
   整合：校驗・格式化 / 壓縮 / 按條件提取（共享輸入輸出框）
   ========================================================= */
(function () {
  'use strict';

  /* ============== 內置示例 ============== */
  var SAMPLES = {
    json: {
      label: '用戶賬戶列表',
      text: JSON.stringify({
        "reportId": "RPT-2026-07-04-001",
        "generatedAt": "2026-07-04T08:30:00Z",
        "metadata": { "source": "core-banking", "version": "1.0.0" },
        "accounts": [
          { "accountNumber": "ACC-100001", "accountLocation": "CN", "balance": 12500.5,  "status": "ACTIVE", "type": "SAVINGS" },
          { "accountNumber": "ACC-100002", "accountLocation": "US", "balance": 3200.0,   "status": "ACTIVE", "type": "CHECKING" },
          { "accountNumber": "ACC-100003", "accountLocation": "CN", "balance": 8800.75,  "status": "FROZEN", "type": "SAVINGS" },
          { "accountNumber": "ACC-100004", "accountLocation": "CN", "balance": 560.0,    "status": "ACTIVE", "type": "SAVINGS" },
          { "accountNumber": "ACC-100005", "accountLocation": "HK", "balance": 9999.99,  "status": "ACTIVE", "type": "SAVINGS" },
          { "accountNumber": "ACC-100001", "accountLocation": "CN", "balance": 12500.5,  "status": "ACTIVE", "type": "SAVINGS" },
          { "accountNumber": "ACC-100006", "accountLocation": "CN", "balance": 0,        "status": "CLOSED", "type": "SAVINGS" },
          { "accountNumber": "ACC-100007", "accountLocation": "JP", "balance": 4500,    "status": "ACTIVE", "type": "CHECKING" },
          { "accountNumber": "ACC-100008", "accountLocation": "CN", "balance": 2400.0,  "status": "ACTIVE", "type": "SAVINGS" },
          { "accountNumber": "ACC-100009", "accountLocation": "SG", "balance": 7800.0,  "status": "ACTIVE", "type": "SAVINGS" }
        ],
        "totals": { "activeCount": 8, "frozenCount": 1, "closedCount": 1, "totalBalance": 65760.24 }
      }, null, 2)
    },
    bson: {
      label: 'Mongo 訂單文檔（Extended JSON）',
      text: JSON.stringify({
        "_id": { "$oid": "668b6a0a3b1f4a2e88c8d0e1" },
        "orderNo": "SO-20260704-0001",
        "customer": { "name": "張大狼狗", "vipLevel": 3, "email": "dalang@example.com" },
        "amount": { "$numberDecimal": "1234.56" },
        "createdAt": { "$date": "2026-07-04T08:30:00.000Z" },
        "items": [
          { "sku": "DLG-TEE-001", "qty": 2, "price": { "$numberInt": "199" } },
          { "sku": "DLG-MUG-007", "qty": 1, "price": { "$numberDecimal": "59.50" } }
        ],
        "tags": ["vip", "fast-shipping"],
        "remark": null
      }, null, 2)
    }
  };

  var MODE_META = {
    format:  { label: '執行格式化', icon: 'bi-magic',           titleIcon: 'bi-file-earmark-code', titleText: '輸出（格式化）' },
    minify:  { label: '執行壓縮',   icon: 'bi-arrows-collapse', titleIcon: 'bi-file-earmark-zip',  titleText: '輸出（壓縮）' },
    extract: { label: '執行提取',   icon: 'bi-funnel',          titleIcon: 'bi-list-check',        titleText: '提取結果' }
  };

  /* ============== 全局狀態 ============== */
  var state = {
    mode: 'format',               // 'format' | 'minify' | 'extract'
    format: 'json',               // 'json' | 'bson'
    bsonMode: 'auto',             // 'auto' | 'extended-json' | 'hex' | 'base64'
    fmtIndent: '2',
    bsonIndent: '2',
    sortKeys: false,
    escapeUnicode: false,
    lastExtract: null
  };

  /* ============== 模式切換（顯示/隱藏 + 標題 + 執行按鈕文字） ============== */
  function applyModeVisibility() {
    document.body.setAttribute('data-active-mode', state.mode);
    document.body.setAttribute('data-active-format', state.format);
    // 執行按鈕文字與 icon
    var meta = MODE_META[state.mode];
    $('#btn-run-label').text(meta.label);
    $('#btn-run i').attr('class', 'bi ' + meta.icon);
    // 輸出框標題
    var $titleIcon = $('#fmt-output-title i');
    var $titleText = $('#fmt-output-title-text');
    $titleIcon.attr('class', 'bi ' + meta.titleIcon);
    $titleText.text(meta.titleText);
    // 模式提示
    var modeHint = state.format.toUpperCase() + ' · ' + ({ format: '格式化', minify: '壓縮', extract: '提取' })[state.mode];
    $('#fmt-mode-hint').text(modeHint);
    // 提取專屬面板：根據模式主動切換 hidden（[hidden] CSS 規則優先級太高，必須用 JS 控制）
    if (state.mode === 'extract') {
      $('.dlg-extract-panel').removeAttr('hidden');
    } else {
      $('.dlg-extract-panel').attr('hidden', 'hidden');
    }
  }

  /* ============== 運行入口（按當前模式分派） ============== */
  function run() {
    if (state.mode === 'format') return runFormat();
    if (state.mode === 'minify') return runMinify();
    if (state.mode === 'extract') return runExtract();
  }

  /* ============== 格式化 ============== */
  function runFormat() {
    var input = $('#fmt-input').val();
    var $out = $('#fmt-output');
    var $pane = $out.closest('.dlg-pane');
    $pane.find('.dlg-pane__title .dlg-badge').remove();
    $pane.find('.dlg-error-card').remove();
    $out.empty();

    if (!input) {
      $out.html('<div class="dlg-pane__placeholder"><i class="bi bi-arrow-left-right"></i><div>' + $out.data('empty') + '</div></div>');
      $out.data('text', '');
      $('#fmt-bson-types').attr('hidden', true);
      return;
    }

    if (state.format === 'json') {
      var indent = state.fmtIndent === 'tab' ? 'tab' : parseInt(state.fmtIndent, 10);
      var r = DLG.Json.format(input, { indent: indent, sortKeys: state.sortKeys, escapeUnicode: state.escapeUnicode });
      if (r.ok) {
        $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--success">Valid</span>');
        $out.html(DLG.UI.prettyJsonHtml(r.text));
        $out.data('text', r.text);
        DLG.UI.toast({ kind: 'success', message: 'JSON 校驗通過' });
        DLG.Storage.pushHistory({ type: 'json', content: input });
      } else {
        $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--danger">Invalid</span>');
        $out.html(
          '<div class="dlg-error-card">' +
            '<div class="dlg-error-card__title"><i class="bi bi-x-octagon-fill"></i> 校驗失敗</div>' +
            '<div class="dlg-error-card__body">位置：第 ' + r.error.line + ' 行，第 ' + r.error.column + ' 列\n錯誤：' + DLG.UI.escapeHtml(r.error.message) + '</div>' +
          '</div>'
        );
        $out.data('text', '');
        DLG.UI.toast({ kind: 'danger', message: '校驗失敗：第 ' + r.error.line + ' 行' });
      }
      $('#fmt-bson-types').attr('hidden', true);
    } else {
      var mode = state.bsonMode === 'auto' ? null : state.bsonMode;
      var indent2 = state.bsonIndent === 'tab' ? '\t' : parseInt(state.bsonIndent, 10);
      var r2 = DLG.Bson.toJson(input, mode, indent2);
      if (!r2.ok) {
        $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--danger">Invalid</span>');
        $out.html(
          '<div class="dlg-error-card">' +
            '<div class="dlg-error-card__title"><i class="bi bi-x-octagon-fill"></i> 解析失敗</div>' +
            '<div class="dlg-error-card__body">' + DLG.UI.escapeHtml(r2.error) + '</div>' +
          '</div>'
        );
        $out.data('text', '');
        $('#fmt-bson-types').attr('hidden', true);
        DLG.UI.toast({ kind: 'danger', message: 'BSON 解析失敗' });
        return;
      }
      $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--success">Valid</span>');
      var summary = DLG.Bson.summarizeTypes(r2.types);
      var typesHtml = summary.map(function (s) {
        return '<span class="dlg-bson-type"><span class="dlg-bson-type__name">' + s.type + '</span><span class="dlg-bson-type__count">× ' + s.count + '</span></span>';
      }).join('');
      $('#fmt-bson-types-list').html(typesHtml);
      $('#fmt-bson-types').removeAttr('hidden');
      $out.html('<pre class="dlg-pane__output" style="padding:0;border:none;background:transparent;margin:0"><code>' + DLG.UI.highlight('json', r2.text) + '</code></pre>');
      $out.data('text', r2.text);
      DLG.UI.toast({ kind: 'success', message: 'BSON 解析成功' });
      DLG.Storage.pushHistory({ type: 'bson', content: input });
    }
  }

  /* ============== 壓縮 ============== */
  function runMinify() {
    var input = $('#fmt-input').val();
    var $out = $('#fmt-output');
    var $pane = $out.closest('.dlg-pane');
    $pane.find('.dlg-pane__title .dlg-badge').remove();
    $pane.find('.dlg-error-card').remove();
    $out.empty();
    $('#fmt-bson-types').attr('hidden', true);

    if (!input) {
      $out.html('<div class="dlg-pane__placeholder"><i class="bi bi-arrow-left-right"></i><div>請先粘貼 JSON 數據</div></div>');
      $out.data('text', '');
      return;
    }

    if (state.format === 'json') {
      var r = DLG.Json.minify(input);
      if (r.ok) {
        $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--success">Minified</span>');
        $out.html(DLG.UI.prettyJsonHtml(r.text));
        $out.data('text', r.text);
        DLG.UI.toast({ kind: 'success', message: '已壓縮（' + r.text.length + ' 字符）' });
        DLG.Storage.pushHistory({ type: 'json', content: input });
      } else {
        $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--danger">Invalid</span>');
        $out.html('<div class="dlg-error-card"><div class="dlg-error-card__title"><i class="bi bi-x-octagon-fill"></i> 校驗失敗</div><div class="dlg-error-card__body">' + DLG.UI.escapeHtml(r.error.message) + '</div></div>');
        $out.data('text', '');
        DLG.UI.toast({ kind: 'danger', message: 'JSON 校驗失敗' });
      }
    } else {
      // BSON 壓縮 = 重新格式化為單行
      var mode = state.bsonMode === 'auto' ? null : state.bsonMode;
      var r2 = DLG.Bson.toJson(input, mode, 0);
      if (!r2.ok) {
        $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--danger">Invalid</span>');
        $out.html('<div class="dlg-error-card"><div class="dlg-error-card__title"><i class="bi bi-x-octagon-fill"></i> 解析失敗</div><div class="dlg-error-card__body">' + DLG.UI.escapeHtml(r2.error) + '</div></div>');
        $out.data('text', '');
        DLG.UI.toast({ kind: 'danger', message: 'BSON 解析失敗' });
        return;
      }
      $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--success">Minified</span>');
      $out.html(DLG.UI.prettyJsonHtml(r2.text));
      $out.data('text', r2.text);
      DLG.UI.toast({ kind: 'success', message: 'BSON 已壓縮（' + r2.text.length + ' 字符）' });
      DLG.Storage.pushHistory({ type: 'bson', content: input });
    }
  }

  /* ============== 提取 ============== */

  // 把當前輸入(可能為 BSON)統一為標準 JSON,返回 { ok, text, error }
  function toStandardJson(input) {
    if (state.format !== 'bson') return { ok: true, text: input };
    try {
      var EJSON = window.BSON && window.BSON.EJSON;
      if (!EJSON) return { ok: false, error: 'BSON 庫未載入' };
      var parsed = EJSON.parse(input, { relaxed: false });
      return { ok: true, text: EJSON.stringify(parsed, null, 2) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // 判斷是否為「簡單屬性名」(不含路徑語法字符)
  function isSimpleKey(s) {
    if (!s) return false;
    if (s.indexOf('.') >= 0) return false;
    if (s.indexOf('[') >= 0) return false;
    if (s.indexOf('*') >= 0) return false;
    if (s.charAt(0) === '$') return false;
    return /^[a-zA-Z_$][a-zA-Z0-9_$\-]*$/.test(s);
  }

  function runExtract() {
    var input = $('#fmt-input').val();
    var path = $('#ex-path').val().trim();
    var cond = $('#ex-cond').val().trim();
    var scalarOnly = $('#ex-scalar').is(':checked');
    var distinct = $('#ex-distinct').is(':checked');

    DLG.Storage.setLastSpec({ path: path, condition: cond });

    if (!input) { DLG.UI.toast({ kind: 'warning', message: '請先粘貼 JSON 數據' }); return; }
    if (!path)  { DLG.UI.toast({ kind: 'warning', message: '請輸入目標路徑' }); return; }

    var inputForExtract = input;
    var std = toStandardJson(input);
    if (!std.ok) { DLG.UI.toast({ kind: 'danger', message: 'BSON 解析失敗：' + std.error }); return; }
    inputForExtract = std.text;

    var r = DLG.Extract.extract(inputForExtract, { path: path, condition: cond, scalarOnly: scalarOnly, distinct: distinct });
    var $out = $('#fmt-output');
    var $pane = $out.closest('.dlg-pane');
    $pane.find('.dlg-pane__title .dlg-badge').remove();
    $pane.find('.dlg-error-card').remove();
    $out.empty();
    $('#ex-detail').attr('hidden', true);

    if (!r.ok) {
      $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--danger">Failed</span>');
      $out.html(
        '<div class="dlg-error-card">' +
          '<div class="dlg-error-card__title"><i class="bi bi-x-octagon-fill"></i> 提取失敗</div>' +
          '<div class="dlg-error-card__body">' + DLG.UI.escapeHtml(r.error.message) + (r.error.line ? '\n位置：第 ' + r.error.line + ' 行，第 ' + r.error.column + ' 列' : '') + '</div>' +
        '</div>'
      );
      $out.data('text', '');
      state.lastExtract = null;
      DLG.UI.toast({ kind: 'danger', message: '提取失敗' });
      return;
    }

    state.lastExtract = {
      total: r.total,
      values: r.values,
      distinct: r.distinct,
      rawMatches: r.matches,
      rawInput: inputForExtract,
      path: path,
      condition: cond
    };

    $pane.find('.dlg-pane__title').append('<span class="dlg-badge dlg-badge--success">' + r.total + ' 命中</span>');

    var tabs = '' +
      '<div class="dlg-result-tabs">' +
        '<button class="dlg-result-tab is-active" data-tab="values"><i class="bi bi-list-ol"></i> 值列表 <span class="dlg-result-tab__count">' + r.values.length + '</span></button>' +
        '<button class="dlg-result-tab" data-tab="count"><i class="bi bi-bar-chart"></i> 計數表 <span class="dlg-result-tab__count">' + r.values.length + '</span></button>' +
        '<button class="dlg-result-tab" data-tab="distinct"><i class="bi bi-collection"></i> 去重集合 <span class="dlg-result-tab__count">' + r.distinct.length + '</span></button>' +
        '<button class="dlg-result-tab" data-tab="paths"><i class="bi bi-diagram-3"></i> 命中路徑 <span class="dlg-result-tab__count">' + r.total + '</span></button>' +
      '</div>' +
      '<div class="dlg-result-panel" id="ex-tab-content"></div>';
    $out.html(tabs);
    $out.data('text', JSON.stringify(r.distinct, null, 2));

    renderExtractTab('values');

    $out.find('.dlg-result-tab').on('click', function () {
      $out.find('.dlg-result-tab').removeClass('is-active');
      $(this).addClass('is-active');
      renderExtractTab($(this).data('tab'));
    });

    DLG.UI.toast({ kind: 'success', message: '共 ' + r.total + ' 個元素匹配條件' });
    DLG.Storage.pushHistory({ type: 'extract', content: inputForExtract });
  }

  function renderExtractTab(name) {
    var r = state.lastExtract;
    if (!r) return;
    var $content = $('#ex-tab-content');
    if (name === 'values') {
      if (r.values.length === 0) { $content.html('<div class="dlg-empty"><i class="bi bi-inbox"></i><div>沒有匹配的元素</div></div>'); return; }
      var rows = r.values.map(function (v, i) {
        return '<tr class="is-clickable" data-detail-value-index="' + i + '"><td class="num">' + (i + 1) + '</td><td>' + DLG.UI.escapeHtml(JSON.stringify(v.value)) + '</td><td class="num">' + v.count + '</td><td><code>' + DLG.UI.escapeHtml(v.paths[0] || '') + '</code></td></tr>';
      }).join('');
      $content.html('<div style="overflow:auto"><table class="dlg-table"><thead><tr><th>#</th><th>值</th><th>次數</th><th>首條路徑</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
      bindRowClicks($content);
    } else if (name === 'count') {
      if (r.values.length === 0) { $content.html('<div class="dlg-empty"><i class="bi bi-inbox"></i><div>沒有匹配的元素</div></div>'); return; }
      var rows2 = r.values.map(function (v, i) {
        var pct = r.total > 0 ? ((v.count / r.total) * 100).toFixed(1) : '0.0';
        return '<tr class="is-clickable" data-detail-value-index="' + i + '"><td class="num">' + (i + 1) + '</td><td>' + DLG.UI.escapeHtml(JSON.stringify(v.value)) + '</td><td class="num">' + v.count + '</td><td><div style="background:var(--dlg-color-bg);border:1px solid var(--dlg-color-border);height:8px;border-radius:4px;overflow:hidden;min-width:120px"><div style="background:var(--dlg-color-accent);height:100%;width:' + pct + '%"></div></div></td><td style="color:var(--dlg-color-text-soft)">' + pct + '%</td></tr>';
      }).join('');
      $content.html('<div style="overflow:auto"><table class="dlg-table"><thead><tr><th>#</th><th>值</th><th>次數</th><th>佔比</th><th>百分比</th></tr></thead><tbody>' + rows2 + '</tbody></table></div>');
      bindRowClicks($content);
    } else if (name === 'distinct') {
      if (r.distinct.length === 0) { $content.html('<div class="dlg-empty"><i class="bi bi-inbox"></i><div>沒有匹配的元素</div></div>'); return; }
      var items = r.distinct.map(function (v) { return '<li style="padding:6px 0;border-bottom:1px dashed var(--dlg-color-border);font-family:var(--dlg-font-mono);font-size:var(--dlg-fs-13)">' + DLG.UI.escapeHtml(JSON.stringify(v)) + '</li>'; }).join('');
      $content.html('<ul style="list-style:none;padding:0;margin:0">' + items + '</ul>');
    } else if (name === 'paths') {
      if (r.rawMatches.length === 0) { $content.html('<div class="dlg-empty"><i class="bi bi-inbox"></i><div>沒有匹配的元素</div></div>'); return; }
      var rows3 = r.rawMatches.map(function (m, i) {
        return '<tr class="is-clickable" data-detail-match-index="' + i + '"><td class="num">' + (i + 1) + '</td><td><code>' + DLG.UI.escapeHtml(m.path) + '</code></td><td>' + DLG.UI.escapeHtml(JSON.stringify(m.value)) + '</td></tr>';
      }).join('');
      $content.html('<div style="overflow:auto"><table class="dlg-table"><thead><tr><th>#</th><th>路徑</th><th>值</th></tr></thead><tbody>' + rows3 + '</tbody></table></div>');
      bindRowClicks($content);
    }
  }

  function bindRowClicks($container) {
    $container.find('tr.is-clickable').off('click').on('click', function () {
      $container.find('tr').removeClass('is-active');
      $(this).addClass('is-active');
      var vIdx = $(this).data('detail-value-index');
      var mIdx = $(this).data('detail-match-index');
      if (vIdx != null) showValueDetail(parseInt(vIdx, 10));
      else if (mIdx != null) showMatchDetail(parseInt(mIdx, 10));
    });
  }

  function showValueDetail(valueIndex) {
    var r = state.lastExtract;
    if (!r) return;
    var v = r.values[valueIndex];
    if (!v) return;
    var paths = v.paths || [];
    var firstPath = paths[0] || '$';
    var parsed = DLG.Json.parseSafe(r.rawInput);
    var parent = null;
    if (parsed.ok) parent = findParentByPath(parsed.data, firstPath);
    var pretty = parent ? JSON.stringify(parent, null, 2) : '（無法解析父對象）';
    $('#ex-detail-path').html('<code>' + DLG.UI.escapeHtml(firstPath) + '</code>');
    $('#ex-detail-value').html('<code>' + DLG.UI.escapeHtml(JSON.stringify(v.value)) + '</code>');
    $('#ex-detail-parent').html('<pre>' + DLG.UI.highlight('json', pretty) + '</pre>');
    var pathItems = paths.map(function (p) { return '<span class="dlg-detail__paths-item"><code>' + DLG.UI.escapeHtml(p) + '</code></span>'; }).join('');
    $('#ex-detail-paths').html(paths.length ? pathItems : '—');
    showDetailPanel();
  }

  function showMatchDetail(matchIndex) {
    var r = state.lastExtract;
    if (!r) return;
    var m = r.rawMatches[matchIndex];
    if (!m) return;
    var parsed = DLG.Json.parseSafe(r.rawInput);
    var parent = null;
    if (parsed.ok) parent = findParentByPath(parsed.data, m.path);
    var pretty = parent ? JSON.stringify(parent, null, 2) : '（無法解析父對象）';
    $('#ex-detail-path').html('<code>' + DLG.UI.escapeHtml(m.path) + '</code>');
    $('#ex-detail-value').html('<code>' + DLG.UI.escapeHtml(JSON.stringify(m.value)) + '</code>');
    $('#ex-detail-parent').html('<pre>' + DLG.UI.highlight('json', pretty) + '</pre>');
    $('#ex-detail-paths').html('<span class="dlg-detail__paths-item"><code>' + DLG.UI.escapeHtml(m.path) + '</code></span>');
    showDetailPanel();
  }

  function showDetailPanel() {
    var $d = $('#ex-detail').removeAttr('hidden');
    setTimeout(function () {
      $('html, body').animate({ scrollTop: $d.offset().top - 80 }, 400);
    }, 50);
  }

  function findParentByPath(root, path) {
    if (!path || path === '$') return root;
    var parts = [];
    var p = path.replace(/^\$/, '');
    var i = 0;
    while (i < p.length) {
      if (p.charAt(i) === '.') { i++; continue; }
      if (p.charAt(i) === '[') {
        var end = p.indexOf(']', i);
        if (end < 0) return null;
        var n = parseInt(p.slice(i + 1, end), 10);
        if (isNaN(n)) return null;
        parts.push({ kind: 'idx', value: n });
        i = end + 1;
      } else {
        var j = i;
        while (j < p.length && /[a-zA-Z0-9_$\-]/.test(p.charAt(j))) j++;
        if (j > i) parts.push({ kind: 'key', value: p.slice(i, j) });
        i = j;
      }
    }
    if (parts.length === 0) return root;
    var node = root;
    for (var k = 0; k < parts.length - 1; k++) {
      var seg = parts[k];
      if (node == null) return null;
      if (seg.kind === 'idx') node = Array.isArray(node) ? node[seg.value] : null;
      else if (seg.kind === 'key') node = (typeof node === 'object' && node !== null && !Array.isArray(node)) ? node[seg.value] : null;
      if (node == null) return null;
    }
    return node;
  }

  /* ============== 示例 / 清空 ============== */
  function loadSample() {
    var s = SAMPLES.json;
    if (state.format === 'bson') s = SAMPLES.bson;
    $('#fmt-input').val(s.text);
    DLG.UI.toast({ kind: 'info', message: '已載入示例：' + s.label });
    run();
  }

  function clearAll() {
    $('#fmt-input').val('').trigger('focus');
    var $out = $('#fmt-output');
    var $pane = $out.closest('.dlg-pane');
    $pane.find('.dlg-pane__title .dlg-badge').remove();
    $pane.find('.dlg-error-card').remove();
    $out.empty().html('<div class="dlg-pane__placeholder"><i class="bi bi-arrow-left-right"></i><div>點擊「執行」開始</div></div>');
    $out.data('text', '');
    $('#fmt-bson-types').attr('hidden', true);
    $('#ex-detail').attr('hidden', true);
    state.lastExtract = null;
  }

  /* ============== 提取結果導出 ============== */
  function copyExtractJson() {
    if (!state.lastExtract) { DLG.UI.toast({ kind: 'warning', message: '請先執行提取' }); return; }
    var distinct = $('#ex-distinct').is(':checked');
    var arr = distinct ? state.lastExtract.distinct : state.lastExtract.values.map(function (v) { return v.value; });
    DLG.UI.copyToClipboard(JSON.stringify(arr, null, 2)).then(function () {
      DLG.UI.toast({ kind: 'success', message: '已複製 ' + arr.length + ' 個值到剪貼簿' });
    }).catch(function () { DLG.UI.toast({ kind: 'danger', message: '複製失敗' }); });
  }

  function downloadExtractCsv() {
    if (!state.lastExtract) { DLG.UI.toast({ kind: 'warning', message: '請先執行提取' }); return; }
    var rows = [['index', 'value', 'count', 'first_path']];
    state.lastExtract.values.forEach(function (v, i) { rows.push([i + 1, JSON.stringify(v.value), v.count, v.paths[0] || '']); });
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    DLG.UI.downloadText('extract-result.csv', csv, 'text/csv');
  }

  /* ============== 行號 ============== */
  function refreshGutter(ta, gutter) {
    if (!ta || !gutter) return;
    var lines = ta.value.split('\n').length;
    var out = [];
    for (var i = 1; i <= lines; i++) out.push(i);
    gutter.textContent = out.join('\n');
  }
  function bindGutters() {
    $('textarea.dlg-pane__editor').each(function () {
      var $ta = $(this);
      var id = $ta.attr('id');
      var $g = $('[data-gutter="' + id + '"]');
      $ta.off('.gutter').on('input.gutter scroll.gutter', function () { refreshGutter(this, $g[0]); });
      $g.off('scroll.gutter').on('scroll.gutter', function () { $ta[0].scrollTop = this.scrollTop; });
      refreshGutter(this, $g[0]);
    });
  }

  /* ============== 拖拽 ============== */
  function bindDragDrop($editor) {
    $editor.off('.drop').on('dragover.drop drop.drop', function (e) { e.preventDefault(); });
    $editor.on('drop.drop', function (e) {
      var dt = e.originalEvent.dataTransfer;
      if (!dt || !dt.files || dt.files.length === 0) return;
      var file = dt.files[0];
      if (file.size > 5 * 1024 * 1024) {
        DLG.UI.toast({ kind: 'warning', message: '文件過大（>5MB），請直接粘貼文本' });
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        $editor.val(String(reader.result || ''));
        $editor.trigger('input');
        DLG.UI.toast({ kind: 'success', message: '已載入文件：' + file.name });
      };
      reader.readAsText(file);
    });
  }

  /* ============== 輸出操作 ============== */
  function bindOutputActions() {
    // 監聽所有帶 data-act 的按鈕（工具條 + 輸出面板頭部）
    $(document).on('click', '[data-act]', function () {
      var $btn = $(this);
      var act = $btn.data('act');
      // 工具條按鈕（無 data-target）：執行/示例/清空/複製JSON/下載CSV
      if (act === 'closeDetail') { $('#ex-detail').attr('hidden', true); return; }
      if (act === 'copyJson') return copyExtractJson();
      if (act === 'downloadCsv') return downloadExtractCsv();
      if (act === 'run') return run();
      if (act === 'loadSample') return loadSample();
      if (act === 'clear') return clearAll();
      // 輸出面板頭部按鈕（帶 data-target）
      var target = $btn.data('target');
      if (!target) return;
      var $out = $('#' + target);
      // 提取模式下從 lastExtract 取，否則從 data-text 取
      var text;
      if (state.mode === 'extract' && state.lastExtract) {
        var distinct = $('#ex-distinct').is(':checked');
        var arr = distinct ? state.lastExtract.distinct : state.lastExtract.values.map(function (v) { return v.value; });
        text = JSON.stringify(arr, null, 2);
      } else {
        text = $out.data('text') || '';
      }
      if (act === 'copy') {
        if (!text) { DLG.UI.toast({ kind: 'warning', message: '當前輸出為空' }); return; }
        DLG.UI.copyToClipboard(text).then(function () { DLG.UI.toast({ kind: 'success', message: '已複製到剪貼簿' }); }).catch(function () { DLG.UI.toast({ kind: 'danger', message: '複製失敗' }); });
      } else if (act === 'download') {
        if (!text) { DLG.UI.toast({ kind: 'warning', message: '當前輸出為空' }); return; }
        var fname = state.mode === 'extract' ? 'extract-result.json' : 'formatted.json';
        DLG.UI.downloadText(fname, text, 'application/json');
      }
    });
  }

  /* ============== 路徑自動偵測 ============== */
  var SUGGEST_LIMIT = 12;
  var suggestTimer = null;
  var suggestHideTimer = null;

  function hideSuggest() {
    $('#ex-path-suggest').attr('hidden', 'hidden').empty();
    $('#ex-path-detect').removeClass('is-active');
  }

  function renderSuggest(result, key) {
    var $box = $('#ex-path-suggest');
    $box.empty();
    if (!result.ok) {
      $box.append('<div class="dlg-suggest__empty">JSON 解析失敗,無法查找（' + DLG.UI.escapeHtml(result.error.message) + '）</div>');
      $box.removeAttr('hidden');
      return;
    }
    if (result.total === 0) {
      $box.append('<div class="dlg-suggest__empty">未在輸入中找到屬性 <code>' + DLG.UI.escapeHtml(key) + '</code></div>');
      $box.removeAttr('hidden');
      return;
    }
    var shown = result.paths.slice(0, SUGGEST_LIMIT);
    var html = '<div class="dlg-suggest__label"><i class="bi bi-magic"></i> 偵測到 ' + result.total + ' 處「' + DLG.UI.escapeHtml(key) + '」,點擊套用路徑</div>';
    shown.forEach(function (p) {
      var sampleStr = '';
      if (p.samples && p.samples.length) {
        var first = p.samples[0];
        var display = typeof first === 'string' ? '"' + first + '"' : JSON.stringify(first);
        if (display.length > 24) display = display.slice(0, 22) + '…';
        sampleStr = ' title="示例值: ' + DLG.UI.escapeHtml(display) + '"';
      }
      html += '<button type="button" class="dlg-suggest__chip" data-apply-path="' + DLG.UI.escapeHtml(p.path) + '"' + sampleStr + '>'
        + '<span class="dlg-suggest__chip-path">' + DLG.UI.escapeHtml(p.path) + '</span>'
        + '<span class="dlg-suggest__chip-count">× ' + p.count + '</span>'
        + '</button>';
    });
    if (result.paths.length > SUGGEST_LIMIT) {
      html += '<span class="dlg-suggest__more">… 還有 ' + (result.paths.length - SUGGEST_LIMIT) + ' 條</span>';
    }
    $box.html(html).removeAttr('hidden');
  }

  function runPathDetect() {
    var key = $('#ex-path').val().trim();
    var input = $('#fmt-input').val();
    if (!input) { hideSuggest(); return; }
    if (!isSimpleKey(key)) { hideSuggest(); return; }
    var std = toStandardJson(input);
    if (!std.ok) {
      renderSuggest({ ok: false, error: { message: 'BSON 解析失敗: ' + std.error } }, key);
      return;
    }
    var r = DLG.Extract.discoverPaths(std.text, key);
    renderSuggest(r, key);
  }

  function bindPathSuggest() {
    var $path = $('#ex-path');
    var $btn = $('#ex-path-detect');
    var $box = $('#ex-path-suggest');

    $path.on('input', function () {
      clearTimeout(suggestTimer);
      var key = $path.val().trim();
      if (!key || !isSimpleKey(key)) { hideSuggest(); return; }
      suggestTimer = setTimeout(runPathDetect, 300);
    });

    $path.on('focus', function () {
      var key = $path.val().trim();
      if (key && isSimpleKey(key)) {
        clearTimeout(suggestHideTimer);
        runPathDetect();
      }
    });

    $path.on('keydown', function (e) {
      if (e.key === 'Escape') hideSuggest();
    });

    $btn.on('click', function (e) {
      e.preventDefault();
      if ($box.is(':visible') && $btn.hasClass('is-active')) { hideSuggest(); return; }
      $btn.addClass('is-active');
      runPathDetect();
    });

    $box.on('click', '.dlg-suggest__chip', function (e) {
      e.preventDefault();
      var p = $(this).data('apply-path');
      if (!p) return;
      $path.val(p).trigger('focus');
      hideSuggest();
    });

    $path.on('blur', function () {
      clearTimeout(suggestHideTimer);
      suggestHideTimer = setTimeout(hideSuggest, 200);
    });
    $box.on('mousedown', function (e) {
      e.preventDefault();
    });

    $(document).on('click.dlg-suggest', function (e) {
      var $t = $(e.target);
      if ($t.closest('#ex-path-suggest, #ex-path, #ex-path-detect').length) return;
      hideSuggest();
    });
  }

  /* ============== 工具條綁定 ============== */
  function bindToolbar() {
    var $bar = $('#dlg-section-tool .dlg-tool__bar');

    // 模式切換
    $bar.find('.dlg-seg[data-bind="mode"] .dlg-seg__btn').on('click', function () {
      $bar.find('.dlg-seg[data-bind="mode"] .dlg-seg__btn').removeClass('is-active').attr('aria-checked', 'false');
      $(this).addClass('is-active').attr('aria-checked', 'true');
      state.mode = $(this).data('val');
      // 切換時清空輸出（避免殘留）
      var $out = $('#fmt-output');
      var $pane = $out.closest('.dlg-pane');
      $pane.find('.dlg-pane__title .dlg-badge').remove();
      $pane.find('.dlg-error-card').remove();
      $out.empty().html('<div class="dlg-pane__placeholder"><i class="bi bi-arrow-left-right"></i><div>點擊「執行」開始</div></div>');
      $out.data('text', '');
      $('#ex-detail').attr('hidden', true);
      state.lastExtract = null;
      applyModeVisibility();
    });

    // 格式切換
    $bar.find('.dlg-seg[data-bind="indent"] .dlg-seg__btn').on('click', function () {
      $bar.find('.dlg-seg[data-bind="indent"] .dlg-seg__btn').removeClass('is-active');
      $(this).addClass('is-active');
      state.fmtIndent = $(this).data('val');
    });
    $bar.find('.dlg-seg[data-bind="bson-indent"] .dlg-seg__btn').on('click', function () {
      $bar.find('.dlg-seg[data-bind="bson-indent"] .dlg-seg__btn').removeClass('is-active');
      $(this).addClass('is-active');
      state.bsonIndent = $(this).data('val');
    });
    $bar.find('.dlg-seg[data-bind="bson-mode"] .dlg-seg__btn').on('click', function () {
      $bar.find('.dlg-seg[data-bind="bson-mode"] .dlg-seg__btn').removeClass('is-active');
      $(this).addClass('is-active');
      state.bsonMode = $(this).data('val');
    });
    $bar.find('input[type=checkbox][data-bind]').on('change', function () {
      var k = $(this).data('bind');
      state[k] = $(this).is(':checked');
    });
    $('input[name="dlg-format"]').on('change', function () {
      state.format = $(this).val();
      // 切換時清空輸出
      var $out = $('#fmt-output');
      var $pane = $out.closest('.dlg-pane');
      $pane.find('.dlg-pane__title .dlg-badge').remove();
      $pane.find('.dlg-error-card').remove();
      $out.empty().html('<div class="dlg-pane__placeholder"><i class="bi bi-arrow-left-right"></i><div>點擊「執行」開始</div></div>');
      $out.data('text', '');
      $('#fmt-bson-types').attr('hidden', true);
      applyModeVisibility();
    });

    // 預設按鈕
    $('[data-preset]').on('click', function () {
      try {
        var p = JSON.parse($(this).attr('data-preset'));
        if (p.path) $('#ex-path').val(p.path);
        if (p.condition != null) $('#ex-cond').val(p.condition);
        DLG.UI.toast({ kind: 'info', message: '已套用預設' });
      } catch (e) {}
    });

    // 輸入即時格式化（僅格式化模式 + JSON）
    var debounce;
    $('#fmt-input').on('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        if (state.mode === 'format' && state.format === 'json') runFormat();
      }, 300);
    });
    $('#fmt-input').on('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); clearAll(); }
    });
    bindDragDrop($('#fmt-input'));
  }

  /* ============== 入口 ============== */
  $(function () {
    $('#dlg-year').text(new Date().getFullYear());
    DLG.UI.init();
    bindOutputActions();
    bindGutters();
    bindToolbar();
    bindPathSuggest();
    applyModeVisibility();

    var lastSpec = DLG.Storage.getLastSpec();
    if (lastSpec) {
      $('#ex-path').val(lastSpec.path || '');
      $('#ex-cond').val(lastSpec.condition || '');
    }

    $('#dlg-theme-toggle').on('click', function () { DLG.UI.toggleTheme(); });

    $('#dlg-burger').on('click', function () {
      var open = $('.dlg-nav').toggleClass('is-open').hasClass('is-open');
      $(this).attr('aria-expanded', open ? 'true' : 'false');
    });
  });
})();
