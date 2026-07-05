/* =========================================================
   ui.js — Toast、Modal、主題切換、實用工具
   ========================================================= */
window.DLG = window.DLG || {};

DLG.UI = (function () {
  'use strict';

  var $stack;

  function init() {
    $stack = $('#dlg-toast-stack');
    bindGlobalKeys();
    applyTheme(DLG.Storage.getTheme());
  }

  function applyTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);
    DLG.Storage.setTheme(theme);
    var icon = theme === 'dark' ? 'bi-sun' : 'bi-moon-stars';
    $('#dlg-theme-toggle i').attr('class', 'bi ' + icon);

    // highlight.js 主題切換
    if (theme === 'dark') {
      $('#hljs-light').attr('disabled', 'disabled');
      $('#hljs-dark').removeAttr('disabled');
    } else {
      $('#hljs-dark').attr('disabled', 'disabled');
      $('#hljs-light').removeAttr('disabled');
    }
  }

  function toggleTheme() {
    var cur = DLG.Storage.getTheme();
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  function toast(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    opts = opts || {};
    var kind = opts.kind || 'info';
    var title = opts.title || ({
      success: '成功', danger: '錯誤', warning: '警告', info: '提示'
    })[kind] || '提示';
    var message = opts.message || '';
    var timeout = opts.timeout == null ? 3500 : opts.timeout;

    var icon = ({
      success: 'bi-check-circle-fill',
      danger: 'bi-x-octagon-fill',
      warning: 'bi-exclamation-triangle-fill',
      info: 'bi-info-circle-fill'
    })[kind] || 'bi-info-circle-fill';

    var $t = $(
      '<div class="dlg-toast dlg-toast--' + kind + '" role="alert">' +
        '<i class="bi ' + icon + '"></i>' +
        '<div class="dlg-toast__body">' +
          '<div class="dlg-toast__title"></div>' +
          '<div class="dlg-toast__msg"></div>' +
        '</div>' +
        '<button type="button" class="dlg-toast__close" aria-label="關閉"><i class="bi bi-x-lg"></i></button>' +
      '</div>'
    );
    $t.find('.dlg-toast__title').text(title);
    $t.find('.dlg-toast__msg').text(message);
    $t.find('.dlg-toast__close').on('click', function () { dismiss(); });
    $stack.append($t);

    var timer = setTimeout(dismiss, timeout);

    function dismiss() {
      clearTimeout(timer);
      $t.css({ animation: 'dlgSlideIn 200ms reverse' });
      setTimeout(function () { $t.remove(); }, 180);
    }
  }

  function bindGlobalKeys() {
    $(document).on('keydown', function (e) {
      // Ctrl+/ 切換主題
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }

  /** 安全的 HTML 轉義 */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 用 highlight.js 著色（容錯） */
  function highlight(language, code) {
    if (window.hljs && code) {
      try {
        return window.hljs.highlight(code, { language: language || 'json', ignoreIllegals: true }).value;
      } catch (e) {
        return escapeHtml(code);
      }
    }
    return escapeHtml(code);
  }

  /** 將 JSON 字符串以可讀 HTML 形式輸出（含語法著色） */
  function prettyJsonHtml(jsonStr) {
    return highlight('json', jsonStr);
  }

  /** 下載文本到文件 */
  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  /** 複製到剪貼簿（帶後備） */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /** 計算字符串的行列位置（用於錯誤提示） */
  function locateError(text, position) {
    if (typeof position !== 'number' || position < 0) return { line: 1, column: 1 };
    var line = 1, col = 1;
    for (var i = 0; i < position && i < text.length; i++) {
      if (text.charCodeAt(i) === 10) { line++; col = 1; }
      else col++;
    }
    return { line: line, column: col };
  }

  return {
    init: init,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    toast: toast,
    escapeHtml: escapeHtml,
    highlight: highlight,
    prettyJsonHtml: prettyJsonHtml,
    downloadText: downloadText,
    copyToClipboard: copyToClipboard,
    locateError: locateError
  };
})();
