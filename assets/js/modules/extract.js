/* =========================================================
   extract.js — 按路徑 + 條件從 JSON/BSON 提取元素
   支持：
     · 路徑語法：a.b.c  /  a[*]  /  a[0]  /  a..b
     · 條件表達式：==  !=  >  <  >=  <=  && || !  ( )
                   字段名引用父對象屬性，_value 引用當前匹配值
   ========================================================= */
window.DLG = window.DLG || {};

DLG.Extract = (function () {
  'use strict';

  /* ============== 路徑解析 ============== */
  // 將 "accounts[*].accountNumber" 或 "$.accounts..balance" 解析成
  // 段數組：[ { kind: 'key', value: 'accounts' }, { kind: 'wild' }, { kind: 'key', value: 'accountNumber' } ]
  function parsePath(path) {
    if (!path || typeof path !== 'string') return [];
    var s = path.trim();
    if (s.charAt(0) === '$') s = s.slice(1);
    if (s.charAt(0) === '.') s = s.slice(1);

    var segs = [];
    var i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '.') {
        // 可能是 ".." 遞歸下降
        if (s.charAt(i + 1) === '.') {
          segs.push({ kind: 'recurse' });
          i += 2;
        } else {
          i++;
        }
      } else if (c === '[') {
        // 找 ']'
        var end = s.indexOf(']', i);
        if (end < 0) throw new Error('路徑中 [ 缺少對應的 ]：位置 ' + i);
        var inner = s.slice(i + 1, end).trim();
        if (inner === '*' || inner === '') segs.push({ kind: 'wild' });
        else if (/^\d+$/.test(inner)) segs.push({ kind: 'index', value: parseInt(inner, 10) });
        else throw new Error('不支持的路徑下標：[' + inner + ']');
        i = end + 1;
      } else if (c === '*' && s.charAt(i + 1) === '.') {
        segs.push({ kind: 'wild' });
        i++;
      } else if (c === '*' && i === s.length - 1) {
        segs.push({ kind: 'wild' });
        i++;
      } else if (/[a-zA-Z0-9_$]/.test(c)) {
        var j = i;
        while (j < s.length && /[a-zA-Z0-9_$\-]/.test(s.charAt(j))) j++;
        segs.push({ kind: 'key', value: s.slice(i, j) });
        i = j;
      } else if (c === ' ' || c === '\t') {
        i++;
      } else {
        throw new Error('路徑中含有非法字符：「' + c + '」位置 ' + i);
      }
    }
    return segs;
  }

  /** 根據路徑段，從 root 開始匹配所有節點；
   *  每個匹配結果記錄 { value, parent, path, key } */
  function matchAll(root, segs) {
    var results = [];
    function walk(value, parent, key, currentPath, segIdx) {
      if (segIdx >= segs.length) {
        results.push({ value: value, parent: parent, key: key, path: currentPath });
        return;
      }
      var seg = segs[segIdx];
      if (seg.kind === 'key') {
        if (value && typeof value === 'object' && !Array.isArray(value) && seg.value in value) {
          walk(value[seg.value], value, seg.value, currentPath + '.' + seg.value, segIdx + 1);
        }
      } else if (seg.kind === 'index') {
        if (Array.isArray(value) && seg.value < value.length) {
          walk(value[seg.value], value, seg.value, currentPath + '[' + seg.value + ']', segIdx + 1);
        }
      } else if (seg.kind === 'wild') {
        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i++) {
            walk(value[i], value, i, currentPath + '[' + i + ']', segIdx + 1);
          }
        } else if (value && typeof value === 'object') {
          var keys = Object.keys(value);
          for (var k = 0; k < keys.length; k++) {
            walk(value[keys[k]], value, keys[k], currentPath + '.' + keys[k], segIdx + 1);
          }
        }
      } else if (seg.kind === 'recurse') {
        // 先遞迴自身（深度優先）
        walk(value, parent, key, currentPath, segIdx + 1);
        // 再下鑽
        if (Array.isArray(value)) {
          for (var i2 = 0; i2 < value.length; i2++) {
            walk(value[i2], value, i2, currentPath + '[' + i2 + ']', segIdx);
          }
        } else if (value && typeof value === 'object') {
          var ks = Object.keys(value);
          for (var k2 = 0; k2 < ks.length; k2++) {
            walk(value[ks[k2]], value, ks[k2], currentPath + '.' + ks[k2], segIdx);
          }
        }
      }
    }
    walk(root, null, null, '$', 0);
    return results;
  }

  /* ============== 條件表達式解析 ============== */
  // 語法：
  //   expr     := or
  //   or       := and ('||' and)*
  //   and      := not ('&&' not)*
  //   not      := '!' not | primary
  //   primary  := '(' expr ')' | compare
  //   compare  := value (op value)?
  //   value    := number | string | true | false | null | ident
  //   ident    := 字母開頭，後接字母/數字/_/$
  //
  // 表達式可在「父對象上下文」中求值，標識符優先匹配父對象的屬性，
  // 否則嘗試 _value / _path 等內建變量。

  function tokenizeCondition(src) {
    var tokens = [];
    var i = 0;
    while (i < src.length) {
      var c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '(' || c === ')' || c === '!') { tokens.push({ t: c }); i++; continue; }
      if (c === '&' && src.charAt(i + 1) === '&') { tokens.push({ t: '&&' }); i += 2; continue; }
      if (c === '|' && src.charAt(i + 1) === '|') { tokens.push({ t: '||' }); i += 2; continue; }
      if (c === '=' && src.charAt(i + 1) === '=') { tokens.push({ t: '==' }); i += 2; continue; }
      if (c === '!' && src.charAt(i + 1) === '=') { tokens.push({ t: '!=' }); i += 2; continue; }
      if (c === '>' && src.charAt(i + 1) === '=') { tokens.push({ t: '>=' }); i += 2; continue; }
      if (c === '<' && src.charAt(i + 1) === '=') { tokens.push({ t: '<=' }); i += 2; continue; }
      if (c === '>') { tokens.push({ t: '>' }); i++; continue; }
      if (c === '<') { tokens.push({ t: '<' }); i++; continue; }
      if (c === '"' || c === '\'') {
        var quote = c; var j = i + 1; var str = '';
        while (j < src.length && src.charAt(j) !== quote) {
          if (src.charAt(j) === '\\' && j + 1 < src.length) {
            var next = src.charAt(j + 1);
            if (next === 'n') str += '\n';
            else if (next === 't') str += '\t';
            else if (next === 'r') str += '\r';
            else if (next === '\\') str += '\\';
            else if (next === quote) str += quote;
            else str += next;
            j += 2;
          } else { str += src.charAt(j); j++; }
        }
        if (j >= src.length) throw new Error('字符串未閉合：從位置 ' + i + ' 開始');
        tokens.push({ t: 'str', v: str });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src.charAt(i + 1)))) {
        var j2 = i + 1;
        while (j2 < src.length && /[0-9.]/.test(src.charAt(j2))) j2++;
        var numStr = src.slice(i, j2);
        var n = parseFloat(numStr);
        if (isNaN(n)) throw new Error('數字解析失敗：' + numStr);
        tokens.push({ t: 'num', v: n });
        i = j2;
        continue;
      }
      if (/[a-zA-Z_$]/.test(c)) {
        var j3 = i;
        while (j3 < src.length && /[a-zA-Z0-9_$\-]/.test(src.charAt(j3))) j3++;
        var ident = src.slice(i, j3);
        if (ident === 'true') tokens.push({ t: 'bool', v: true });
        else if (ident === 'false') tokens.push({ t: 'bool', v: false });
        else if (ident === 'null') tokens.push({ t: 'null' });
        else tokens.push({ t: 'ident', v: ident });
        i = j3;
        continue;
      }
      throw new Error('條件中含有無法識別的字符：「' + c + '」位置 ' + i);
    }
    return tokens;
  }

  function parseCondition(src) {
    var tokens = tokenizeCondition(src);
    var p = 0;

    function peek() { return tokens[p]; }
    function eat(t) { if (peek() && peek().t === t) { p++; return true; } return false; }
    function expect(t) { if (!eat(t)) throw new Error('條件缺少「' + t + '」'); }

    function parseOr() {
      var left = parseAnd();
      while (peek() && peek().t === '||') { p++; var right = parseAnd(); left = { op: '||', left: left, right: right }; }
      return left;
    }
    function parseAnd() {
      var left = parseNot();
      while (peek() && peek().t === '&&') { p++; var right = parseNot(); left = { op: '&&', left: left, right: right }; }
      return left;
    }
    function parseNot() {
      if (eat('!')) return { op: '!', expr: parseNot() };
      return parsePrimary();
    }
    function parsePrimary() {
      if (eat('(')) {
        var e = parseOr();
        expect(')');
        return e;
      }
      return parseCompare();
    }
    function parseCompare() {
      var left = parseValue();
      var t = peek();
      if (t && (t.t === '==' || t.t === '!=' || t.t === '>' || t.t === '<' || t.t === '>=' || t.t === '<=')) {
        p++;
        var right = parseValue();
        return { op: t.t, left: left, right: right };
      }
      // 布爾上下文：裸值
      return { op: 'truthy', expr: left };
    }
    function parseValue() {
      var t = peek();
      if (!t) throw new Error('條件意外結束');
      if (t.t === 'num') { p++; return { kind: 'lit', value: t.v }; }
      if (t.t === 'str') { p++; return { kind: 'lit', value: t.v }; }
      if (t.t === 'bool') { p++; return { kind: 'lit', value: t.v }; }
      if (t.t === 'null') { p++; return { kind: 'lit', value: null }; }
      if (t.t === 'ident') { p++; return { kind: 'ident', name: t.v }; }
      throw new Error('條件中遇到非預期 token：' + t.t);
    }

    var ast = parseOr();
    if (p < tokens.length) throw new Error('條件結尾有多餘 token');
    return ast;
  }

  function evalAst(node, scope) {
    if (node.op === '&&') return !!evalAst(node.left, scope) && !!evalAst(node.right, scope);
    if (node.op === '||') return !!evalAst(node.left, scope) || !!evalAst(node.right, scope);
    if (node.op === '!') return !evalAst(node.expr, scope);
    if (node.op === 'truthy') return !!resolve(node.expr, scope);
    // 比較運算
    var l = resolve(node.left, scope);
    var r = resolve(node.right, scope);
    switch (node.op) {
      case '==': return looseEq(l, r);
      case '!=': return !looseEq(l, r);
      case '>':  return num(l) >  num(r);
      case '<':  return num(l) <  num(r);
      case '>=': return num(l) >= num(r);
      case '<=': return num(l) <= num(r);
    }
    return false;
  }

  function resolve(node, scope) {
    if (node.kind === 'lit') return node.value;
    if (node.kind === 'ident') {
      if (Object.prototype.hasOwnProperty.call(scope, node.name)) return scope[node.name];
      if (node.name in scope) return scope[node.name];
      return undefined;
    }
    return undefined;
  }

  function looseEq(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == b; // eslint-disable-line eqeqeq
    if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    return a === b;
  }
  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      var n = parseFloat(v);
      return isNaN(n) ? NaN : n;
    }
    return NaN;
  }

  /** 編譯條件（可選） */
  function compileCondition(src) {
    if (!src || !src.trim()) return null;
    var ast = parseCondition(src);
    return function (scope) { return evalAst(ast, scope); };
  }

  /* ============== 公開 API ============== */
  function extract(input, spec) {
    spec = spec || {};
    var jsonParse = DLG.Json.parseSafe(input);
    if (!jsonParse.ok) {
      var loc = DLG.UI.locateError(input, jsonParse.error.position);
      return { ok: false, error: { message: jsonParse.error.message, line: loc.line, column: loc.column, position: jsonParse.error.position } };
    }
    var data = jsonParse.data;

    var segs;
    try { segs = parsePath(spec.path || ''); }
    catch (e) { return { ok: false, error: { message: '路徑錯誤：' + e.message } }; }

    if (segs.length === 0) return { ok: false, error: { message: '請輸入有效的路徑' } };

    var condFn = null;
    try { condFn = compileCondition(spec.condition || ''); }
    catch (e) { return { ok: false, error: { message: '條件錯誤：' + e.message } }; }

    var matches = matchAll(data, segs);
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (condFn) {
        var parentObj = (m.parent && typeof m.parent === 'object' && !Array.isArray(m.parent)) ? m.parent : {};
        var scope = Object.assign({}, parentObj, { _value: m.value, _path: m.path, _key: m.key });
        if (!condFn(scope)) continue;
      }
      if (spec.scalarOnly) {
        var t = typeof m.value;
        if (m.value !== null && (t === 'object' || Array.isArray(m.value))) continue;
      }
      filtered.push(m);
    }

    // 計數
    var bucket = new Map();
    for (var j = 0; j < filtered.length; j++) {
      var v = filtered[j].value;
      var key = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : typeof v + ':' + String(v);
      if (!bucket.has(key)) bucket.set(key, { value: v, count: 0, paths: [] });
      var entry = bucket.get(key);
      entry.count++;
      entry.paths.push(filtered[j].path);
    }
    var values = [];
    bucket.forEach(function (v) { values.push(v); });
    values.sort(function (a, b) { return b.count - a.count; });

    return {
      ok: true,
      total: filtered.length,
      values: values,
      distinct: values.map(function (v) { return v.value; }),
      matches: filtered.map(function (m) { return { path: m.path, value: m.value }; })
    };
  }

  return {
    parsePath: parsePath,
    extract: extract,
    compileCondition: compileCondition
  };
})();
