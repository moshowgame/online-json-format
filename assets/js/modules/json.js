/* =========================================================
   json.js — JSON 校驗與格式化
   ========================================================= */
window.DLG = window.DLG || {};

DLG.Json = (function () {
  'use strict';

  function parseSafe(input) {
    if (input == null || input === '') {
      return { ok: false, error: { message: '輸入為空', position: 0 } };
    }
    try {
      return { ok: true, data: JSON.parse(input) };
    } catch (e) {
      // 嘗試提取位置
      var m = /position\s+(\d+)/i.exec(e && e.message || '');
      var pos = m ? parseInt(m[1], 10) : 0;
      return { ok: false, error: { message: (e && e.message) || '解析失敗', position: pos } };
    }
  }

  function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
      var keys = Object.keys(value).sort();
      var out = {};
      for (var i = 0; i < keys.length; i++) out[keys[i]] = sortKeys(value[keys[i]]);
      return out;
    }
    return value;
  }

  function toIndentString(indent) {
    if (indent === '\t') return '\t';
    if (typeof indent === 'number' && indent > 0) return ' '.repeat(indent);
    return '  ';
  }

  function format(input, opts) {
    opts = opts || {};
    var parsed = parseSafe(input);
    if (!parsed.ok) {
      var loc = DLG.UI.locateError(input, parsed.error.position);
      return {
        ok: false,
        error: {
          message: parsed.error.message,
          line: loc.line,
          column: loc.column,
          position: parsed.error.position
        }
      };
    }
    var data = parsed.data;
    if (opts.sortKeys) data = sortKeys(data);
    var indentStr = toIndentString(opts.indent);
    var text;
    try {
      text = JSON.stringify(data, null, indentStr);
    } catch (e) {
      return { ok: false, error: { message: e.message, line: 1, column: 1, position: 0 } };
    }
    if (opts.escapeUnicode) {
      text = text.replace(/[-￿]/g, function (c) {
        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
      });
    }
    return { ok: true, text: text };
  }

  function minify(input) {
    var parsed = parseSafe(input);
    if (!parsed.ok) {
      var loc = DLG.UI.locateError(input, parsed.error.position);
      return {
        ok: false,
        error: { message: parsed.error.message, line: loc.line, column: loc.column, position: parsed.error.position }
      };
    }
    return { ok: true, text: JSON.stringify(parsed.data) };
  }

  return { parseSafe: parseSafe, format: format, minify: minify, sortKeys: sortKeys };
})();
