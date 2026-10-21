// 相約北京：旅途相簿與旅遊書
// - 照片以「原始檔案」存在瀏覽器的 IndexedDB（不壓縮、不重新編碼，畫質不變）
// - 每個人可在自己的手機寫「見聞」、拍照，並標示是誰記錄的
// - 以 JSON 檔分享給親友，對方匯入後自動合併、略過重複，可一直累加
// - 合併後可產出旅遊書：文字後標（誰說的）、照片後標（誰拍的）
(function () {
  'use strict';
  if (typeof DAYS === 'undefined') return;

  var DB_NAME = 'bj-journal', STORE = 'items', FORMAT = 'beijing-trip-album';
  var LS_AUTHOR = 'bjj-author', LS_LAST = 'bjj-last-export', LS_BOOK = 'bjj-book-title';
  var TRIP_YEAR = 2026;
  var isTouch = window.matchMedia('(pointer:coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);

  /* ---------------- 小工具 ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function uid(p) { return (p || 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(n > 1e8 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localStamp(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function niceTime(s) { var m = String(s || '').match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/); return m ? (+m[2]) + '/' + (+m[3]) + ' ' + m[4] + ':' + m[5] : ''; }
  function hhmm(s) { var m = String(s || '').match(/[ T](\d\d:\d\d)/); return m ? m[1] : ''; }
  function author() { return lsGet(LS_AUTHOR, ''); }
  function curDay() { return DAYS[currentDayIdx]; }
  function dayById(id) { for (var i = 0; i < DAYS.length; i++) if (DAYS[i].id === id) return DAYS[i]; return null; }
  function dayDate(d) { var m = String(d.title || '').match(/(\d{1,2})\/(\d{1,2})/); return m ? (+m[1]) + '/' + (+m[2]) : ''; }
  var DATE2DAY = {};
  DAYS.forEach(function (d) { var m = String(d.title || '').match(/(\d{1,2})\/(\d{1,2})/); if (m) DATE2DAY[TRIP_YEAR + '-' + pad(+m[1]) + '-' + pad(+m[2])] = d.id; });
  function isPhoto(r) { return r.kind !== 'note'; }
  function isNote(r) { return r.kind === 'note'; }
  // 自己的紀錄（mine）不必每次署名，名字在匯出 JSON 時才填，並套用到所有自己的紀錄
  function who(r) { return r.mine ? (author() || '我') : (r.author || '未署名'); }

  /* ---------------- IndexedDB ---------------- */
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function dbAll() { return db().then(function (d) { return new Promise(function (res, rej) { var q = d.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = function () { res(q.result || []); }; q.onerror = function () { rej(q.error); }; }); }); }
  function dbPut(recs) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE); recs.forEach(function (r) { s.put(r); }); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error('abort')); }; }); }); }
  function dbDel(id) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(id); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); }); }

  var ALL = [];
  var thumbURL = {};
  function tURL(r) { if (!thumbURL[r.id]) thumbURL[r.id] = URL.createObjectURL(r.thumb || r.blob); return thumbURL[r.id]; }
  function forget(id) { if (thumbURL[id]) { URL.revokeObjectURL(thumbURL[id]); delete thumbURL[id]; } }
  function reload() { return dbAll().then(function (rows) { ALL = rows; }); }
  function byTime(a, b) { return (a.takenAt || '').localeCompare(b.takenAt || '') || (a.addedAt || '').localeCompare(b.addedAt || ''); }
  function photos() { return ALL.filter(isPhoto); }

  /* ---------------- EXIF 拍攝時間 ---------------- */
  function exifDate(blob) {
    if (!/jpe?g/i.test(blob.type || '') && !/\.jpe?g$/i.test(blob.name || '')) return Promise.resolve(null);
    return blob.slice(0, 196608).arrayBuffer().then(function (buf) {
      var v = new DataView(buf);
      if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
      var off = 2;
      while (off + 10 < v.byteLength) {
        var mk = v.getUint16(off), len = v.getUint16(off + 2);
        if (mk === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
        if ((mk & 0xFF00) !== 0xFF00) break;
        off += 2 + len;
      }
      return null;
    }).catch(function () { return null; });
  }
  function readTiff(v, t) {
    try {
      var le = v.getUint16(t) === 0x4949;
      var u16 = function (o) { return v.getUint16(o, le); }, u32 = function (o) { return v.getUint32(o, le); };
      var scan = function (ifd, want) { var n = u16(ifd), f = {}; for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; if (e + 12 > v.byteLength) break; if (want.indexOf(u16(e)) >= 0) f[u16(e)] = e; } return f; };
      var str = function (e) { var c = u32(e + 4), o = c > 4 ? t + u32(e + 8) : e + 8, s = ''; for (var i = 0; i < c - 1 && o + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(o + i)); return s; };
      var f0 = scan(t + u32(t + 4), [0x8769, 0x0132]), dt = null;
      if (f0[0x8769]) { var f1 = scan(t + u32(f0[0x8769] + 8), [0x9003, 0x9004]); if (f1[0x9003] || f1[0x9004]) dt = str(f1[0x9003] || f1[0x9004]); }
      if (!dt && f0[0x0132]) dt = str(f0[0x0132]);
      var m = dt && dt.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/);
      return m ? m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] : null;
    } catch (e) { return null; }
  }

  /* ---------------- 縮圖（只用於畫面瀏覽，原圖完全不動） ---------------- */
  function makeThumb(blob) {
    return new Promise(function (res) {
      var u = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) { URL.revokeObjectURL(u); res(b || null); }, 'image/jpeg', 0.82);
        } catch (e) { URL.revokeObjectURL(u); res(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(null); };
      img.src = u;
    });
  }

  /* ---------------- 下載／存到相簿 ---------------- */
  var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif' };
  function safe(s) { return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24); }
  function fileName(r, i) {
    var ext = EXT[r.type] || ((r.name || '').split('.').pop() || 'jpg').toLowerCase();
    var time = (r.takenAt || '').replace(/[-: ]/g, '').slice(4, 12);
    return ['北京', 'Day' + r.day, safe(r.place), safe(r.mine ? author() : r.author), time || String(i + 1)].filter(Boolean).join('_') + '.' + ext;
  }
  function downloadFiles(files) {
    files.forEach(function (f, i) {
      setTimeout(function () {
        var a = document.createElement('a'), u = URL.createObjectURL(f);
        a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
      }, i * 400);
    });
  }
  // 手機：叫出系統分享選單（可「儲存影像」到相簿）；電腦：直接下載原始檔
  function saveFiles(files, okMsg) {
    if (isTouch && navigator.canShare && navigator.share) {
      var ok = false; try { ok = navigator.canShare({ files: files }); } catch (e) {}
      if (ok) {
        navigator.share({ files: files }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          if (e && e.name === 'NotAllowedError') { toast('再按一次就能儲存', { label: '儲存', fn: function () { saveFiles(files, okMsg); } }); return; }
          downloadFiles(files); toast(okMsg);
        });
        return;
      }
    }
    downloadFiles(files); toast(okMsg);
  }
  function saveRecords(recs) {
    var files = recs.map(function (r, i) { return new File([r.blob], fileName(r, i), { type: r.type || r.blob.type || 'image/jpeg' }); });
    saveFiles(files, '已開始下載 ' + files.length + ' 張原圖');
  }

  /* ---------------- 提示訊息 ---------------- */
  var toastEl = null, toastT = 0;
  function toast(msg, action) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'jr-toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    if (action) toastEl.querySelector('button').onclick = function () { toastEl.classList.remove('show'); action.fn(); };
    clearTimeout(toastT);
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, action ? 7000 : 3200);
  }

  /* ---------------- 底部面板 ---------------- */
  function unlock() { if (!document.querySelector('.jr-overlay,.jr-lb,.jr-book')) document.body.classList.remove('jr-lock'); }
  function openSheet(title, html, onClose) {
    var ov = document.createElement('div');
    ov.className = 'jr-overlay';
    ov.style.setProperty('--day-color', curDay().color);
    ov.innerHTML = '<div class="jr-sheet" role="dialog" aria-modal="true"><div class="jr-grab"></div><div class="jr-sheet-head"><h3>' + esc(title) + '</h3><button class="jr-x" type="button" aria-label="關閉">✕</button></div><div class="jr-sheet-body">' + html + '</div></div>';
    document.body.appendChild(ov); document.body.classList.add('jr-lock');
    requestAnimationFrame(function () { ov.classList.add('show'); });
    var closed = false;
    function close() { if (closed) return; closed = true; ov.classList.remove('show'); setTimeout(function () { ov.remove(); unlock(); }, 200); if (onClose) onClose(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.jr-x').onclick = close;
    ov.close = close;
    return ov;
  }

  /* ---------------- 地點 ---------------- */
  function placesOf(day) {
    var out = [];
    day.stops.forEach(function (s, i) { out.push({ name: s.name, label: (i + 1) + '. ' + s.name, kind: 'stop', n: i + 1 }); });
    day.meals.forEach(function (m) { out.push({ name: m.name, label: '🍽 ' + m.name, kind: 'meal' }); });
    [day.hotel, day.altHotel].filter(Boolean).forEach(function (h) { if (!h.skipBounds) out.push({ name: h.name, label: '🏨 ' + h.name, kind: 'hotel' }); });
    return out;
  }

  // 「哪一天／在哪裡／拍攝者」共用選擇器
  function pickerHTML(authorLabel) {
    return '<div class="jr-label">哪一天</div><div class="jr-chips jr-days" data-k="days"></div><div class="jr-hint" data-k="dayhint"></div>' +
      '<div data-k="placewrap"><div class="jr-label">在哪裡</div><div class="jr-chips" data-k="places"></div>' +
      '<input class="jr-input" data-k="custom" placeholder="輸入地點，例如：南鑼鼓巷" style="display:none;margin-top:10px;"></div>' +
      '';
  }
  function bindPicker(sheet, st) {
    var K = function (k) { return sheet.querySelector('[data-k="' + k + '"]'); };
    function drawDays() {
      var h = '';
      if (st.autoDays && st.autoDays.length > 1) h += '<button class="jr-chip' + (st.auto ? ' on' : '') + '" data-d="auto" type="button">📅 依拍攝日期</button>';
      DAYS.forEach(function (d) { h += '<button class="jr-chip' + (!st.auto && st.day === d.id ? ' on' : '') + '" data-d="' + d.id + '" type="button" style="--day-color:' + d.color + '">' + esc(d.label) + '<small>' + dayDate(d) + '</small></button>'; });
      K('days').innerHTML = h;
      $$('.jr-chip', K('days')).forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.d === 'auto') st.auto = true;
          else { st.auto = false; st.day = +b.dataset.d; if (!placesOf(dayById(st.day)).some(function (x) { return x.name === st.place; }) && !st.customOpen) st.place = ''; }
          drawDays(); drawPlaces();
        };
      });
      K('dayhint').textContent = st.auto ? '照片拍攝於不同天，會依拍攝日期自動放到 ' + st.autoDays.map(function (id) { return 'Day ' + id; }).join('、') + '。' : '';
      K('placewrap').style.display = st.auto ? 'none' : '';
      var on = K('days').querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    function drawPlaces() {
      var d = dayById(st.day); if (!d) return;
      var list = placesOf(d);
      if (st.place && !list.some(function (x) { return x.name === st.place; })) st.customOpen = true;
      var h = list.map(function (x) { return '<button class="jr-chip' + (!st.customOpen && st.place === x.name ? ' on' : '') + '" data-p="' + esc(x.name) + '" type="button" style="--day-color:' + d.color + '">' + esc(x.label) + '</button>'; }).join('');
      h += '<button class="jr-chip' + (st.customOpen ? ' on' : '') + '" data-p="__c" type="button" style="--day-color:' + d.color + '">✏️ 其他地點</button>';
      h += '<button class="jr-chip' + (!st.customOpen && !st.place ? ' on' : '') + '" data-p="" type="button" style="--day-color:#8B5E34">不指定</button>';
      K('places').innerHTML = h;
      var ci = K('custom'); ci.style.display = st.customOpen ? '' : 'none'; if (st.customOpen && !ci.value) ci.value = st.place;
      $$('.jr-chip', K('places')).forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.p === '__c') { st.customOpen = true; st.place = ci.value.trim(); drawPlaces(); K('custom').focus(); return; }
          st.customOpen = false; st.place = b.dataset.p; drawPlaces();
        };
      });
    }
    K('custom').addEventListener('input', function (e) { st.place = e.target.value.trim(); });
    return {
      redraw: function () { drawDays(); drawPlaces(); },
      place: function () { return st.auto ? '' : (st.customOpen ? K('custom').value.trim() : st.place); }
    };
  }

  /* ---------------- 新增照片 ---------------- */
  var fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  var preset = null, appendTo = null;
  function pickPhotos(p) { preset = p || null; appendTo = null; fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []).filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name); });
    if (!files.length) return;
    if (appendTo) { var cb = appendTo; appendTo = null; cb(files); return; }
    openAddPhotos(files, preset);
  });

  function openAddPhotos(files, p) {
    var items = files.map(function (f) { return { file: f, url: URL.createObjectURL(f), taken: null }; });
    var st = { day: p && p.day ? p.day : curDay().id, place: p && p.place ? p.place : '', auto: false, autoDays: null };
    var html = '<div class="jr-previews" data-k="prev"></div>' + pickerHTML('拍攝者') +
      '<div class="jr-label">照片說明（可不填）</div><textarea class="jr-textarea" data-k="note" placeholder="這張照片想說的話：天氣、心情、好吃的…"></textarea>' +
      '<div class="jr-actions"><button class="jr-btn primary" data-k="save" type="button">儲存</button></div>' +
      '<div class="jr-hint" style="text-align:center;margin-top:10px;">照片以原始畫質保存在這支手機的瀏覽器裡</div>';
    var sheet = openSheet('新增照片', html, function () { items.forEach(function (it) { URL.revokeObjectURL(it.url); }); });
    var pk = bindPicker(sheet, st), saveBtn = sheet.querySelector('[data-k="save"]');

    function drawPrev() {
      var box = sheet.querySelector('[data-k="prev"]');
      box.innerHTML = items.map(function (it) { return '<img src="' + it.url + '" alt="">'; }).join('') + '<button class="more" type="button" aria-label="再加照片">＋</button>';
      box.querySelector('.more').onclick = function () { appendTo = function (more) { more.forEach(function (f) { items.push({ file: f, url: URL.createObjectURL(f), taken: null }); }); readDates(); }; fileInput.value = ''; fileInput.click(); };
      saveBtn.textContent = '儲存 ' + items.length + ' 張照片';
    }
    function readDates() {
      drawPrev();
      Promise.all(items.map(function (it) { return it.taken ? it.taken : exifDate(it.file).then(function (t) { return (it.taken = t || localStamp(new Date(it.file.lastModified || Date.now()))); }); })).then(function () {
        if (!(p && p.day)) {   // 從景點進來就以景點為準；否則依拍攝日期判斷是第幾天
          var ds = []; items.forEach(function (it) { var id = DATE2DAY[it.taken.slice(0, 10)]; if (id && ds.indexOf(id) < 0) ds.push(id); });
          ds.sort(function (a, b) { return a - b; }); st.autoDays = ds;
          if (ds.length === 1) { st.auto = false; st.day = ds[0]; } else if (ds.length > 1) st.auto = true;
        }
        pk.redraw();
      });
    }
    pk.redraw(); readDates();

    saveBtn.onclick = function () {
      var note = sheet.querySelector('[data-k="note"]').value.trim(), place = pk.place();
      saveBtn.disabled = true;
      var recs = [], i = 0, now = new Date().toISOString(), have = {}, dup = 0;
      ALL.forEach(function (r) { if (r.fp) have[r.fp] = 1; });
      (function next() {
        if (i >= items.length) {
          if (!recs.length) { sheet.close(); toast(dup ? '這些照片已經在相簿裡了' : '沒有可儲存的照片'); return; }
          dbPut(recs).then(reload).then(function () {
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
            sheet.close(); refresh();
            toast('已儲存 ' + recs.length + ' 張照片' + (dup ? '（略過 ' + dup + ' 張重複）' : ''));
          }).catch(function (e) {
            saveBtn.disabled = false; saveBtn.textContent = '再試一次';
            toast(e && e.name === 'QuotaExceededError' ? '空間不足，請先分享備份後刪除部分照片' : '儲存失敗，請再試一次');
          });
          return;
        }
        saveBtn.textContent = '處理中 ' + (i + 1) + ' / ' + items.length + '…';
        var it = items[i++], f = it.file, taken = it.taken || localStamp(new Date(f.lastModified || Date.now()));
        var fp = [f.size, taken, f.name].join('|');
        if (have[fp]) { dup++; return next(); }
        have[fp] = 1;
        var day = st.auto ? (DATE2DAY[taken.slice(0, 10)] || curDay().id) : st.day;
        makeThumb(f).then(function (th) {
          recs.push({ id: uid('p'), kind: 'photo', fp: fp, day: day, place: place, note: note, author: '', mine: true, takenAt: taken, addedAt: now, localAddedAt: now, name: f.name, type: f.type || 'image/jpeg', size: f.size, blob: f, thumb: th });
          next();
        });
      })();
    };
  }

  /* ---------------- 寫見聞（新增／修改） ---------------- */
  function openNote(p, existing) {
    var r = existing || null;
    var st = { day: r ? r.day : (p && p.day) || curDay().id, place: r ? r.place : (p && p.place) || '', auto: false };
    var html = '<div class="jr-label" style="margin-top:4px">見聞與心得</div>' +
      '<textarea class="jr-textarea big" data-k="text" placeholder="今天看到、聽到、吃到什麼？有什麼感覺？\n例如：太和殿比想像中大好多，導遊說皇帝上朝要走好久…">' + esc(r ? r.text : '') + '</textarea>' +
      '<div class="jr-chips" style="margin-top:10px"><button class="jr-chip' + (r && r.star ? ' on' : '') + '" data-k="star" type="button" style="--day-color:#C9962E">★ 標為重點（旅遊書會特別標示）</button></div>' +
      pickerHTML('記錄者') +
      '<div class="jr-actions">' + (r ? '<button class="jr-btn" data-k="del" type="button">🗑 刪除</button>' : '') + '<button class="jr-btn primary" data-k="save" type="button">' + (r ? '儲存修改' : '儲存見聞') + '</button></div>';
    var sheet = openSheet(r ? '修改見聞' : '寫下見聞', html);
    var pk = bindPicker(sheet, st); pk.redraw();
    var starBtn = sheet.querySelector('[data-k="star"]'); starBtn.onclick = function () { starBtn.classList.toggle('on'); };
    var ta = sheet.querySelector('[data-k="text"]'); if (!r) setTimeout(function () { ta.focus(); }, 250);
    sheet.querySelector('[data-k="save"]').onclick = function () {
      var text = ta.value.trim(); if (!text) { ta.focus(); toast('先寫點什麼吧'); return; }
      var now = new Date().toISOString();
      var rec = r ? Object.assign({}, r, { text: text, day: st.day, place: pk.place(), star: starBtn.classList.contains('on'), editedAt: now, localAddedAt: now })
        : { id: uid('n'), kind: 'note', day: st.day, place: pk.place(), star: starBtn.classList.contains('on'), text: text, author: '', mine: true, takenAt: localStamp(new Date()), addedAt: now, localAddedAt: now };
      dbPut([rec]).then(reload).then(function () { sheet.close(); refresh(); toast(r ? '已更新' : '已記下這段見聞'); }).catch(function () { toast('儲存失敗，請再試一次'); });
    };
    var del = sheet.querySelector('[data-k="del"]');
    if (del) del.onclick = function () {
      if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = '確定刪除？'; return; }
      dbDel(r.id).then(reload).then(function () { sheet.close(); refresh(); toast('已刪除'); });
    };
  }

  // 浮動按鈕：選擇要拍照還是寫見聞
  function openChooser(p) {
    var sheet = openSheet('記錄這一刻', '<div class="jr-choose">' +
      '<button class="jr-bigchoice" data-c="photo" type="button"><span>📷</span><b>拍照／選照片</b><small>原始畫質保存</small></button>' +
      '<button class="jr-bigchoice" data-c="note" type="button"><span>✍️</span><b>寫下見聞</b><small>旅遊書的旁白</small></button></div>' +
      '<div class="jr-hint" style="text-align:center;margin-top:12px;">' + esc(curDay().label + '・' + curDay().short) + '</div>');
    sheet.querySelector('[data-c="photo"]').onclick = function () { sheet.close(); pickPhotos(p); };
    sheet.querySelector('[data-c="note"]').onclick = function () { sheet.close(); setTimeout(function () { openNote(p); }, 220); };
  }

  /* ---------------- 相簿畫面 ---------------- */
  var mount = null, selecting = false, selected = {}, fab = null, selbar = null;

  function dayItems(dayId) { return ALL.filter(function (r) { return r.day === dayId; }).sort(byTime); }
  // 依行程順序分組：景點 → 餐廳 → 飯店 → 其他地點 → 未指定
  function groupsFor(day, items) {
    items = items || dayItems(day.id);
    var groups = [], used = {};
    placesOf(day).forEach(function (pl) { var g = items.filter(function (r) { return r.place === pl.name; }); used[pl.name] = 1; if (g.length) groups.push({ place: pl, items: g }); });
    var others = {}, order = [];
    items.forEach(function (r) { if (r.place && !used[r.place]) { if (!others[r.place]) { others[r.place] = []; order.push(r.place); } others[r.place].push(r); } });
    order.forEach(function (k) { groups.push({ place: { name: k, label: k, kind: 'custom' }, items: others[k] }); });
    var none = items.filter(function (r) { return !r.place; });
    if (none.length) groups.push({ place: { name: '', label: '旅途隨記', kind: 'none' }, items: none });
    return groups;
  }
  function pinHTML(pl) { return '<span class="pin">' + (pl.kind === 'stop' ? pl.n : pl.kind === 'meal' ? '🍽' : pl.kind === 'hotel' ? '🏨' : '📍') + '</span>'; }
  function placeTitle(pl) { return pl.kind === 'stop' || pl.kind === 'custom' || pl.kind === 'none' ? pl.label.replace(/^\d+\. /, '') : pl.name; }
  function thumbHTML(r) {
    return '<button class="jr-thumb' + (selected[r.id] ? ' sel' : '') + '" data-id="' + r.id + '" type="button"><img src="' + tURL(r) + '" alt="" loading="lazy" decoding="async">' +
      ((r.author || (r.mine && author())) ? '<span class="who">' + esc(who(r)) + '</span>' : '') + (r.note ? '<span class="note-dot">✎</span>' : '') + '<span class="jr-check">✓</span></button>';
  }
  function noteHTML(r) {
    return '<button class="jr-note' + (r.star ? ' star' : '') + '" data-nid="' + r.id + '" type="button"><span class="q">' + (r.star ? '<b class="jr-star">★ 重點</b>' : '') + esc(r.text) + '</span><span class="by">— ' + esc(who(r)) + (hhmm(r.takenAt) ? '・' + hhmm(r.takenAt) : '') + '</span></button>';
  }

  function render() {
    if (!mount) return;
    var day = curDay(), items = dayItems(day.id), groups = groupsFor(day, items);
    var np = items.filter(isPhoto).length, nn = items.length - np;
    mount.style.setProperty('--day-color', day.color);
    var h = '<div class="jr-headrow"><div class="section-title"><span class="bead"></span>旅途相簿與見聞</div>' +
      '<div class="jr-stat">今天 <b>' + np + '</b> 張照片・<b>' + nn + '</b> 則見聞</div></div>' +
      '<div class="jr-toolbar"><button class="jr-btn primary" data-act="add" type="button">📷 新增照片</button>' +
      '<button class="jr-btn primary" data-act="note" type="button">✍️ 寫見聞</button>' +
      '<button class="jr-btn gold" data-act="book" type="button">📖 旅遊書</button>' +
      (np ? '<button class="jr-btn" data-act="select" type="button">⬇ 選取下載</button>' : '') +
      '<button class="jr-btn" data-act="share" type="button">🔄 分享／匯入</button></div>';
    if (!items.length) {
      h += '<div class="jr-empty"><div class="ico">🏮</div><h3>' + esc(day.label) + ' 還沒有紀錄</h3>' +
        '<p>走到景點時拍張照、寫幾句見聞。每個人在自己手機記錄，晚上互相分享匯入，回家就能合成一本全家人的旅遊書。</p>' +
        '<div class="jr-toolbar" style="justify-content:center;margin:0"><button class="jr-btn gold" data-act="add" type="button">📷 新增照片</button><button class="jr-btn gold" data-act="note" type="button">✍️ 寫見聞</button></div></div>';
    } else {
      groups.forEach(function (g) {
        var ps = g.items.filter(isPhoto), ns = g.items.filter(isNote);
        h += '<div class="jr-group"><div class="jr-group-title">' + pinHTML(g.place) + '<span>' + esc(placeTitle(g.place)) + '</span><span class="cnt">' + (ps.length ? '📷 ' + ps.length : '') + (ps.length && ns.length ? ' ' : '') + (ns.length ? '✍️ ' + ns.length : '') + '</span>' +
          (g.place.name ? '<button class="add" type="button" data-addplace="' + esc(g.place.name) + '">＋</button>' : '') + '</div>' +
          (ns.length ? '<div class="jr-notes">' + ns.map(noteHTML).join('') + '</div>' : '') +
          (ps.length ? '<div class="jr-grid">' + ps.map(thumbHTML).join('') + '</div>' : '') + '</div>';
      });
    }
    mount.innerHTML = '<section class="jr' + (selecting ? ' selecting' : '') + '">' + h + '</section>';
    badges(day);
    updateSelbar();
  }

  function badges(day) {
    function put(card, name) {
      var old = card.querySelector('.jr-badge'); if (old) old.remove();
      if (!name) return;
      var its = ALL.filter(function (r) { return r.day === day.id && r.place === name; });
      var p = its.filter(isPhoto).length, n = its.length - p;
      if (its.length) { var b = document.createElement('span'); b.className = 'jr-badge'; b.textContent = (p ? '📷 ' + p : '') + (p && n ? '  ' : '') + (n ? '✍️ ' + n : ''); card.appendChild(b); }
    }
    $$('#stopGrid .card.stop').forEach(function (c, i) { put(c, day.stops[i] && day.stops[i].name); });
    $$('#mealGrid .card.meal').forEach(function (c, i) { put(c, day.meals[i] && day.meals[i].name); });
  }

  function onMountClick(e) {
    var t = e.target.closest('button'); if (!t || !mount.contains(t)) return;
    var act = t.dataset.act;
    if (act === 'add') return pickPhotos(null);
    if (act === 'note') return openNote(null);
    if (act === 'book') return openBookSetup();
    if (act === 'share') return openShareSheet();
    if (act === 'select') { selecting = true; selected = {}; render(); return; }
    if (t.dataset.addplace != null) return openChooser({ day: curDay().id, place: t.dataset.addplace });
    if (t.dataset.nid) { var r = ALL.filter(function (x) { return x.id === t.dataset.nid; })[0]; if (r) openNote(null, r); return; }
    if (t.classList.contains('jr-thumb')) {
      var id = t.dataset.id;
      if (selecting) { if (selected[id]) delete selected[id]; else selected[id] = 1; t.classList.toggle('sel', !!selected[id]); updateSelbar(); return; }
      var list = []; groupsFor(curDay()).forEach(function (g) { list = list.concat(g.items.filter(isPhoto)); });
      openLightbox(list, id);
    }
  }

  function updateSelbar() {
    if (!selbar) {
      selbar = document.createElement('div'); selbar.className = 'jr-selbar';
      selbar.innerHTML = '<span class="lbl"></span><button class="all" type="button">全選</button><button class="cancel" type="button">取消</button><button class="go" type="button">⬇ 下載</button>';
      document.body.appendChild(selbar);
      selbar.querySelector('.cancel').onclick = function () { selecting = false; selected = {}; render(); };
      selbar.querySelector('.all').onclick = function () {
        var ps = dayItems(curDay().id).filter(isPhoto), allOn = ps.every(function (r) { return selected[r.id]; });
        selected = {}; if (!allOn) ps.forEach(function (r) { selected[r.id] = 1; }); render();
      };
      selbar.querySelector('.go').onclick = function () {
        var recs = []; groupsFor(curDay()).forEach(function (g) { g.items.forEach(function (r) { if (selected[r.id] && isPhoto(r)) recs.push(r); }); });
        if (!recs.length) { toast('請先點選要下載的照片'); return; }
        saveRecords(recs);
      };
    }
    var k = Object.keys(selected).length, ps = dayItems(curDay().id).filter(isPhoto);
    selbar.querySelector('.lbl').textContent = k ? '已選 ' + k + ' 張' : '點照片來選取';
    selbar.querySelector('.all').textContent = ps.length && ps.every(function (r) { return selected[r.id]; }) ? '全不選' : '全選';
    selbar.querySelector('.go').disabled = !k; selbar.querySelector('.go').style.opacity = k ? 1 : .5;
    selbar.classList.toggle('show', selecting);
    if (fab) fab.classList.toggle('hide', selecting);
  }

  /* ---------------- 大圖瀏覽 ---------------- */
  function openLightbox(list, id) {
    var idx = Math.max(0, list.findIndex(function (r) { return r.id === id; })), cur = null, armT = 0;
    var lb = document.createElement('div'); lb.className = 'jr-lb';
    lb.innerHTML = '<div class="jr-lb-top"><button class="x" type="button" aria-label="關閉">✕</button><div class="count"></div><span style="width:46px"></span></div>' +
      '<div class="jr-lb-stage"><img alt=""><button class="jr-lb-nav prev" type="button" aria-label="上一張">‹</button><button class="jr-lb-nav next" type="button" aria-label="下一張">›</button></div>' +
      '<div class="jr-lb-info"><div class="place"></div><div class="note"></div><div class="meta"></div>' +
      '<div class="jr-lb-actions"><button class="dl" type="button">⬇ 存原圖</button><button class="ed" type="button">✎ 說明</button><button class="pp" type="button"></button><button class="rm" type="button">🗑</button></div>' +
      (isTouch ? '<div class="jr-lb-tip">在分享選單點「儲存影像」即可存到相簿，畫質與原圖相同</div>' : '') + '</div>';
    document.body.appendChild(lb); document.body.classList.add('jr-lock');
    requestAnimationFrame(function () { lb.classList.add('show'); });
    var img = $('img', lb), rm = $('.rm', lb);
    function show() {
      var r = list[idx]; if (!r) return close();
      if (cur) URL.revokeObjectURL(cur); cur = URL.createObjectURL(r.blob); img.src = cur;
      var d = dayById(r.day);
      $('.count', lb).textContent = (idx + 1) + ' / ' + list.length;
      $('.place', lb).textContent = (d ? d.label + '・' : '') + (r.place || '旅途照片');
      $('.note', lb).textContent = r.note || ''; $('.note', lb).style.display = r.note ? '' : 'none';
      $('.meta', lb).textContent = ['📷 ' + who(r) + ' 拍', niceTime(r.takenAt), r.size ? mb(r.size) : ''].filter(Boolean).join('　·　');
      $('.prev', lb).style.visibility = idx > 0 ? '' : 'hidden'; $('.next', lb).style.visibility = idx < list.length - 1 ? '' : 'hidden';
      rm.classList.remove('armed'); rm.textContent = '🗑';
      var pk = peopleKind(r);
      $('.pp', lb).textContent = (r.peopleSet ? '' : '自動：') + (pk === 'p' ? '👨‍👩‍👧 人物照' : pk === 's' ? '🏞 風景照' : '❔ 未辨識');
    }
    // 旅遊書裡人物照、合照會放大，風景照放小；可以手動切換
    $('.pp', lb).onclick = function () {
      var r = list[idx], cur2 = peopleKind(r), nextSet = cur2 === 'p' ? 's' : 'p';
      var nr = Object.assign({}, r, { peopleSet: nextSet, localAddedAt: new Date().toISOString() });
      dbPut([nr]).then(reload).then(function () { list[idx] = nr; show(); refresh(); toast(nextSet === 'p' ? '設為人物照：旅遊書裡會放大' : '設為風景照：旅遊書裡會放小一點'); }).catch(function () { toast('儲存失敗，請再試一次'); });
    };
    function go(k) { var n = idx + k; if (n < 0 || n >= list.length) return; idx = n; show(); }
    function close() { lb.classList.remove('show'); document.removeEventListener('keydown', key); setTimeout(function () { if (cur) URL.revokeObjectURL(cur); lb.remove(); unlock(); }, 200); }
    function key(e) { if (document.querySelector('.jr-overlay')) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); }
    document.addEventListener('keydown', key);
    $('.x', lb).onclick = close; $('.prev', lb).onclick = function () { go(-1); }; $('.next', lb).onclick = function () { go(1); };
    $('.dl', lb).onclick = function () { saveRecords([list[idx]]); };
    $('.ed', lb).onclick = function () {
      var r = list[idx];
      var sh = openSheet('照片說明', '<textarea class="jr-textarea" data-k="t" placeholder="這張照片想說的話">' + esc(r.note || '') + '</textarea><div class="jr-actions"><button class="jr-btn primary" data-k="s" type="button">儲存</button></div>');
      sh.querySelector('[data-k="s"]').onclick = function () {
        var nr = Object.assign({}, r, { note: sh.querySelector('[data-k="t"]').value.trim(), localAddedAt: new Date().toISOString() });
        dbPut([nr]).then(reload).then(function () { list[idx] = nr; sh.close(); show(); refresh(); toast('已更新說明'); }).catch(function () { toast('儲存失敗，請再試一次'); });
      };
    };
    rm.onclick = function () {
      if (!rm.classList.contains('armed')) { rm.classList.add('armed'); rm.textContent = '確定刪除？'; clearTimeout(armT); armT = setTimeout(function () { rm.classList.remove('armed'); rm.textContent = '🗑'; }, 3000); return; }
      var r = list[idx];
      dbDel(r.id).then(reload).then(function () {
        forget(r.id); list.splice(idx, 1); if (idx >= list.length) idx = list.length - 1;
        refresh(); toast('已刪除');
        if (!list.length) close(); else show();
      });
    };
    var sx = 0, sy = 0, stage = $('.jr-lb-stage', lb);
    stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); else if (dy > 110 && Math.abs(dy) > Math.abs(dx)) close(); }, { passive: true });
    show();
  }

  /* ---------------- 分享（匯出 JSON）與匯入 ---------------- */
  function blobToDataURL(b) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsDataURL(b); }); }
  function dataURLToBlob(s) {
    var i = s.indexOf(','), type = (s.slice(0, i).match(/data:([^;,]+)/) || [])[1] || 'image/jpeg';
    var bin = atob(s.slice(i + 1)), n = bin.length, u = new Uint8Array(n);
    for (var k = 0; k < n; k++) u[k] = bin.charCodeAt(k);
    return new Blob([u], { type: type });
  }
  function metaOf(r) {
    var m = { id: r.id, kind: r.kind || 'photo', day: r.day, place: r.place, author: r.mine ? author() : r.author, takenAt: r.takenAt, addedAt: r.addedAt };
    if (isNote(r)) { m.text = r.text; m.star = !!r.star; if (r.editedAt) m.editedAt = r.editedAt; }
    else { m.fp = r.fp; m.note = r.note; m.name = r.name; m.type = r.type; m.size = r.size; if (r.people) m.people = r.people; if (r.peopleSet) m.peopleSet = r.peopleSet; }
    return m;
  }
  function buildExport(recs, prog) {
    var parts = [], head = { format: FORMAT, version: 2, app: '相約北京', exportedAt: new Date().toISOString(), exportedBy: author(), count: recs.length };
    parts.push(JSON.stringify(head).slice(0, -1) + ',"items":[');
    var i = 0;
    return new Promise(function (res, rej) {
      (function next() {
        if (i >= recs.length) { parts.push(']}'); res(new Blob(parts, { type: 'application/json' })); return; }
        var r = recs[i], m = JSON.stringify(metaOf(r)).slice(0, -1);
        var done = function (s) { parts.push((i ? ',' : '') + s); i++; prog(i, recs.length); next(); };
        if (isNote(r)) done(m + '}');
        else blobToDataURL(r.blob).then(function (data) { done(m + ',"data":"' + data + '"}'); }).catch(rej);
      })();
    });
  }

  function openShareSheet() {
    var last = lsGet(LS_LAST, '');
    var fresh = ALL.filter(function (r) { return !last || (r.localAddedAt || r.addedAt) > last; });
    var ph = photos(), total = ph.reduce(function (s, r) { return s + (r.size || 0); }, 0);
    var nf = fresh.filter(isPhoto).length, nn = fresh.length - nf;
    var html =
      '<div class="jr-statrow"><div class="jr-statbox"><b>' + ph.length + '</b><span>照片</span></div><div class="jr-statbox"><b>' + (ALL.length - ph.length) + '</b><span>見聞</span></div><div class="jr-statbox"><b>' + mb(total) + '</b><span>原圖大小</span></div></div>' +
      '<div class="jr-card"><h4>📤 分享給家人朋友</h4><p>把照片和見聞打包成一個 JSON 檔，用 LINE、AirDrop 或 Email 傳出去。檔案裡是原始照片，畫質不會變差。' + (last ? '<br>上次分享：' + niceTime(localStamp(new Date(last))) : '') + '</p>' +
      '<div class="jr-label" style="margin-top:0">你的名字 <span class="jr-req">必填</span></div><input class="jr-input" data-k="me" maxlength="12" placeholder="必填" value="' + esc(author()) + '">' +
      '<div class="jr-hint" style="margin-bottom:12px">會標示在你拍的照片和寫的見聞上（旅遊書裡的「誰拍／誰說」）</div>' +
      '<button class="jr-btn gold block" data-x="fresh" type="button"' + (fresh.length ? '' : ' disabled') + '>🆕 只分享新增的（' + nf + ' 張照片、' + nn + ' 則見聞）</button>' +
      '<button class="jr-btn block" data-x="all" type="button"' + (ALL.length ? '' : ' disabled') + '>📦 分享全部紀錄</button>' +
      '<div data-k="out"></div></div>' +
      '<div class="jr-card"><h4>📥 匯入家人朋友的紀錄</h4><p>選擇收到的 JSON 檔。已經有的會自動略過，同一個檔案匯入兩次也不會重複；對方修改過的見聞會更新成新版。</p>' +
      '<button class="jr-btn primary block" data-x="import" type="button">選擇 JSON 檔匯入</button><div data-k="in"></div></div>' +
      '<div class="jr-hint" data-k="quota" style="text-align:center;margin-top:14px;"></div>';
    var sheet = openSheet('分享與匯入', html);
    var K = function (k) { return sheet.querySelector('[data-k="' + k + '"]'); };
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { if (e && e.quota) K('quota').textContent = '這個瀏覽器還能存放約 ' + mb(Math.max(0, e.quota - e.usage)); }).catch(function () {});

    K('me').addEventListener('input', function () { K('me').classList.remove('jr-invalid'); });
    function doExport(recs, label) {
      var me = K('me').value.trim();
      if (!me) { K('me').classList.add('jr-invalid'); K('me').focus(); toast('請填寫必填欄位'); return; }
      lsSet(LS_AUTHOR, me); refresh();
      var out = K('out');
      $$('[data-x="fresh"],[data-x="all"]', sheet).forEach(function (b) { b.disabled = true; });
      out.innerHTML = '<div class="jr-hint" style="margin-top:12px;">打包中… <span data-k="pct">0</span> / ' + recs.length + '</div><div class="jr-progress"><i></i></div>';
      recs = recs.slice().sort(byTime);
      buildExport(recs, function (i, n) { K('pct').textContent = i; $('.jr-progress i', out).style.width = (i / n * 100) + '%'; }).then(function (blob) {
        var d = new Date(), w = safe(author());
        var name = '北京紀錄_' + (w ? w + '_' : '') + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
        var file = new File([blob], name, { type: 'application/json' });
        var stamp = function () { lsSet(LS_LAST, new Date().toISOString()); };
        var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
        out.innerHTML = '<div class="jr-card jr-ready"><div class="fname">✅ ' + esc(name) + '<br><small style="font-weight:500;color:var(--ink-soft)">' + esc(label) + '・' + mb(blob.size) + '</small></div>' +
          (canShare ? '<button class="jr-btn primary block" data-y="send" type="button">📨 傳送（LINE、AirDrop…）</button>' : '') +
          '<button class="jr-btn block" data-y="dl" type="button">⬇ 下載檔案到裝置</button></div>';
        var send = out.querySelector('[data-y="send"]');
        if (send) send.onclick = function () { navigator.share({ files: [file], title: '北京旅遊紀錄' }).then(function () { stamp(); toast('已送出！'); }).catch(function (e) { if (e && e.name !== 'AbortError') { downloadFiles([file]); stamp(); } }); };
        out.querySelector('[data-y="dl"]').onclick = function () { downloadFiles([file]); stamp(); toast('已下載，可在「檔案」App 或下載資料夾找到'); };
      }).catch(function () { out.innerHTML = '<div class="jr-hint" style="color:var(--red)">打包失敗，請改用「只分享新增的」再試。</div>'; });
    }
    sheet.querySelector('[data-x="fresh"]').onclick = function () { doExport(fresh, '新增的 ' + fresh.length + ' 筆'); };
    sheet.querySelector('[data-x="all"]').onclick = function () { doExport(ALL, '全部 ' + ALL.length + ' 筆'); };

    var jin = document.createElement('input'); jin.type = 'file'; jin.accept = '.json,application/json,text/plain'; jin.style.display = 'none'; sheet.appendChild(jin);
    sheet.querySelector('[data-x="import"]').onclick = function () { jin.value = ''; jin.click(); };
    jin.onchange = function () { var f = jin.files && jin.files[0]; if (f) importFile(f, K('in')); };
  }

  function importFile(file, box) {
    var err = function (m) { box.innerHTML = '<div class="jr-hint" style="color:var(--red);margin-top:12px;">' + esc(m) + '</div>'; };
    box.innerHTML = '<div class="jr-hint" style="margin-top:12px;">讀取檔案中…</div><div class="jr-progress"><i></i></div>';
    reload().then(function () { return file.text(); }).then(function (txt) {
      var obj = null; try { obj = JSON.parse(txt); } catch (e) {}
      txt = null;
      var list = obj && obj.format === FORMAT ? (obj.items || obj.photos) : null;
      if (!Array.isArray(list)) return err('這不是「相約北京」的紀錄檔，請確認選對檔案。');
      var byId = {}, fps = {}; ALL.forEach(function (r) { byId[r.id] = r; if (r.fp) fps[r.fp] = 1; });
      var now = new Date().toISOString(), skip = 0, todo = [];
      list.forEach(function (p) {
        if (!p || !p.id) { skip++; return; }
        var mine = byId[p.id];
        if (p.kind === 'note') {
          if (mine && (mine.editedAt || mine.addedAt || '') >= (p.editedAt || p.addedAt || '')) { skip++; return; }
          todo.push(p);
        } else {
          if (mine || (p.fp && fps[p.fp]) || typeof p.data !== 'string') { skip++; return; }
          todo.push(p);
        }
      });
      if (!todo.length) { box.innerHTML = '<div class="jr-hint" style="margin-top:12px;">✅ 檔案裡的 ' + list.length + ' 筆紀錄都已經在這裡了。</div>'; return; }
      var i = 0, batch = [], nPh = 0, nNo = 0, authors = {};
      var dayOf = function (p) { return dayById(+p.day) ? +p.day : (DATE2DAY[String(p.takenAt || '').slice(0, 10)] || DAYS[0].id); };
      var step = function () {
        if (i >= todo.length) return Promise.resolve();
        var p = todo[i++], base = { id: String(p.id), day: dayOf(p), place: String(p.place || ''), author: String(p.author || ''), takenAt: String(p.takenAt || ''), addedAt: String(p.addedAt || now), localAddedAt: now };
        if (p.author) authors[p.author] = 1;
        var bar = $('.jr-progress i', box); if (bar) bar.style.width = (i / todo.length * 100) + '%';
        var hint = $('.jr-hint', box); if (hint) hint.textContent = '匯入中… ' + i + ' / ' + todo.length;
        var after = function () { return (batch.length >= 8 ? (function () { var b = batch; batch = []; return dbPut(b); })() : Promise.resolve()).then(step); };
        if (p.kind === 'note') {
          batch.push(Object.assign(base, { kind: 'note', text: String(p.text || ''), star: !!p.star, editedAt: p.editedAt || '' })); nNo++;
          return after();
        }
        var blob; try { blob = dataURLToBlob(p.data); } catch (e) { skip++; return step(); }
        p.data = null;
        return makeThumb(blob).then(function (th) {
          batch.push(Object.assign(base, { kind: 'photo', fp: String(p.fp || ''), note: String(p.note || ''), name: String(p.name || ''), type: blob.type, size: blob.size, blob: blob, thumb: th, people: p.people && typeof p.people === 'object' ? { n: +p.people.n || 0, max: +p.people.max || 0, sum: +p.people.sum || 0 } : undefined, peopleSet: p.peopleSet === 'p' || p.peopleSet === 's' ? p.peopleSet : undefined })); nPh++;
          return after();
        });
      };
      return step().then(function () { return batch.length ? dbPut(batch) : null; }).then(reload).then(function () {
        refresh();
        var names = Object.keys(authors).join('、');
        box.innerHTML = '<div class="jr-card jr-ready"><div class="fname">✅ 匯入 ' + nPh + ' 張照片、' + nNo + ' 則見聞' + (skip ? '（略過 ' + skip + ' 筆重複）' : '') + '</div>' + (names ? '<p style="margin:0">記錄者：' + esc(names) + '</p>' : '') + '</div>';
        toast('匯入完成');
      }).catch(function (e) {
        reload().then(refresh);
        err(e && e.name === 'QuotaExceededError' ? '空間不足，只匯入了一部分。' : '匯入中斷，可以再匯入一次補齊（不會重複）。');
      });
    }).catch(function () { err('檔案太大或無法讀取。'); });
  }

  /* ---------------- 旅遊書（排版引擎在 book.js） ---------------- */
  function authorsAll() { var o = {}; ALL.forEach(function (r) { o[who(r)] = (o[who(r)] || 0) + 1; }); return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); }
  function tripRange() { var a = dayDate(DAYS[0]), b = dayDate(DAYS[DAYS.length - 1]); return TRIP_YEAR + '.' + a.replace('/', '.') + ' – ' + b.replace('/', '.'); }
  function openBookSetup() {
    if (window.BookMaker) return window.BookMaker.open();
    toast('旅遊書元件載入中，請稍後再試');
  }
  /* ---------------- 人物辨識（在手機上執行，照片不會上傳） ---------------- */
  // 用 MediaPipe 物件偵測找出照片裡的「人」，記下人物佔畫面的比例；旅遊書據此把合照、人物照放大
  function peopleKind(r) {
    if (r.peopleSet === 'p' || r.peopleSet === 's') return r.peopleSet;
    var q = r.people; if (!q) return '';
    return (q.max >= 0.07 || (q.n >= 2 && q.sum >= 0.09)) ? 'p' : 's';
  }
  var MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';
  var detP = null;
  function detector() {
    if (!detP) detP = import(MP + '/vision_bundle.mjs').then(function (m) {
      return m.FilesetResolver.forVisionTasks(MP + '/wasm').then(function (fs) {
        return m.ObjectDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE', scoreThreshold: 0.35, maxResults: 12, categoryAllowlist: ['person'] });
      });
    }).catch(function (e) { detP = null; throw e; });
    return detP;
  }
  function detectPeople(recs, onProg) {
    var todo = recs.filter(function (r) { return isPhoto(r) && !r.people && !r.peopleSet; });
    if (!todo.length) return Promise.resolve(0);
    return detector().then(function (det) {
      var i = 0, done = [];
      return new Promise(function (res) {
        (function next() {
          if (i >= todo.length) { dbPut(done).then(reload).then(function () { res(done.length); }, function () { res(done.length); }); return; }
          var r = todo[i++];
          createImageBitmap(r.thumb || r.blob).then(function (bm) {
            var cv = document.createElement('canvas'), k = Math.min(1, 480 / Math.max(bm.width, bm.height));
            cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k);
            cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); if (bm.close) bm.close();
            var out = det.detect(cv), area = cv.width * cv.height, n = 0, mx = 0, sum = 0;
            (out.detections || []).forEach(function (d) { var b = d.boundingBox; if (!b) return; var f = (b.width * b.height) / area; n++; sum += f; if (f > mx) mx = f; });
            done.push(Object.assign({}, r, { people: { n: n, max: Math.round(mx * 1000) / 1000, sum: Math.round(Math.min(1, sum) * 1000) / 1000 } }));
          }).catch(function () {}).then(function () { if (onProg) onProg(i, todo.length); setTimeout(next, 0); });
        })();
      });
    });
  }

  window.JournalAPI = {
    peopleKind: peopleKind, detectPeople: detectPeople,
    items: function () { return ALL; }, groupsFor: groupsFor, placesOf: placesOf, placeTitle: placeTitle,
    isPhoto: isPhoto, isNote: isNote, who: who, byTime: byTime, dayById: dayById, dayDate: dayDate, tripRange: tripRange,
    authorsAll: authorsAll, thumbURL: tURL, saveFiles: saveFiles, toast: toast, openSheet: openSheet, unlock: unlock,
    esc: esc, lsGet: lsGet, lsSet: lsSet, safe: safe, mb: mb
  };

  /* ---------------- 景點介紹視窗裡的紀錄 ---------------- */
  function onModal(title) {
    var body = document.querySelector('#modalOverlay .modal-body'); if (!body) return;
    var box = body.querySelector('.jr-modal'); if (!box) { box = document.createElement('div'); box.className = 'jr-modal'; body.appendChild(box); }
    var day = curDay(), its = ALL.filter(function (r) { return r.day === day.id && r.place === title; }).sort(byTime);
    var ps = its.filter(isPhoto), ns = its.filter(isNote);
    box.style.setProperty('--day-color', day.color);
    box.innerHTML = '<div class="jr-modal-head"><b>📷 我們在這裡的紀錄' + (its.length ? '（' + its.length + '）' : '') + '</b></div>' +
      (ns.length ? '<div class="jr-notes">' + ns.map(noteHTML).join('') + '</div>' : '') +
      (ps.length ? '<div class="jr-strip">' + ps.map(thumbHTML).join('') + '</div>' : '') +
      '<div class="jr-toolbar" style="margin:6px 0 0"><button class="jr-btn ' + (its.length ? '' : 'gold ') + '" type="button" data-m="p">📷 新增照片</button><button class="jr-btn ' + (its.length ? '' : 'gold ') + '" type="button" data-m="n">✍️ 寫見聞</button></div>';
    box.querySelector('[data-m="p"]').onclick = function () { pickPhotos({ day: day.id, place: title }); };
    box.querySelector('[data-m="n"]').onclick = function () { openNote({ day: day.id, place: title }); };
    $$('.jr-thumb', box).forEach(function (b) { b.onclick = function () { openLightbox(ps, b.dataset.id); }; });
    $$('.jr-note', box).forEach(function (b) { b.onclick = function () { openNote(null, ALL.filter(function (x) { return x.id === b.dataset.nid; })[0]); }; });
  }

  /* ---------------- 啟動 ---------------- */
  function refresh() {
    render();
    var ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) { var t = document.getElementById('modalTitle'); if (t) onModal(t.textContent); }
  }
  function init() {
    mount = document.getElementById('journalMount');
    if (!mount) { mount = document.createElement('div'); mount.id = 'journalMount'; var m = document.querySelector('main'); if (m) m.appendChild(mount); }
    mount.addEventListener('click', onMountClick);
    fab = document.createElement('button'); fab.className = 'jr-fab'; fab.type = 'button'; fab.setAttribute('aria-label', '記錄這一刻');
    fab.innerHTML = '<span class="cam">📷</span><span class="txt">記錄這一刻</span>';
    fab.onclick = function () { openChooser(null); };
    document.body.appendChild(fab);
    setInterval(function () { fab.classList.toggle('lift', !!document.querySelector('.hcts-install')); }, 1500);
    reload().catch(function () { toast('這個瀏覽器無法儲存紀錄（可能是無痕模式）'); }).then(render);
  }
  window.Journal = {
    onDay: function () { if (selecting) { selecting = false; selected = {}; } render(); },
    onModal: function (t) { try { onModal(t); } catch (e) {} }
  };
  init();
})();
