// 皇城探祕記：PWA 安裝功能（兩個頁面共用）
// 1. 註冊 Service Worker
// 2. Android / 電腦版 Chrome、Edge：顯示「安裝」按鈕，按下叫出系統安裝視窗
// 3. iPhone / iPad Safari：顯示「安裝」按鈕，按下說明「分享 → 加入主畫面」
// 4. 已經以 App 模式開啟、或使用者按了 × 關閉，就不再顯示
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var DISMISS_KEY = 'hcts-install-dismissed';
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;
  try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (e) {}

  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferredPrompt = null;
  var bar = null;

  var css = document.createElement('style');
  css.textContent =
    '.hcts-install{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));z-index:99999;display:flex;align-items:center;gap:4px;' +
    'background:#1c140d;border:1px solid #c9a24a;border-radius:24px;padding:4px 4px 4px 14px;box-shadow:0 4px 16px rgba(0,0,0,.45);font:600 14px/1 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;color:#f3e3b5}' +
    '.hcts-install button{border:0;cursor:pointer;font:inherit}' +
    '.hcts-install .go{background:linear-gradient(160deg,#f3d98a,#c9a24a);color:#2a1508;border-radius:20px;padding:8px 14px}' +
    '.hcts-install .x{background:none;color:#c9a24a;font-size:18px;padding:6px 10px}' +
    '.hcts-ios{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}' +
    '.hcts-ios div{background:#1c140d;color:#f3e3b5;border:1px solid #c9a24a;border-radius:16px;margin:16px;margin-bottom:calc(16px + env(safe-area-inset-bottom));padding:18px 20px;max-width:360px;font:15px/1.7 system-ui,-apple-system,"PingFang TC",sans-serif}' +
    '.hcts-ios b{color:#f3d98a}.hcts-ios button{margin-top:10px;width:100%;border:0;border-radius:20px;padding:10px;background:linear-gradient(160deg,#f3d98a,#c9a24a);color:#2a1508;font-weight:700;font-size:15px}';
  document.head.appendChild(css);

  function showBar() {
    if (bar || !document.body) return;
    bar = document.createElement('div');
    bar.className = 'hcts-install';
    bar.innerHTML = '<span>加入主畫面，像 App 一樣玩</span><button class="go" type="button">安裝</button><button class="x" type="button" aria-label="關閉">×</button>';
    bar.querySelector('.go').onclick = install;
    bar.querySelector('.x').onclick = function () {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      hideBar();
    };
    document.body.appendChild(bar);
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }

  function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () { deferredPrompt = null; hideBar(); });
    } else if (isIOS) {
      var m = document.createElement('div');
      m.className = 'hcts-ios';
      m.innerHTML = '<div>在 iPhone / iPad 上安裝：<br>1. 用 <b>Safari</b> 開啟這個網頁<br>2. 點下方的 <b>分享</b> 按鈕（方框加向上箭頭）<br>3. 選 <b>加入主畫面</b>，再按 <b>新增</b><button type="button">知道了</button></div>';
      m.onclick = function (e) { if (e.target === m || e.target.tagName === 'BUTTON') m.remove(); };
      document.body.appendChild(m);
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showBar();
  });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; hideBar(); });

  if (isIOS) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBar);
    else showBar();
  }
})();
