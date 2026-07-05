/* =========================================================
   bson.js — BSON 校驗與格式化
   依賴：window.BSON（jsDelivr 上的 bson.browser.min.js）
   ========================================================= */
window.DLG = window.DLG || {};

DLG.Bson = (function () {
  'use strict';

  function detectMode(input) {
    if (input == null) return 'extended-json';
    var s = String(input).trim();
    if (!s) return 'extended-json';
    // Hex: 偶數長度 + 只含 0-9 a-f A-F + 通常 16+ 長度
    if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0 && s.length >= 16) {
      // 排除它看起來就是 JSON 的情況
      return 'hex';
    }
    // Base64：典型特徵（但可能誤判，所以優先看是否包含結構）
    if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0 && s.length >= 12) {
      return 'base64';
    }
    return 'extended-json';
  }

  function hexToBuffer(hex) {
    var clean = hex.replace(/\s+/g, '');
    if (clean.length % 2 !== 0) throw new Error('Hex 長度必須為偶數');
    if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error('Hex 含有非法字符');
    var len = clean.length / 2;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return arr.buffer;
  }

  function bufferToHex(buf) {
    var view = new Uint8Array(buf);
    var parts = [];
    for (var i = 0; i < view.length; i++) {
      parts.push(('0' + view[i].toString(16)).slice(-2));
    }
    return parts.join('').toUpperCase();
  }

  function bufferToBase64(buf) {
    var view = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
    return btoa(bin);
  }

  function base64ToBuffer(b64) {
    var clean = b64.replace(/\s+/g, '');
    var bin = atob(clean);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  function ensureBson() {
    if (!window.BSON) throw new Error('BSON 庫未加載');
    return window.BSON;
  }

  function parse(input, mode) {
    if (!mode) mode = detectMode(input);
    try {
      var BSON = ensureBson();
      var buf;
      if (mode === 'hex') buf = hexToBuffer(input);
      else if (mode === 'base64') buf = base64ToBuffer(input);
      else {
        // extended-json：BSON 庫可直接 parse
        var doc = BSON.EJSON.parse(String(input), { relaxed: false });
        var types = collectTypes(doc, '$');
        return { ok: true, doc: doc, types: types, mode: mode };
      }
      var doc2 = BSON.deserialize(buf);
      var types2 = collectTypes(doc2, '$');
      return { ok: true, doc: doc2, types: types2, mode: mode };
    } catch (e) {
      return { ok: false, error: (e && e.message) || '解析失敗', mode: mode };
    }
  }

  function toJson(input, mode, indent) {
    var p = parse(input, mode);
    if (!p.ok) return p;
    indent = (indent == null) ? 2 : indent;
    var EJSON = ensureBson().EJSON;
    var text = EJSON.stringify(p.doc, null, indent);
    return { ok: true, text: text, doc: p.doc, types: p.types };
  }

  function toCompactJson(input, mode) {
    var p = parse(input, mode);
    if (!p.ok) return p;
    var text = ensureBson().EJSON.stringify(p.doc, null, 0);
    return { ok: true, text: text };
  }

  /** 遞迴收集 BSON 類型，輸出類似 [{ path: '$._id', bsonType: 'ObjectId' }] */
  function collectTypes(value, path) {
    var out = [];
    function walk(v, p) {
      if (v == null) { out.push({ path: p, bsonType: 'Null' }); return; }
      if (Array.isArray(v)) {
        out.push({ path: p, bsonType: 'Array' });
        for (var i = 0; i < v.length; i++) walk(v[i], p + '[' + i + ']');
        return;
      }
      if (typeof v === 'object') {
        // 判斷 BSON 特殊類型
        var bsonType = v._bsontype;
        if (bsonType) {
          out.push({ path: p, bsonType: bsonType });
          // 不下鑽特殊類型
          return;
        }
        out.push({ path: p, bsonType: 'Object' });
        var keys = Object.keys(v);
        for (var k = 0; k < keys.length; k++) walk(v[keys[k]], p + '.' + keys[k]);
        return;
      }
      out.push({ path: p, bsonType: typeof v === 'number' ? (Number.isInteger(v) ? 'Int32/Number' : 'Number') : (typeof v[0] === 'u' ? 'String' : typeof v) });
    }
    walk(value, path);
    return out;
  }

  /** 統計類型出現次數 */
  function summarizeTypes(types) {
    var m = {};
    for (var i = 0; i < types.length; i++) {
      var t = types[i].bsonType;
      m[t] = (m[t] || 0) + 1;
    }
    var list = [];
    var keys = Object.keys(m).sort();
    for (var k = 0; k < keys.length; k++) list.push({ type: keys[k], count: m[keys[k]] });
    return list;
  }

  return {
    detectMode: detectMode,
    parse: parse,
    toJson: toJson,
    toCompactJson: toCompactJson,
    summarizeTypes: summarizeTypes,
    bufferToHex: bufferToHex,
    bufferToBase64: bufferToBase64
  };
})();
