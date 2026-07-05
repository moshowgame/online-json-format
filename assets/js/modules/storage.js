/* =========================================================
   storage.js — localStorage 封裝
   ========================================================= */
window.DLG = window.DLG || {};

DLG.Storage = (function () {
  'use strict';

  var NS = 'dlg.';

  function safeGet(key) {
    try {
      var raw = localStorage.getItem(NS + key);
      if (raw == null) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(NS + key); } catch (e) {}
  }

  return {
    get: safeGet,
    set: safeSet,
    remove: safeRemove,

    /** 主題 */
    getTheme: function () { return safeGet('theme') || 'light'; },
    setTheme: function (t) { safeSet('theme', t); },

    /** 用戶偏好（縮進、排序、轉義等） */
    getSettings: function () {
      return safeGet('settings') || {
        indent: 2,
        sortKeys: false,
        escapeUnicode: false,
        caseSensitive: true,
        distinct: true,
        scalarOnly: true
      };
    },
    setSettings: function (s) { safeSet('settings', s); },

    /** 提取頁最後一次配置 */
    getLastSpec: function () {
      return safeGet('lastSpec') || { path: 'accounts[*].accountNumber', condition: 'accountLocation == "CN"' };
    },
    setLastSpec: function (s) { safeSet('lastSpec', s); },

    /** 歷史記錄（最多 20 條） */
    getHistory: function () { return safeGet('history') || []; },
    pushHistory: function (entry) {
      var list = safeGet('history') || [];
      list.unshift({
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        type: entry.type,
        preview: (entry.content || '').slice(0, 200),
        ts: Date.now()
      });
      if (list.length > 20) list = list.slice(0, 20);
      safeSet('history', list);
    },
    clearHistory: function () { safeSet('history', []); }
  };
})();
