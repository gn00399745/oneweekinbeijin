// 相約北京：旅遊書排版引擎（日系旅遊雜誌風「北京note」）
// 把大家的照片與見聞，自動排成可送印的雜誌風相片書 PDF（含 3mm 出血、300dpi）
// 版面以「直式雜誌頁」為單位設計：文庫本／直式寫真本一頁一個雜誌頁；橫式寫真本一頁放左右兩個雜誌頁（像攤開的雜誌）
// 插畫（銀杏、楓葉、紙膠帶、條紋、牛皮紙卡）都是程式即時繪製的向量圖，沒有版權問題
(function () {
  'use strict';
  var SERIF = '"Noto Serif TC","Songti TC","STSong","Noto Serif CJK TC","Source Han Serif TC","PMingLiU",serif';
  var SANS = '"PingFang TC","Noto Sans TC","Heiti TC","Noto Sans CJK TC","Microsoft JhengHei",sans-serif';
  var LOGO = '"Pacifico","Snell Roundhand","Brush Script MT",cursive';
  var HAND = '"Caveat","Bradley Hand","Segoe Print",cursive';
  var LAT = '"Josefin Sans","Avenir Next","Helvetica Neue",Arial,sans-serif';
  var BLEED = 3;
  var C = {
    paper: '#FFFDF8', ink: '#3A3029', soft: '#7D7065', olive: '#7E8B3A', oliveD: '#5F6B26', red: '#B23A30',
    kraft: '#E9DAC3', kraftD: '#C9B496', cream: '#FFF3C4', gold: '#E2A93B', pink: '#F5D9D2', mint: '#DCEADF',
    sand: '#F3E6C8', sky: '#DCE6F0', lav: '#E6E0EE', tape: 'rgba(240,200,120,.55)', tape2: 'rgba(170,205,190,.6)', tape3: 'rgba(240,170,170,.5)'
  };
  var INK = ['#B23A30', '#2E6E8E', '#5F7F2E', '#7A4F8A', '#A0652B', '#C0812A', '#3D6B8C', '#A04870'];
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  // land：橫式（一頁放兩個雜誌頁）；tt：點點印（TinTint）尺寸，最少 40 頁
  var SIZES = {
    a6: { label: '文庫本 A6 10.5×14.8 cm（直式）', w: 105, h: 148 },
    p: { label: '直式寫真本 19.5×26 cm', w: 195, h: 260, tt: true },
    s: { label: '橫式寫真本 19.2×14.4 cm', w: 192, h: 144, land: true, tt: true },
    l: { label: '橫式精裝寫真本 26×19.5 cm', w: 260, h: 195, land: true, tt: true }
  };
  var KIN = '，。、；：？！）」』〉》…—,.!?;:)～', OPEN = '（「『《〈(';

  /* ---------- 小工具 ---------- */
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function rnd(seed) { var a = Math.floor(hash(seed) * 4294967295); return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var mctx = document.createElement('canvas').getContext('2d');
  function fontStr(size, fam, wt, k) { return (wt || 400) + ' ' + (size * k) + 'px ' + fam; }
  function wrap(text, size, fam, wt, maxW) {
    mctx.font = fontStr(size, fam, wt, 10);
    var out = [];
    String(text || '').split('\n').forEach(function (par) {
      var line = '';
      Array.from(par).forEach(function (ch) {
        var t = line + ch;
        if (line && mctx.measureText(t).width / 10 > maxW) {
          if (KIN.indexOf(ch) >= 0) { line = t; return; }
          var carry = '', arr = Array.from(line);
          while (arr.length > 1 && OPEN.indexOf(arr[arr.length - 1]) >= 0) carry = arr.pop() + carry;
          for (var k = arr.length - 1; k >= Math.max(1, arr.length - 4); k--) { if (arr[k] === '・' || arr[k] === ' ') { carry = arr.splice(k + 1).join('') + carry; break; } }
          out.push(arr.join('')); line = carry + ch;
        } else line = t;
      });
      out.push(line);
    });
    return out;
  }
  function clamp(lines, n) { if (lines.length <= n) return lines; var l = lines.slice(0, n); l[n - 1] = l[n - 1].replace(/.$/, '') + '…'; return l; }
  function textW(s, size, fam, wt) { mctx.font = fontStr(size, fam, wt, 10); return mctx.measureText(s).width / 10; }

  /* ---------- 畫筆：設計單位（頁寬 = 100）→ 像素 ---------- */
  // geo：{ mmW, mmH（裁切後實際尺寸）, dw, dh（設計單位）} ；pm：每毫米像素
  function Pen(geo, pm) {
    var s = geo.mmW / geo.dw, cv = document.createElement('canvas');
    cv.width = Math.round((geo.mmW + BLEED * 2) * pm); cv.height = Math.round((geo.mmH + BLEED * 2) * pm);
    var c = cv.getContext('2d'), b = BLEED / s;
    var p = { cv: c.canvas, c: c, b: b, ox: 0, rx0: -b, rx1: geo.dw + b, H: geo.dh, W: geo.dw };
    var P = function (u) { return (BLEED + (u + p.ox) * s) * pm; }, PY = function (u) { return (BLEED + u * s) * pm; }, L = function (u) { return u * s * pm; };
    p.P = P; p.PY = PY; p.L = L;
    // 切換到左右某一個雜誌頁（橫式）
    p.region = function (ox, x0, x1) { p.ox = ox; p.rx0 = x0; p.rx1 = x1; };
    p.font = function (size, fam, wt) { c.font = fontStr(size, fam, wt, s * pm); };
    p.rect = function (x, y, w, h, col) { c.fillStyle = col; c.fillRect(P(x), PY(y), L(w), L(h)); };
    p.bg = function (col) { p.rect(p.rx0, -b, p.rx1 - p.rx0, p.H + 2 * b, col); };
    p.rr = function (x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(P(x), PY(y), L(w), L(h), L(r)); else c.rect(P(x), PY(y), L(w), L(h)); };
    p.text = function (str, x, y, size, fam, wt, col, align, spacing) {
      p.font(size, fam, wt); c.fillStyle = col; c.textBaseline = 'alphabetic'; c.textAlign = align || 'left';
      if (spacing) { try { c.letterSpacing = L(spacing) + 'px'; } catch (e) {} }
      c.fillText(str, P(x), PY(y));
      if (spacing) { try { c.letterSpacing = '0px'; } catch (e) {} }
    };
    p.lines = function (lines, x, y, size, lh, fam, wt, col, align) { lines.forEach(function (l, i) { p.text(l, x, y + i * lh, size, fam, wt, col, align); }); return y + lines.length * lh; };
    // 直書：由右至左一欄一欄寫
    p.vtext = function (str, xRight, yTop, size, lh, colH, fam, wt, col) {
      var chars = Array.from(String(str).replace(/（/g, '︵').replace(/）/g, '︶').replace(/「/g, '﹁').replace(/」/g, '﹂').replace(/、/g, '︑').replace(/，/g, '︐').replace(/。/g, '︒').replace(/ー|—/g, '︱'));
      var per = Math.max(1, Math.floor(colH / size / 1.06)), x = xRight;
      p.font(size, fam, wt); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      chars.forEach(function (ch, i) {
        if (ch === '\n') return;
        var col2 = Math.floor(i / per), row = i % per;
        c.fillText(ch, P(x - col2 * lh), PY(yTop + size * 0.88 + row * size * 1.06));
      });
      return Math.ceil(chars.length / per);
    };
    // 照片：裁切填滿；fit = true 時完整顯示
    // 照片一律完整顯示、絕不裁切；框的比例和照片不同時，空出來的地方用同一張照片的柔焦放大當底
    p.img = function (img, x, y, w, h) {
      if (!img) { p.rect(x, y, w, h, C.sand); return; }
      var iw = img.width, ih = img.height, k = Math.min(L(w) / iw, L(h) / ih), dw = iw * k, dh = ih * k;
      c.save(); c.beginPath(); c.rect(P(x), PY(y), L(w), L(h)); c.clip();
      if (Math.abs(dw - L(w)) > 1.5 || Math.abs(dh - L(h)) > 1.5) {
        var sm = document.createElement('canvas'), q = 24 / Math.max(iw, ih); sm.width = Math.max(2, Math.round(iw * q)); sm.height = Math.max(2, Math.round(ih * q));
        sm.getContext('2d').drawImage(img, 0, 0, sm.width, sm.height);
        var kc = Math.max(L(w) / iw, L(h) / ih) * 1.15, cw2 = iw * kc, ch2 = ih * kc;
        c.imageSmoothingEnabled = true; c.drawImage(sm, P(x) + (L(w) - cw2) / 2, PY(y) + (L(h) - ch2) / 2, cw2, ch2);
        c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(P(x), PY(y), L(w), L(h));
      }
      c.drawImage(img, P(x) + (L(w) - dw) / 2, PY(y) + (L(h) - dh) / 2, dw, dh);
      c.restore();
    };
    // 滿版照片：柔焦底鋪滿含出血的外框，清楚的照片完整放在裁切線以內，裁切時不會切到人臉
    p.imgSafe = function (img, ox, oy, ow, oh, ix, iy, iw2, ih2) {
      if (!img) { p.rect(ox, oy, ow, oh, C.sand); return; }
      var iw = img.width, ih = img.height;
      var sm = document.createElement('canvas'), q = 24 / Math.max(iw, ih); sm.width = Math.max(2, Math.round(iw * q)); sm.height = Math.max(2, Math.round(ih * q));
      sm.getContext('2d').drawImage(img, 0, 0, sm.width, sm.height);
      c.save(); c.beginPath(); c.rect(P(ox), PY(oy), L(ow), L(oh)); c.clip();
      var kc = Math.max(L(ow) / iw, L(oh) / ih) * 1.15; c.imageSmoothingEnabled = true;
      c.drawImage(sm, P(ox) + (L(ow) - iw * kc) / 2, PY(oy) + (L(oh) - ih * kc) / 2, iw * kc, ih * kc);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(P(ox), PY(oy), L(ow), L(oh));
      var k = Math.min(L(iw2) / iw, L(ih2) / ih);
      c.drawImage(img, P(ix) + (L(iw2) - iw * k) / 2, PY(iy) + (L(ih2) - ih * k) / 2, iw * k, ih * k);
      c.restore();
    };
    p.rot = function (cx, cy, a, fn) { c.save(); c.translate(P(cx), PY(cy)); c.rotate(a); c.translate(-P(cx), -PY(cy)); fn(); c.restore(); };
    p.shadow = function (on, blur, dy) { if (on) { c.shadowColor = 'rgba(60,40,20,.28)'; c.shadowBlur = L(blur || 1.4); c.shadowOffsetY = L(dy == null ? 0.5 : dy); } else { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; } };
    return p;
  }

  /* ---------- 裝飾 ---------- */
  // 粉彩紙膠帶條紋背景（邊緣微微不規則）
  function stripes(p, seed, alpha) {
    var r = rnd(seed), cols = [C.pink, C.mint, C.sand, C.sky, C.lav], y = -p.b, c = p.c;
    p.bg(C.paper);
    c.save(); c.globalAlpha = alpha == null ? 0.55 : alpha;
    while (y < p.H + p.b) {
      var h = 9 + r() * 10, gap = 3 + r() * 7, col = cols[Math.floor(r() * cols.length)];
      c.fillStyle = col; c.beginPath();
      c.moveTo(p.P(p.rx0), p.PY(y));
      for (var x = p.rx0; x <= p.rx1; x += 4) c.lineTo(p.P(x), p.PY(y + (r() - 0.5) * 0.7));
      for (var x2 = p.rx1; x2 >= p.rx0; x2 -= 4) c.lineTo(p.P(x2), p.PY(y + h + (r() - 0.5) * 0.7));
      c.closePath(); c.fill();
      y += h + gap;
    }
    c.restore();
  }
  // 散落的小圓點（像腳印）
  function dots(p, seed, n, x0, y0, x1, y1) {
    var r = rnd(seed + 'd'), c = p.c; c.save(); c.fillStyle = 'rgba(226,169,59,.55)';
    for (var i = 0; i < n; i++) { var x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); c.beginPath(); c.ellipse(p.P(x), p.PY(y), p.L(0.9 + r() * 0.5), p.L(0.6 + r() * 0.3), r() * 3, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  // 銀杏葉
  function ginkgo(p, x, y, sz, rot, col) {
    p.rot(x, y, rot || 0, function () {
      var c = p.c; c.fillStyle = col || '#E8B83A';
      c.beginPath(); c.moveTo(p.P(x), p.PY(y));
      c.quadraticCurveTo(p.P(x - sz * 0.95), p.PY(y - sz * 0.35), p.P(x - sz * 0.75), p.PY(y - sz * 0.95));
      c.quadraticCurveTo(p.P(x - sz * 0.35), p.PY(y - sz * 1.1), p.P(x - sz * 0.05), p.PY(y - sz * 0.92));
      c.lineTo(p.P(x), p.PY(y - sz * 0.78)); c.lineTo(p.P(x + sz * 0.05), p.PY(y - sz * 0.92));
      c.quadraticCurveTo(p.P(x + sz * 0.35), p.PY(y - sz * 1.1), p.P(x + sz * 0.75), p.PY(y - sz * 0.95));
      c.quadraticCurveTo(p.P(x + sz * 0.95), p.PY(y - sz * 0.35), p.P(x), p.PY(y));
      c.fill();
      c.strokeStyle = 'rgba(160,110,20,.5)'; c.lineWidth = p.L(sz * 0.05);
      c.beginPath(); c.moveTo(p.P(x), p.PY(y)); c.lineTo(p.P(x), p.PY(y + sz * 0.45)); c.stroke();
      c.lineWidth = p.L(sz * 0.02);
      for (var k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(p.P(x), p.PY(y)); c.lineTo(p.P(x + k * sz * 0.2), p.PY(y - sz * 0.88)); c.stroke(); }
    });
  }
  // 楓葉
  function maple(p, x, y, sz, rot, col) {
    p.rot(x, y, rot || 0, function () {
      var c = p.c, pts = [[0, -1], [0.18, -0.55], [0.55, -0.75], [0.42, -0.35], [0.95, -0.3], [0.55, 0], [0.7, 0.3], [0.2, 0.15], [0.05, 0.5], [-0.05, 0.5], [-0.2, 0.15], [-0.7, 0.3], [-0.55, 0], [-0.95, -0.3], [-0.42, -0.35], [-0.55, -0.75], [-0.18, -0.55]];
      c.fillStyle = col || '#D9622B'; c.beginPath();
      pts.forEach(function (q, i) { var X = p.P(x + q[0] * sz), Y = p.PY(y + q[1] * sz); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(120,40,10,.45)'; c.lineWidth = p.L(sz * 0.04);
      c.beginPath(); c.moveTo(p.P(x), p.PY(y + 0.5 * sz)); c.lineTo(p.P(x), p.PY(y + 0.95 * sz)); c.stroke();
    });
  }
  function leaves(p, seed, spots) {
    var r = rnd(seed + 'L');
    spots.forEach(function (s) { (r() < 0.55 ? ginkgo : maple)(p, s[0], s[1], s[2], r() * 1.6 - 0.8, r() < 0.5 ? undefined : (r() < 0.5 ? '#EFC24A' : '#C9532A')); });
  }
  // 紙膠帶
  function tape(p, cx, cy, w, rot, col) {
    p.rot(cx, cy, rot, function () {
      var c = p.c, x = cx - w / 2, h = w * 0.32;
      c.fillStyle = col || C.tape; c.beginPath(); c.moveTo(p.P(x), p.PY(cy - h / 2));
      for (var i = 0; i <= 6; i++) c.lineTo(p.P(x + (i % 2 ? 0.5 : 0)), p.PY(cy - h / 2 + i * h / 6));
      c.lineTo(p.P(x + w), p.PY(cy + h / 2));
      for (var j = 6; j >= 0; j--) c.lineTo(p.P(x + w - (j % 2 ? 0.5 : 0)), p.PY(cy - h / 2 + j * h / 6));
      c.closePath(); c.fill();
    });
  }
  // 「北京note」刊頭
  function masthead(p, x, y, sz, col, shadow) {
    var c = p.c;
    if (shadow) p.shadow(true, sz * 0.12, sz * 0.03);
    p.text('北京', x, y, sz, SERIF, 900, col);
    var w = textW('北京', sz, SERIF, 900);
    p.text('note', x + w + sz * 0.08, y - sz * 0.02, sz * 0.82, LOGO, 400, col);
    p.shadow(false);
    return w + sz * 0.08 + textW('note', sz * 0.82, LOGO, 400);
  }
  function smallMast(p, x, y, sz, col) { p.text('北京', x, y, sz, SERIF, 900, col); p.text('note', x + textW('北京', sz, SERIF, 900) + sz * 0.05, y, sz * 0.8, LOGO, 400, col); }
  function folio(p, n) {   // 頁碼：左頁在左下、右頁在右下
    if (n == null) return;
    var right = p.rightPage, y = p.H - 4.2, num = (n < 10 ? '0' : '') + n;
    if (right) { smallMast(p, p.W - 18, y, 2.4, C.soft); p.text(num, p.W - 4, y, 2.6, LAT, 700, C.soft, 'right'); }
    else { p.text(num, 4, y, 2.6, LAT, 700, C.soft); smallMast(p, 9.5, y, 2.4, C.soft); }
  }

  /* ---------- 照片框、便條卡 ---------- */
  var colorOf = {};
  function who(r) { return window.JournalAPI.who(r); }
  function attrCol(r) { return colorOf[who(r)] || C.red; }
  var PF = 1.3, CAP = 6.2;      // 拍立得邊框、下緣說明高度
  // 照片說明：同一段文字只出現一次；放得下一行的寫在照片上，太長的改成「照片說明」卡片放在文字區，完整顯示
  var capMode = {};
  function capText(r) { return capMode[r.id] === 'show' ? r.note : ''; }
  function capLines(r, w) { var t = capText(r); return t ? clamp(wrap(t, 2.3, SANS, 400, w - textW('（' + who(r) + ' 拍）', 2.1, SANS, 700) - 1), 1) : []; }
  // 拍立得：白框＋下緣寫說明與「誰拍」，可傾斜、貼紙膠帶
  function polaroid(p, img, r, x, y, w, h, rot, tapeCol) {
    var cx = x + w / 2, cy = y + h / 2;
    p.rot(cx, cy, rot || 0, function () {
      p.shadow(true, 1.6, 0.6); p.rect(x - PF, y - PF, w + 2 * PF, h + PF + CAP, '#FFFFFF'); p.shadow(false);
      p.img(img, x, y, w, h);
      var lines = capLines(r, w), attr = '（' + who(r) + ' 拍）', ty = y + h + 4.1;
      if (lines.length) { p.text(lines[0], x + 0.3, ty, 2.3, SANS, 400, C.ink); p.text(attr, x + w - 0.3, ty, 2.1, SANS, 700, attrCol(r), 'right'); }
      else p.text(attr, x + w - 0.3, ty, 2.1, SANS, 700, attrCol(r), 'right');
      if (tapeCol) tape(p, cx, y - PF + 0.3, Math.min(14, w * 0.38), (rot || 0) * -3 + 0.04, tapeCol);
    });
  }
  // 便條卡（牛皮紙；重點見聞改成奶油黃＋紅色「重點」章）
  var NS = 2.75, NL = 4.15;
  function noteGeom(r, w, lines) { return 7.2 + lines.length * NL + 5.4; }
  function card(p, it, x, y, w, h) {
    var r = it.r, c = p.c, star = r.star;
    p.rot(x + w / 2, y + h / 2, it.rot || 0, function () {
      p.shadow(true, 1.2, 0.4); p.rect(x, y, w, h, r.infoBox ? '#E3EEDF' : star ? '#FFF1BF' : C.kraft); p.shadow(false);
      // 上緣打孔
      c.fillStyle = 'rgba(255,253,248,.95)';
      for (var i = 0; i < Math.floor(w / 3.2); i++) { c.beginPath(); c.arc(p.P(x + 2 + i * 3.2), p.PY(y + 1.8), p.L(0.55), 0, Math.PI * 2); c.fill(); }
      var label = it.cont ? '（續）' : (it.label || 'Memo');
      p.text(label, x + w / 2, y + 6.1, 3.1, r.infoBox ? SANS : HAND, 700, r.infoBox ? C.oliveD : star ? C.red : '#6E5B45', 'center');
      p.rect(x + 2.5, y + 7.2, w - 5, 0.18, star ? 'rgba(178,58,48,.45)' : C.kraftD);
      p.lines(it.lines, x + 3, y + 7.4 + NL * 0.82, NS, NL, SANS, 400, C.ink);
      if (it.attr && !r.infoBox) p.text('（' + who(r) + (r.capCard ? ' 拍）' : ' 說）'), x + w - 3, y + h - 2.1, 2.3, SANS, 700, attrCol(r), 'right');
      if (star && !it.cont) {
        p.rot(x + w - 4.5, y + 4.2, 0.18, function () {
          c.strokeStyle = C.red; c.lineWidth = p.L(0.35); c.beginPath(); c.arc(p.P(x + w - 4.5), p.PY(y + 4.2), p.L(3.3), 0, Math.PI * 2); c.stroke();
          p.text('重點', x + w - 4.5, y + 5.1, 2.3, SERIF, 900, C.red, 'center');
        });
      }
    });
  }
  // 地點標題：大號碼＋地點名稱＋虛線
  function placeHead(p, it, x, y, w) {
    var c = p.c, pl = it.pl, tx = x;
    if (pl.kind === 'stop') {
      p.text('北京note', x + 0.2, y + 2.2, 1.6, LOGO, 400, C.olive);
      p.text(String(pl.n), x + 1, y + 9.4, 8.5, SERIF, 400, C.olive);
      tx = x + 4 + textW(String(pl.n), 8.5, SERIF, 400);
    } else { (pl.kind === 'meal' ? maple : ginkgo)(p, x + 3, y + 6.6, 3.2, -0.3); tx = x + 7.5; }
    var name = clamp(wrap(pl.label, 4.4, SANS, 700, x + w - tx - 2), 1)[0];
    p.text(name, tx, y + 7.2, 4.4, SANS, 700, C.ink);
    var kick = pl.kind === 'stop' ? 'Stop ' + pl.n : pl.kind === 'meal' ? 'Gourmet' : pl.kind === 'hotel' ? 'Hotel' : 'Memo';
    p.text(kick, tx + 0.2, y + 2.9, 2.6, HAND, 700, C.olive);
    var lx = tx + textW(name, 4.4, SANS, 700) + 2;
    if (lx < x + w - 4) { c.save(); c.setLineDash([p.L(0.8), p.L(0.8)]); c.strokeStyle = C.olive; c.lineWidth = p.L(0.25); c.beginPath(); c.moveTo(p.P(lx), p.PY(y + 6)); c.lineTo(p.P(x + w), p.PY(y + 6)); c.stroke(); c.restore(); }
  }

  /* ---------- 排版：瀑布流（N 欄），依時間把地點標題、照片、見聞排進頁面 ---------- */
  var GAP = 4.2;
  // spec：{ x0 欄區左緣, w 欄區寬, cols 欄數, gut 欄距 }
  function colW(spec) { return (spec.w - spec.gut * (spec.cols - 1)) / spec.cols; }
  function infoOf(day, name) {
    var hit = day.stops.filter(function (s) { return s.name === name; })[0] || day.meals.filter(function (m) { return m.name === name; })[0];
    if (!hit || !hit.desc) return '';
    var t = String(hit.desc).replace(/【[^】]*】/g, '').trim(), out = '';
    t.replace(/([。！？])/g, '$1\u0001').split('\u0001').some(function (sen) { if ((out + sen).length > 70 && out) return true; out += sen; return false; });
    return out.length > 74 ? out.slice(0, 72) + '…' : out;
  }
  function photoItem(r, ar, span, spec) {
    ar = ar || 1.33;
    var w = span === 'all' ? spec.w : colW(spec), iw = w - 2 * PF, ih = iw / ar;
    if (span === 'all' && ih > iw * 0.75) { ih = iw * 0.75; iw = ih * ar; }   // 橫跨兩欄時太高就等比縮小，不裁切
    return { t: 'photo', r: r, ar: ar, span: span, iw: iw, ih: ih, h: ih + PF + CAP, dx: (w - 2 * PF - iw) / 2 };
  }
  function noteItem(r, span, spec) {
    var w = span === 'all' ? spec.w : colW(spec), lines = wrap(r.text, NS, SANS, 400, w - 6);
    return { t: 'note', r: r, span: span, w: w, all: lines };
  }
  function paginate(items, firstTop, H, spec, nextTop) {
    var pages = [], q = items.slice(), y1 = H - 9, cur = null, N = spec.cols, cw = colW(spec);
    var cx = function (i) { return spec.x0 + i * (cw + spec.gut); };
    var maxY = function () { return Math.max.apply(null, cur.col); };
    var minI = function () { var m = 0; for (var i = 1; i < N; i++) if (cur.col[i] < cur.col[m]) m = i; return m; };
    function newPage(top) { cur = { items: [], col: [], top: top, heads: [] }; for (var i = 0; i < N; i++) cur.col.push(top); pages.push(cur); }
    function setAll(y) { for (var i = 0; i < N; i++) cur.col[i] = y; }
    newPage(firstTop);
    var guard = 0;
    while (q.length && guard++ < 6000) {
      var it = q[0];
      if (it.t === 'head') {
        var yH = maxY(), nxt = q[1], need = 11 + (nxt ? Math.min(30, nxt.h || 30) : 0);
        if (yH + need > y1 && cur.items.length) { newPage(nextTop); continue; }
        cur.items.push({ k: 'head', it: it, x: spec.x0, y: yH, w: spec.w }); cur.heads.push(it.pl.name + '|' + it.pl.label); setAll(yH + 11.5); q.shift(); continue;
      }
      if (it.t === 'photo') {
        if (it.span === 'all') {
          var yS = maxY();
          if (yS + it.h > y1) {
            if (yS + it.h * 0.75 <= y1 && it.ih > 30) { var f = (y1 - yS - PF - CAP) / it.ih; it.ih *= f; it.iw *= f; it.dx = (spec.w - 2 * PF - it.iw) / 2; it.h = it.ih + PF + CAP; }
            else { if (!cur.items.length || N === 1) { Object.assign(it, photoItem(it.r, it.ar, 1, spec)); } else newPage(nextTop); continue; }
          }
          cur.items.push({ k: 'photo', it: it, x: spec.x0 + PF + (it.dx || 0), y: yS + PF, w: it.iw, h: it.ih }); setAll(yS + it.h + GAP); q.shift(); continue;
        }
        var ci = minI();
        if (cur.col[ci] + it.h > y1) {
          var room = y1 - cur.col[ci];
          if (room >= 30) { var nih = room - PF - CAP; if (nih < it.ih) { it.ih = nih; it.iw = nih * it.ar; it.dx = (cw - 2 * PF - it.iw) / 2; it.h = room; } }
          else { newPage(nextTop); continue; }
        }
        cur.items.push({ k: 'photo', it: it, x: cx(ci) + PF + (it.dx || 0), y: cur.col[ci] + PF, w: it.iw, h: it.ih }); cur.col[ci] += it.h + GAP; q.shift(); continue;
      }
      if (it.t === 'note') {
        var lines = it.rest || it.all, w = it.w;
        var put = function (x, y, ls, attr, rot) {
          var h = noteGeom(it.r, w, ls) - (attr ? 0 : 3.9);
          cur.items.push({ k: 'note', it: { r: it.r, lines: ls, attr: attr, cont: !!it.rest, label: it.label, rot: rot }, x: x, y: y, w: w, h: h });
          return h;
        };
        if (it.span === 'all') {
          var yN = maxY(), fitN = Math.floor((y1 - yN - 12.6) / NL);
          if (fitN >= lines.length) { setAll(yN + put(spec.x0, yN, lines, true, 0) + GAP); q.shift(); continue; }
          if (fitN >= 3) { put(spec.x0, yN, lines.slice(0, fitN), false, 0); it.rest = lines.slice(fitN); }
          newPage(nextTop); continue;
        }
        // 找能完整放下的欄；都放不下就放在最空的欄並截斷到下一頁
        var best = -1;
        for (var k = 0, order = cur.col.map(function (v, i) { return i; }).sort(function (a, b) { return cur.col[a] - cur.col[b]; }); k < order.length; k++) {
          if (Math.floor((y1 - cur.col[order[k]] - 12.6) / NL) >= lines.length) { best = order[k]; break; }
        }
        var rot = (hash(it.r.id + 'r') - 0.5) * 0.05;
        if (best >= 0) { cur.col[best] += put(cx(best), cur.col[best], lines, true, rot) + GAP; q.shift(); continue; }
        var cn = minI(), fit = Math.floor((y1 - cur.col[cn] - 12.6) / NL);
        if (fit >= 3) { cur.col[cn] += put(cx(cn), cur.col[cn], lines.slice(0, fit), false, rot) + GAP; it.rest = lines.slice(fit); }
        newPage(nextTop); continue;
      }
      q.shift();
    }
    pages.forEach(function (pg) { pg.end = pg.col.slice(); pg.spec = spec; });
    return pages;
  }

  /* ---------- 拼版：依照片比例把多張照片排滿一個區域（像雜誌的滿版照片牆） ---------- */
  // 依照片原始比例分行排滿區域（不裁切）：試遍分行方式，挑最能填滿區域、人物照又夠大的排法；整體等比縮放，置中
  function layoutRows(ars, pe, X, Y, Wd, Hd, g) {
    var n = ars.length, best = null, idx = ars.map(function (a, i) { return i; });
    var orders = [idx];
    if (pe.some(Boolean) && !pe.every(Boolean)) orders.push(idx.slice().sort(function (a, b) { return (pe[b] - pe[a]) || a - b; }), idx.slice().sort(function (a, b) { return (pe[a] - pe[b]) || a - b; }));
    var limit = n <= 10 ? (1 << (n - 1)) : 0;
    var tryRows = function (rows, oi) {
      if (rows.length > 4) return;
      var hs = rows.map(function (rw) { return (Wd - g * (rw.length - 1)) / rw.reduce(function (a, i) { return a + ars[i]; }, 0); });
      var sumH = hs.reduce(function (a, b) { return a + b; }, 0), s = Math.min(1, (Hd - g * (rows.length - 1)) / sumH);
      var used = 0, pa = 0, sa = 0;
      rows.forEach(function (rw, ri) { rw.forEach(function (i) { var a = (hs[ri] * s * ars[i]) * (hs[ri] * s) / (Wd * Hd); used += a; if (pe[i]) pa += a; else sa += a; }); });
      var score = -used * 3 - pa * 2 + sa * 0.6 + oi * 0.03 + rows.filter(function (rw) { return rw.length > 4; }).length * 0.6;
      if (!best || score < best.score) best = { score: score, rows: rows, hs: hs, s: s };
    };
    orders.forEach(function (ord, oi) {
      if (limit) {
        for (var mask = 0; mask < limit; mask++) {
          var rows = [[ord[0]]];
          for (var j = 1; j < n; j++) { if (mask & (1 << (j - 1))) rows.push([]); rows[rows.length - 1].push(ord[j]); }
          tryRows(rows, oi);
        }
      } else {
        for (var r = 1; r <= 4; r++) { var per = Math.ceil(n / r), rws = []; for (var k = 0; k < n; k += per) rws.push(ord.slice(k, k + per)); tryRows(rws, oi); }
      }
    });
    var totalH = best.hs.reduce(function (a, b) { return a + b * best.s; }, 0) + g * (best.rows.length - 1);
    var y = Y + Math.max(0, (Hd - totalH) / 2), tiles = [];
    best.rows.forEach(function (rw, ri) {
      var h = best.hs[ri] * best.s, rowW = rw.reduce(function (a, i) { return a + ars[i] * h; }, 0) + g * (rw.length - 1), x = X + (Wd - rowW) / 2;
      rw.forEach(function (i) { var w = ars[i] * h; tiles[i] = { x: x, y: y, w: w, h: h }; x += w + g; });
      y += h + g;
    });
    return tiles;
  }
  function justify(ars, X, Y, Wd, Hd, g) { return layoutRows(ars, ars.map(function () { return false; }), X, Y, Wd, Hd, g); }
  // 照片牆上的說明：照片下緣漸層＋白字（說明（誰 拍））
  function tileCaption(p, r, t, withPlace) {
    var c = p.c, attr = '（' + who(r) + ' 拍）', txt = [withPlace ? r.place : '', capText(r)].filter(Boolean).join('｜');
    var sz = Math.min(2.4, Math.max(1.8, t.w / 18)), aw = textW(attr, sz * 0.92, SANS, 700);
    var g = c.createLinearGradient(0, p.PY(t.y + t.h - 7), 0, p.PY(t.y + t.h));
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = g; c.fillRect(p.P(t.x), p.PY(t.y + t.h - 7), p.L(t.w), p.L(7));
    var line = txt && t.w > aw + 8 ? clamp(wrap(txt, sz, SANS, 400, t.w - aw - 3), 1)[0] : '';
    if (line) p.text(line, t.x + 1.4, t.y + t.h - 1.6, sz, SANS, 400, '#FFFFFF');
    p.text(attr, t.x + t.w - 1.2, t.y + t.h - 1.6, sz * 0.92, SANS, 700, '#FFE3A3', 'right');
  }
  function isPeople(r) { return window.JournalAPI.peopleKind ? window.JournalAPI.peopleKind(r) === 'p' : false; }
  // 有人物的照片給大格、風景照給小格：試遍各種分行方式與順序，挑「人物照面積最大、風景照較小、裁切最少」的排法
  function justifyW(recs, X, Y, Wd, Hd, g) {
    return layoutRows(recs.map(function (r) { return dims[r.id] || 1.33; }), recs.map(isPeople), X, Y, Wd, Hd, g);
  }
  function mosaic(p, recs, imgs, X, Y, Wd, Hd, withPlace) {
    var tiles = justifyW(recs, X, Y, Wd, Hd, 1.3);
    recs.forEach(function (r, i) { var t = tiles[i]; p.img(imgs[r.id], t.x, t.y, t.w, t.h); tileCaption(p, r, t, withPlace); });
  }
  function chunkPhotos(list, cap) {
    var n = list.length, k = Math.ceil(n / cap), out = [], per = Math.ceil(n / k);
    for (var i = 0; i < n; i += per) out.push(list.slice(i, i + per));
    return out;
  }

  /* ---------- 組書 ---------- */
  var dims = {};
  function preloadDims(recs) {
    return Promise.all(recs.map(function (r) {
      if (dims[r.id]) return null;
      return loadImg(r, false).then(function (im) { if (im) { dims[r.id] = im.width / im.height; if (im.close) im.close(); } });
    }));
  }
  function stopsLine(day) { return day.stops.map(function (s) { return s.name.replace(/（.*?）/g, ''); }).join('→'); }
  function build(o) {
    var A = window.JournalAPI, size = SIZES[o.size];
    var items = A.items().filter(function (r) { return o.authors.indexOf(A.who(r)) >= 0; });
    var photos = items.filter(A.isPhoto).sort(A.byTime);
    return preloadDims(photos).then(function () {
      var PW = size.land ? 100 * size.w / size.h : 100, H = size.land ? 100 : 100 * size.h / size.w;
      var used = {}, cover = photos.filter(function (r) { return r.id === o.coverId; })[0] || photos[0] || null;
      if (cover) used[cover.id] = 1;
      var pick = function (pred) { var r = photos.filter(function (x) { return !used[x.id] && (!pred || pred(x)); })[0] || null; if (r) used[r.id] = 1; return r; };
      var land = function (r) { return (dims[r.id] || 1.3) >= 1.15; }, tall = function (r) { return (dims[r.id] || 1) < 0.95; };
      var L = [{ t: 'cover', photo: cover }];
      L.push({ t: 'inside', photo: size.land ? (pick(land) || pick() || cover) : (pick(tall) || pick() || cover) });
      var toc = { t: 'toc', photos: [] }; L.push(toc);
      DAYS.forEach(function (day) {
        var its = items.filter(function (r) { return (A.effDay ? A.effDay(r) : r.day) === day.id; }).sort(A.byTime);
        if (!its.length) return;
        var dayPhotos = its.filter(A.isPhoto);
        var free = dayPhotos.filter(function (r) { return !used[r.id]; });
        var hero = free.filter(function (r) { return isPeople(r) && (size.land ? (dims[r.id] || 1) < 1.6 : land(r)); })[0] || free.filter(function (r) { return size.land ? true : land(r); })[0] || free[0] || null;
        if (hero) used[hero.id] = 1;
        var mealNames = []; DAYS.forEach(function (dd) { dd.meals.forEach(function (m) { mealNames.push(m.name); }); });
        var mealPh = dayPhotos.filter(function (r) { return !used[r.id] && mealNames.indexOf(r.place) >= 0; });
        var foodPages = [], foodCap = size.land ? 6 : 6;
        if (mealPh.length >= 4) { chunkPhotos(mealPh, foodCap).forEach(function (ch) { foodPages.push({ t: 'food', day: day, photos: ch }); }); mealPh.forEach(function (r) { used[r.id] = 1; }); }
        var seenCap = {};
        its.filter(A.isPhoto).forEach(function (r) {
          var t = String(r.note || '').trim();
          if (!t || seenCap[t]) { capMode[r.id] = 'hide'; return; }
          seenCap[t] = 1;
          capMode[r.id] = Array.from(t).length <= 11 && t.indexOf('\n') < 0 ? 'show' : 'card';
        });
        var groups = A.groupsFor(day, its).map(function (g) {
          return { pl: { name: g.place.name, label: A.placeTitle(g.place), kind: g.place.kind, n: g.place.n }, info: g.place.name ? infoOf(day, g.place.name) : '',
            photos: g.items.filter(function (r) { return A.isPhoto(r) && !used[r.id]; }),
            notes: g.items.filter(A.isNote).concat(g.items.filter(function (r) { return A.isPhoto(r) && capMode[r.id] === 'card'; }).map(function (r) {
              return { id: 'cap-' + r.id, kind: 'note', capCard: true, text: r.note, author: r.author, mine: r.mine, takenAt: r.takenAt, addedAt: r.addedAt, day: r.day, place: r.place };
            })).sort(A.byTime) };
        }).filter(function (g) { return g.photos.length || g.notes.length; });
        var textSeq = function (g, spec, inlineN) {
          var s = [{ t: 'head', pl: g.pl, h: 11 }];
          if (g.info) s.push(Object.assign(noteItem({ id: 'info-' + day.id + g.pl.name, text: g.info, infoBox: true }, spec.cols > 1 && !g.photos.length ? 'all' : 1, spec), { label: '旅遊重點' }));
          var inl = g.photos.slice().sort(function (a, b) { return (isPeople(b) - isPeople(a)) || A.byTime(a, b); }).slice(0, inlineN);
          g.rest = g.photos.filter(function (r) { return inl.indexOf(r) < 0; });
          inl.concat(g.notes).sort(A.byTime).forEach(function (r, k) {
            if (A.isPhoto(r)) { var span = (spec.cols > 1 && (dims[r.id] || 1.3) >= 1.15 && (isPeople(r) || (k === 0 && g.photos.length >= 2))) ? 'all' : 1; s.push(photoItem(r, dims[r.id], span, spec)); }
            else { var long = spec.cols > 1 && Array.from(r.text).length > 150; var ni = noteItem(r, long ? 'all' : 1, spec); ni.label = r.capCard ? '照片說明' : r.star ? '重點見聞' : 'Memo'; s.push(ni); }
          });
          return s;
        };
        if (!size.land) {
          // 直式：兩欄拼貼（每個地點先放 2 張照片），其餘照片接在後面排成滿版照片牆
          var spec = { x0: 6, w: 88, cols: 2, gut: 4 }, seq = [], extra = {};
          groups.forEach(function (g) { seq = seq.concat(textSeq(g, spec, 2)); if (g.rest.length) extra[g.pl.name + '|' + g.pl.label] = g.rest; });
          var routeN = clamp(wrap(stopsLine(day), 3, SANS, 600, 86), 2).length, heroH = 0, dayPages = null;
          // 最後一頁只剩一點點時，把開場大照片縮小一些，避免浪費一頁
          [0.4, 0.31, 0.24].some(function (k) {
            heroH = Math.min(H * k, hero ? 100 / (dims[hero.id] || 1.5) : H * k); dayPages = paginate(seq, heroH + 7.5 + 13.5 + (routeN - 1) * 4.2 + 4, H, spec, 10);
            return dayPages.length === 1 || dayPages[dayPages.length - 1].items.length >= 2;
          });
          dayPages.forEach(function (pg, k) {
            L.push({ t: 'day', day: day, first: k === 0, hero: k === 0 ? hero : null, heroH: heroH, lay: pg });
            pg.heads.forEach(function (key) { if (extra[key]) { chunkPhotos(extra[key], 6).forEach(function (ch) { L.push({ t: 'wall', day: day, place: key.split('|')[1], photos: ch }); }); delete extra[key]; } });
          });
        } else {
          // 橫式：開場頁＝左側滿版大照片＋右側標題與行程；之後每頁＝左側文字欄＋右側照片牆
          L.push({ t: 'lopen', day: day, hero: hero });
          var side = { x0: 5, w: 40, cols: 1, gut: 0 }, wide = { x0: 6, w: PW - 12, cols: 3, gut: 4 };
          var chunk = null, chunks = [];
          var est = function (g) { return 12 + (g.info ? 20 : 0) + g.notes.reduce(function (a, r) { return a + noteGeom(r, 40, wrap(r.text, NS, SANS, 400, 34)) + GAP; }, 0); };
          groups.forEach(function (g) {
            var h = est(g);
            if (!chunk || (chunk.ph.length && chunk.ph.length + g.photos.length > 5) || chunk.h + h > H - 14) { chunk = { gs: [], ph: [], h: 0 }; chunks.push(chunk); }
            chunk.gs.push(g); chunk.h += h; chunk.ph = chunk.ph.concat(g.photos);
          });
          chunks.forEach(function (ch) {
            var seq2 = []; ch.gs.forEach(function (g) { seq2 = seq2.concat(textSeq(g, side, 0)); });
            if (!ch.ph.length) { paginate(ch.gs.reduce(function (a, g) { return a.concat(textSeq(g, wide, 2)); }, []), 10, H, wide, 10).forEach(function (pg) { L.push({ t: 'ltext', day: day, lay: pg }); }); return; }
            var pgs = paginate(seq2, 10, H, side, 10), byKey = {};
            ch.gs.forEach(function (g) { byKey[g.pl.name + '|' + g.pl.label] = g; });
            var pending = [];
            pgs.forEach(function (pg, k) {
              var own = [];
              pg.heads.forEach(function (key) { var g = byKey[key]; if (g) own = own.concat(g.photos); });
              // 這頁沒有自己的照片時，先用上一頁放不下的照片，右側不留白
              if (!own.length) { own = pending; pending = []; }
              else if (pending.length) { chunkPhotos(pending, 7).forEach(function (pp) { L.push({ t: 'wall', day: day, place: '', photos: pp }); }); pending = []; }
              L.push({ t: 'lside', day: day, lay: pg, photos: own.slice(0, 5) });
              pending = own.slice(5);
            });
            if (pending.length) chunkPhotos(pending, 7).forEach(function (pp) { L.push({ t: 'wall', day: day, place: '', photos: pp }); });
          });
        }
        foodPages.forEach(function (fp) { L.push(fp); });
      });
      toc.photos = [pick(), pick(), pick()].filter(Boolean);
      if (toc.photos.length < 3) toc.photos = photos.slice(0, 3);
      var end = { t: 'end', photos: photos.slice(-4) };
      var interior = L.length - 1 + 1;
      var target = o.pad ? Math.max(size.tt ? 40 : 8, Math.ceil(interior / 8) * 8) : interior, mi = 0;
      while (interior++ < target) L.push({ t: 'memo', i: mi++ });
      L.push(end);
      L.forEach(function (pg, i) { pg.n = i; });
      var dayStart = {}; L.forEach(function (pg) { if ((pg.t === 'day' && pg.first) || pg.t === 'lopen') dayStart[pg.day.id] = pg.n; });
      var sheets = L.map(function (pg, i) { return { n: i, pages: [pg] }; });
      return { L: L, sheets: sheets, H: H, PW: PW, size: size, items: items, photos: photos, dayStart: dayStart, interior: L.length - 1 };
    });
  }

  /* ---------- 各種頁面 ---------- */
  function loadImg(r, hi) {
    if (!r) return Promise.resolve(null);
    var blob = hi ? r.blob : (r.thumb || r.blob);
    var viaImg = function () { return new Promise(function (res) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 0); }; im.onerror = function () { URL.revokeObjectURL(u); res(null); }; im.src = u; }); };
    if (window.createImageBitmap) return createImageBitmap(blob).catch(viaImg);
    return viaImg();
  }
  function dayDateLabel(day) { var m = String(day.title || '').match(/^([^ ]*?（.）)/); return m ? m[1] : window.JournalAPI.dayDate(day); }
  function grad(p, y0, y1, a0, a1) {
    var c = p.c, g = c.createLinearGradient(0, p.PY(y0), 0, p.PY(y1));
    g.addColorStop(0, 'rgba(25,15,8,' + a0 + ')'); g.addColorStop(1, 'rgba(25,15,8,' + a1 + ')');
    c.fillStyle = g; c.fillRect(p.P(p.rx0), p.PY(y0), p.L(p.rx1 - p.rx0), p.L(y1 - y0));
  }

  // 封面（直式：寬 100；橫式：寬 200，整張一頁）
  function drawCover(p, bk, o, img, Wc) {
    var H = bk.H, c = p.c, A = window.JournalAPI;
    p.bg('#6F4A2E');
    if (img) p.imgSafe(img, p.rx0, -p.b, p.rx1 - p.rx0, H + 2 * p.b, 0, 0, Wc, H);
    else { stripes(p, 'cover', 0.9); leaves(p, 'cv', [[20, 40, 8], [70, 70, 10], [40, 100, 7], [80, 30, 6]]); }
    grad(p, -p.b, H * 0.34, 0.5, 0); grad(p, H * 0.55, H + p.b, 0, 0.62);
    var ms = Math.min(Wc * 0.2, H * 0.15), mx = 5;
    var mw = masthead(p, mx, 4 + ms * 0.95, ms, C.cream, true);
    var rx = Math.min(Wc - 5, mx + mw + 22);
    p.shadow(true, 0.8, 0.2);
    p.text('秋號', Wc - 5, 4 + ms * 0.45, ms * 0.36, SERIF, 900, C.cream, 'right');
    p.text(String(A.tripRange().slice(0, 4)), Wc - 5, 4 + ms * 0.68, ms * 0.17, LAT, 700, C.cream, 'right', 0.8);
    p.text('［家族旅行］', Wc - 5, 4 + ms * 0.88, ms * 0.14, SANS, 700, C.cream, 'right');
    p.text(A.tripRange().slice(5).replace(/\s/g, ''), mx + 1, 4 + ms * 1.32, ms * 0.17, LAT, 700, C.cream, 'left', 0.4);
    p.shadow(false);
    // 卷頭特集圓章
    var by = H * 0.66;
    c.fillStyle = 'rgba(255,243,196,.92)'; c.beginPath(); c.arc(p.P(mx + 6), p.PY(by), p.L(5.2), 0, Math.PI * 2); c.fill();
    p.text('卷頭', mx + 6, by - 0.3, 2.4, SERIF, 900, C.oliveD, 'center'); p.text('特集', mx + 6, by + 2.7, 2.4, SERIF, 900, C.oliveD, 'center');
    // 大標題（暖色漸層＋陰影）
    var ts = Math.min(Wc * 0.088, H * 0.1, 12), tl = clamp(wrap(o.title, ts, SERIF, 900, Wc - 10), 2), ty = by + 6 + ts;
    var g = c.createLinearGradient(p.P(mx), 0, p.P(Wc * 0.9), 0); g.addColorStop(0, '#FFF6CF'); g.addColorStop(0.55, '#FFD9A0'); g.addColorStop(1, '#F7A98B');
    p.shadow(true, 1.2, 0.4);
    tl.forEach(function (l, i) { p.font(ts, SERIF, 900); c.fillStyle = g; c.textAlign = 'left'; c.fillText(l, p.P(mx), p.PY(ty + i * ts * 1.15)); });
    var sy = ty + (tl.length - 1) * ts * 1.15 + ts * 0.62;
    if (o.sub) p.text(o.sub + ' ♥', mx + 0.5, sy, Math.min(4, Wc * 0.036), SANS, 700, C.cream);
    // 右下：每日特輯列表
    var days = DAYS.filter(function (d) { return bk.dayStart[d.id] != null; }), ly = Wc > H ? 4 + ms * 1.32 + 5 : H - 5 - days.length * 3.9;
    days.forEach(function (d, i) { p.text(d.label + '｜' + d.short, Wc - 5, ly + i * 3.9, 2.7, SANS, 700, C.cream, 'right'); });
    p.text(o.authors.join('・') + '　共同記錄', mx + 0.5, H - 5, 2.5, SANS, 400, 'rgba(255,243,196,.9)');
    p.shadow(false);
  }


  // 扉頁：滿版照片＋直書引言＋紅色方框
  function drawInside(p, bk, o, img) {
    var H = bk.H, PW = bk.PW, c = p.c, k = H / 141;
    p.bg('#7A3B22');
    if (img) p.imgSafe(img, p.rx0, -p.b, p.rx1 - p.rx0, H + 2 * p.b, 0, 0, PW, H); else stripes(p, 'inside', 0.8);
    grad(p, -p.b, H + p.b, 0.12, 0.32);
    p.shadow(true, 1, 0.2);
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = p.L(0.3); c.beginPath(); c.moveTo(p.P(PW - 27), p.PY(H * 0.12)); c.lineTo(p.P(PW - 36), p.PY(H * 0.62)); c.stroke();
    var fs = 4.3 * Math.max(0.8, k);
    p.vtext('這趟北京之旅，', PW - 16, H * 0.16, fs, fs * 1.3, H * 0.7, SERIF, 700, '#FFFFFF');
    p.vtext('總有一天會變成我們的「北京note」。', PW - 16 - fs * 1.3, H * 0.16, fs, fs * 1.3, H * 0.72, SERIF, 700, '#FFFFFF');
    p.shadow(false);
    var bx = 7, bw = 22, bh = 34, byy = H - bh - 9;
    p.rect(bx, byy, bw, bh, 'rgba(160,40,40,.92)');
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = p.L(0.25); c.strokeRect(p.P(bx + 1.2), p.PY(byy + 1.2), p.L(bw - 2.4), p.L(bh - 2.4));
    p.vtext('一起寫下我們的旅行。', bx + bw - 5, byy + 4, 4, 5.4, 20, SERIF, 900, '#FFFFFF');
    p.text('Let\'s make our own', bx + bw / 2, byy + bh - 6, 1.6, LAT, 400, '#FFFFFF', 'center');
    p.text('travel magazine!', bx + bw / 2, byy + bh - 4, 1.6, LAT, 400, '#FFFFFF', 'center');
  }

  // 目錄（直式：右側照片欄；橫式：右半邊照片牆）
  function drawToc(p, bk, o, imgs, pg) {
    var H = bk.H, PW = bk.PW, A = window.JournalAPI, c = p.c, landL = bk.size.land;
    p.bg(C.paper);
    leaves(p, 'toc', [[8, 6, 3.5], [landL ? 60 : 92, 4, 5], [landL ? 40 : 60, 3, 3]]);
    masthead(p, 6, 19, 13, C.olive);
    p.text('CONTENTS', 6.5, 25, 3, LAT, 700, C.ink, 'left', 1.2);
    var credits = ['發　行：' + o.authors.join('、'), '製　作：相約北京 App', '出　刊：' + A.tripRange().slice(0, 4) + '.' + A.dayDate(DAYS[DAYS.length - 1]).split('/')[0]];
    if (landL) p.text(clamp(wrap(credits.join('　'), 2, SANS, 400, 60), 1)[0], 6.5, 29.5, 2, SANS, 400, C.soft);
    else credits.forEach(function (t, i) { p.text(clamp(wrap(t, 2.1, SANS, 400, 30), 1)[0], 94, 12 + i * 3.4, 2.1, SANS, 400, C.ink, 'right'); });
    var map = {}; pg.photos.forEach(function (r, i) { map[r.id] = imgs[i]; });
    if (landL) { if (pg.photos.length) mosaic(p, pg.photos, map, 70, 4, PW - 74, H - 8, true); else p.rect(70, 4, PW - 74, H - 8, C.sand); }
    else {
      var colX = 67, cw = 27, top = 34, bottom = H - 10, n = imgs.length || 1, gh = (bottom - top - (n - 1) * 1.5) / n;
      imgs.forEach(function (im, i) { p.img(im, colX, top + i * (gh + 1.5), cw, gh); });
      if (!imgs.length) p.rect(colX, top, cw, bottom - top, C.sand);
    }
    var y = landL ? 36 : 33, tsz = landL ? 5.2 : 6.8;
    p.text('［卷頭特集］', 6, y, 2.3, SANS, 400, C.ink); y += tsz + 1.7;
    var tl = clamp(wrap(o.title, tsz, SERIF, 900, 60), 2);
    tl.forEach(function (l, i) { p.text(l, 6, y + i * tsz * 1.15, tsz, SERIF, 900, C.olive); }); y += (tl.length - 1) * tsz * 1.15 + 5.2;
    if (o.sub) { p.text(clamp(wrap(o.sub + ' ♥', 3.2, SANS, 700, 58), 1)[0], 6.3, y, 3.2, SANS, 700, C.olive); y += 5; }
    var days = DAYS.filter(function (d) { return bk.dayStart[d.id] != null; });
    var avail = H - (landL ? 16 : 22) - y, step = Math.min(13, Math.max(7.5, avail / Math.max(1, days.length + 1.4)));
    y += 4;
    days.forEach(function (d) {
      var n = bk.dayStart[d.id], num = (n < 10 ? '0' : '') + n;
      p.text(num, 6, y + 0.5, 2.6, LAT, 700, C.soft);
      p.text(clamp(wrap(d.short, 4.2, SANS, 600, 50), 1)[0], 13, y + 1, 4.2, SANS, 600, C.ink);
      p.text(clamp(wrap(A.dayDate(d) + '　' + stopsLine(d), 2.2, SANS, 400, 50), 1)[0], 13.2, y + 4.4, 2.2, SANS, 400, C.ink);
      y += step;
    });
    p.text('［Members］', 6, y + 1, 2.3, SANS, 400, C.ink); y += 6;
    o.authors.forEach(function (nme, i) {
      var its = bk.items.filter(function (r) { return A.who(r) === nme; }), ph = its.filter(A.isPhoto).length;
      var per = landL ? 3 : 2, xx = 6 + (i % per) * (landL ? 21 : 30), yy = y + Math.floor(i / per) * 5.5;
      c.fillStyle = colorOf[nme] || C.red; c.beginPath(); c.arc(p.P(xx + 1.2), p.PY(yy - 1), p.L(1.2), 0, Math.PI * 2); c.fill();
      p.text(nme + (landL ? ' ' : '　') + ph + '照・' + (its.length - ph) + '記', xx + 3.5, yy, 2.2, SANS, 400, C.ink);
    });
    folio(p, pg.n);
  }

  // 每頁上方的小標
  function topBar(p, d, extra) {
    var PW = p.W, lab = d.label.toUpperCase();
    p.text(lab, 6, 6.8, 2.6, LAT, 700, C.olive, 'left', 0.6);
    var t = d.short + (extra ? '｜' + extra : '');
    p.text(clamp(wrap(t, 3, SANS, 700, PW - 30), 1)[0], 6 + textW(lab, 2.6, LAT, 700) + 2.5, 6.9, 3, SANS, 700, C.ink);
    p.rect(6, 8.3, PW - 12, 0.25, C.olive);
  }
  function drawItems(p, pg, imgs) {
    pg.lay.items.forEach(function (e) {
      if (e.k === 'head') placeHead(p, e.it, e.x, e.y, e.w);
      else if (e.k === 'photo') {
        var r = e.it.r, rot = e.it.span === 'all' ? 0 : (hash(r.id) - 0.5) * 0.07, tc = hash(r.id + 't') < 0.45 ? [C.tape, C.tape2, C.tape3][Math.floor(hash(r.id + 'c') * 3)] : null;
        polaroid(p, imgs[r.id], r, e.x, e.y, e.w, e.h, rot, tc);
      } else if (e.k === 'note') card(p, e.it, e.x, e.y, e.w, e.h);
    });
    var sp = pg.lay.spec, cw = colW(sp), y1 = p.H - 9;
    pg.lay.end.forEach(function (e, ci) { if (y1 - e > 16) leaves(p, 'g' + pg.n + ci, [[sp.x0 + ci * (cw + sp.gut) + cw * 0.3, e + 8, 4], [sp.x0 + ci * (cw + sp.gut) + cw * 0.7, e + 12, 3]]); });
  }

  // 直式每日頁：第一頁上方大照片與標題，下方兩欄拼貼
  function drawDay(p, bk, pg, imgs) {
    var H = bk.H, d = pg.day;
    stripes(p, 'd' + d.id + '-' + pg.n, 0.5);
    dots(p, pg.n, 10, 4, H * 0.45, p.W - 4, H - 8);
    if (pg.first) {
      var hh = pg.heroH;
      if (imgs.hero) p.imgSafe(imgs.hero, p.rx0, -p.b, p.rx1 - p.rx0, hh + p.b, 0, 0, p.W, hh);
      else { p.rect(p.rx0, -p.b, p.rx1 - p.rx0, hh + p.b, '#E7DCC2'); leaves(p, 'h' + d.id, [[20, hh * 0.5, 7], [50, hh * 0.35, 9], [78, hh * 0.6, 6]]); }
      if (imgs.hero && pg.hero) tileCaption(p, pg.hero, { x: 0, y: 0, w: p.W, h: hh }, false);
      p.rect(p.rx0, hh + 0.8, p.rx1 - p.rx0, 0.5, C.olive); p.rect(p.rx0, hh + 1.8, p.rx1 - p.rx0, 0.2, C.olive);
      var y = hh + 7.5;
      p.text(d.label.toUpperCase() + '　' + dayDateLabel(d), 6, y, 2.6, SANS, 700, C.olive, 'left', 0.2);
      p.text(clamp(wrap(d.short, 6.4, SERIF, 900, 86), 1)[0], 6, y + 8, 6.4, SERIF, 900, C.olive);
      p.lines(clamp(wrap(stopsLine(d), 3, SANS, 600, 86), 2), 6.2, y + 13.5, 3, 4.2, SANS, 600, C.ink);
    } else topBar(p, d);
    drawItems(p, pg, imgs);
    folio(p, pg.n);
  }

  // 照片牆：整頁排滿照片（兩種方向共用）
  function drawWall(p, bk, pg, imgs) {
    var H = bk.H, PW = bk.PW;
    p.bg(C.paper);
    topBar(p, pg.day, pg.place);
    mosaic(p, pg.photos, imgs, 4, 10.5, PW - 8, H - 17, !pg.place);
    folio(p, pg.n);
  }

  // 橫式開場頁：直式或接近方形的照片放左邊滿高；橫幅照片放上方滿寬，標題與行程在下方（照片都不裁切）
  function drawLOpen(p, bk, pg, imgs) {
    var H = bk.H, PW = bk.PW, d = pg.day, c = p.c, ar0 = pg.hero ? (dims[pg.hero.id] || 0.8) : 0.8;
    stripes(p, 'lo' + d.id, 0.5);
    var rows = d.stops.map(function (s, i) { return { n: i + 1, t: s.name, sub: s.stay || '' }; });
    var timeline = function (x, y, w, yMax, cols) {
      var per = Math.ceil(rows.length / cols), cw = (w - (cols - 1) * 5) / cols;
      var lh = Math.min(6.2, (yMax - y) / Math.max(1, per + (cols === 1 ? d.meals.length * 0.7 : 0)));
      for (var ci = 0; ci < cols; ci++) {
        var part = rows.slice(ci * per, ci * per + per), x0 = x + ci * (cw + 5);
        if (part.length > 1) p.rect(x0 + 2.1, y - 1.2, 0.35, (part.length - 1) * lh, C.olive);
        part.forEach(function (r, i) {
          var yy = y + i * lh;
          c.fillStyle = C.olive; c.beginPath(); c.arc(p.P(x0 + 2.3), p.PY(yy - 1.2), p.L(1.9), 0, Math.PI * 2); c.fill();
          p.text(String(r.n), x0 + 2.3, yy - 0.3, 2.2, LAT, 700, '#FFFFFF', 'center');
          var subW = r.sub ? textW(r.sub, 2.1, SANS, 400) + 2 : 0;
          p.text(clamp(wrap(r.t, 3, SANS, 600, cw - 7 - subW), 1)[0], x0 + 6, yy, 3, SANS, 600, C.ink);
          if (r.sub) p.text(r.sub, x0 + cw, yy, 2.1, SANS, 400, C.soft, 'right');
        });
      }
      return y + per * lh + 1;
    };
    var meals = function (x, y, lh) { d.meals.forEach(function (m, i) { maple(p, x + 2.3, y + i * lh - 1.2, 1.5, 0.2); p.text(m.type + '｜' + m.name, x + 6, y + i * lh, 2.4, SANS, 400, C.soft); }); };
    if (ar0 >= 1.3) {
      var hh = Math.min(H * 0.6, PW / ar0);
      if (imgs.hero) { p.imgSafe(imgs.hero, p.rx0, -p.b, p.rx1 - p.rx0, hh + p.b, 0, 0, PW, hh); tileCaption(p, pg.hero, { x: 0, y: 0, w: PW, h: hh }, false); }
      p.rect(p.rx0, hh, p.rx1 - p.rx0, 0.6, C.olive);
      var y = hh + 9;
      p.text(d.label.toUpperCase(), 6, y, 4.2, LAT, 700, C.olive, 'left', 0.6);
      p.text(dayDateLabel(d), 6, y + 5.5, 2.8, SANS, 700, C.ink);
      p.lines(clamp(wrap(d.short, 5.6, SERIF, 900, 44), 2), 6, y + 13.5, 5.6, 6.6, SERIF, 900, C.ink);
      var tx = 56; p.text('今日行程', tx, y - 1, 2.8, SANS, 700, C.olive);
      var yEnd = timeline(tx, y + 4.5, PW - tx - 6, H - 14, rows.length > 4 ? 2 : 1);
      meals(tx, Math.min(yEnd + 2, H - 12), 4);
    } else {
      var sx = PW * 0.58;
      if (imgs.hero) { p.imgSafe(imgs.hero, -p.b, -p.b, sx + p.b, H + 2 * p.b, 0, 0, sx, H); tileCaption(p, pg.hero, { x: 0, y: 0, w: sx, h: H }, false); }
      else { p.rect(-p.b, -p.b, sx + p.b, H + 2 * p.b, '#E7DCC2'); leaves(p, 'lh' + d.id, [[20, 30, 8], [50, 55, 10], [30, 80, 7]]); }
      p.rect(sx, -p.b, 0.6, H + 2 * p.b, C.olive);
      var x = sx + 6, w = PW - x - 6, y2 = 13;
      smallMast(p, x, y2, 3.4, C.olive);
      p.text(d.label.toUpperCase(), x, y2 + 9, 4.2, LAT, 700, C.olive, 'left', 0.6);
      p.text(dayDateLabel(d), x + textW(d.label.toUpperCase(), 4.2, LAT, 700) + 3, y2 + 9, 2.8, SANS, 700, C.ink);
      var tl = clamp(wrap(d.short, 6.2, SERIF, 900, w), 2);
      tl.forEach(function (l, i) { p.text(l, x, y2 + 18 + i * 7.4, 6.2, SERIF, 900, C.ink); });
      y2 += 18 + (tl.length - 1) * 7.4 + 8;
      p.text('今日行程', x, y2, 2.8, SANS, 700, C.olive); y2 += 5;
      var ye = timeline(x, y2, w, H - 20, 1);
      meals(x, ye, 4.3);
    }
    folio(p, pg.n);
  }

  // 橫式內頁：左側文字欄（地點、重點、見聞），右側照片牆
  function drawLSide(p, bk, pg, imgs) {
    var H = bk.H, PW = bk.PW;
    stripes(p, 'ls' + pg.n, 0.45);
    p.text(pg.day.label.toUpperCase(), 5, 6.8, 2.6, LAT, 700, C.olive, 'left', 0.6);
    p.text(clamp(wrap(pg.day.short, 2.8, SANS, 700, 28), 1)[0], 5 + textW(pg.day.label.toUpperCase(), 2.6, LAT, 700) + 2, 6.9, 2.8, SANS, 700, C.ink);
    p.rect(5, 8.3, 40, 0.25, C.olive);
    drawItems(p, pg, imgs);
    if (pg.photos.length) { p.rect(47.5, -p.b, PW - 47.5 + p.b, H + 2 * p.b, '#FFFFFF'); mosaic(p, pg.photos, imgs, 49, 3.5, PW - 52.5, H - 7, true); }
    else leaves(p, 'lsx' + pg.n, [[80, 40, 8], [105, 70, 6]]);
    p.rightPage = false; folio(p, pg.n);
  }
  function drawLText(p, bk, pg, imgs) {
    stripes(p, 'lt' + pg.n, 0.45);
    topBar(p, pg.day);
    drawItems(p, pg, imgs);
    folio(p, pg.n);
  }

  // 美食頁：格紋底＋相框格子（直式 2 欄、橫式 3 欄）
  function drawFood(p, bk, pg, imgs) {
    var H = bk.H, PW = bk.PW, c = p.c, cols = bk.size.land ? 3 : 2;
    p.bg('#FBF2E6');
    c.save(); c.globalAlpha = 0.35; c.lineWidth = p.L(3.2);
    [['#F2B8B8', 1], ['#F4DFA8', -1]].forEach(function (s) { c.strokeStyle = s[0]; for (var k = -H; k < PW + H; k += 10) { c.beginPath(); c.moveTo(p.P(k), p.PY(-p.b)); c.lineTo(p.P(k + s[1] * H), p.PY(H + p.b)); c.stroke(); } });
    c.restore();
    p.rect(6, 10, PW - 12, 0.3, C.ink);
    p.text('旅途美食', PW - 6, 20, 6, SERIF, 900, C.ink, 'right');
    p.text(pg.day.label + '｜' + pg.day.short, PW - 6, 25, 2.4, SANS, 400, C.ink, 'right');
    c.strokeStyle = '#9C8F82'; c.lineWidth = p.L(0.45); c.lineCap = 'round';
    c.beginPath(); c.moveTo(p.P(9), p.PY(13)); c.lineTo(p.P(16), p.PY(28)); c.stroke();
    for (var t = 0; t < 3; t++) { c.beginPath(); c.moveTo(p.P(7.6 + t * 1.3), p.PY(12.5)); c.lineTo(p.P(9.6 + t * 1.1), p.PY(17)); c.stroke(); }
    c.beginPath(); c.ellipse(p.P(15), p.PY(15), p.L(1.6), p.L(2.6), -0.45, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(p.P(16), p.PY(17.6)); c.lineTo(p.P(21), p.PY(28)); c.stroke();
    var rows = Math.max(bk.size.land ? 1 : 2, Math.ceil(pg.photos.length / cols)), gy = 31, gap = 4;
    var cw = (PW - 12 - (cols - 1) * gap) / cols, ch = (H - 12 - gy - (rows - 1) * gap) / rows;
    pg.photos.forEach(function (r, i) {
      var x = 6 + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * (ch + gap);
      p.shadow(true, 1, 0.3); p.rect(x, y, cw, ch, '#EFE6D6'); p.shadow(false);
      p.img(imgs[r.id], x + 1.6, y + 1.6, cw - 3.2, ch - 9);
      var cap = [r.place, capText(r)].filter(Boolean).join('｜');
      p.text(clamp(wrap(cap, 2.3, SANS, 400, cw - 6 - textW('（' + who(r) + ' 拍）', 2.1, SANS, 700)), 1)[0], x + 2, y + ch - 3.4, 2.3, SANS, 400, C.ink);
      p.text('（' + who(r) + ' 拍）', x + cw - 2, y + ch - 3.4, 2.1, SANS, 700, attrCol(r), 'right');
    });
    p.rect(6, H - 9.5, PW - 12, 0.3, C.ink);
    folio(p, pg.n);
  }

  function drawMemo(p, bk, pg) {
    var H = bk.H, PW = bk.PW, c = p.c;
    stripes(p, 'memo' + pg.i, 0.35);
    if (pg.i % 2 === 0) {
      p.text('Memo', 8, 18, 6, HAND, 700, C.olive); p.text('旅途筆記', 26, 17.6, 4.4, SERIF, 900, C.ink);
      p.text('____ 年 ____ 月 ____ 日', PW - 8, 17, 2.6, SANS, 400, C.soft, 'right');
      c.save(); c.setLineDash([p.L(0.5), p.L(1.1)]); c.strokeStyle = 'rgba(120,100,80,.5)'; c.lineWidth = p.L(0.25);
      for (var y = 30; y <= H - 14; y += 8) { c.beginPath(); c.moveTo(p.P(8), p.PY(y)); c.lineTo(p.P(PW - 8), p.PY(y)); c.stroke(); }
      c.restore(); leaves(p, 'mm' + pg.i, [[PW - 14, H - 16, 4]]);
    } else {
      p.text('Tickets', 8, 18, 6, HAND, 700, C.olive); p.text('貼票根的地方', 30, 17.6, 4.4, SERIF, 900, C.ink);
      p.text('門票、車票、明信片、收據…', 8.5, 24, 2.6, SANS, 400, C.soft);
      c.save(); c.setLineDash([p.L(1), p.L(1)]); c.strokeStyle = 'rgba(120,100,80,.6)'; c.lineWidth = p.L(0.3);
      var hw = (PW - 20) / 2, bh = (H - 44) / 3;
      [[8, 30, hw, bh], [12 + hw, 30, hw, bh * 1.4], [8, 34 + bh, hw, bh * 1.4], [12 + hw, 34 + bh * 1.4, hw, bh], [8, 38 + bh * 2.4, PW - 16, H - 12 - (38 + bh * 2.4)]].forEach(function (q) { c.strokeRect(p.P(q[0]), p.PY(q[1]), p.L(q[2]), p.L(q[3])); });
      c.restore();
      tape(p, 14, 30, 10, -0.4, C.tape); tape(p, PW - 14, 30, 10, 0.4, C.tape2);
    }
    folio(p, pg.n);
  }

  // 封底
  function drawEnd(p, bk, o, imgs) {
    var H = bk.H, PW = bk.PW, c = p.c, A = window.JournalAPI;
    p.bg('#E4DFEC');
    c.save(); c.globalAlpha = 0.16; p.font(5, LAT, 700); c.fillStyle = '#6A5E7C'; c.textAlign = 'left';
    for (var y = 6, k = 0; y < H + 6; y += 7, k++) c.fillText("Let's travel again!  Let's travel again!  Let's travel again!  Let's travel again!", p.P(-10 - (k % 2) * 14), p.PY(y));
    c.restore();
    p.rect(p.rx0, H * 0.42, p.rx1 - p.rx0, H * 0.1, 'rgba(255,255,255,.55)');
    p.text('MAGAZINE STYLE', PW / 2, H * 0.42 + H * 0.045, 6.5, LAT, 700, 'rgba(255,255,255,.95)', 'center', 0.5);
    p.text('TRAVEL BOOK', PW / 2, H * 0.42 + H * 0.088, 6.5, LAT, 700, 'rgba(255,255,255,.95)', 'center', 0.5);
    p.text('旅程結束，', 8, 20, 4.4, SERIF, 900, C.ink); p.text('回憶才正要開始。', 8, 26, 4.4, SERIF, 900, C.ink);
    p.lines(clamp(wrap(o.authors.join('、') + ' 共同記錄的北京之旅。下次，也一起出發吧！', 2.5, SANS, 400, 50), 3), 8, 33, 2.5, 3.8, SANS, 400, C.ink);
    var gw = 15, gh = 19, gx = PW - 6 - 2 * gw - 2.5;
    imgs.slice(0, 4).forEach(function (im, i) { var x = gx + (i % 2) * (gw + 2.5), y = 6 + Math.floor(i / 2) * (gh + 2.5); p.shadow(true, 0.8, 0.3); p.rect(x - 0.8, y - 0.8, gw + 1.6, gh + 1.6, '#FFFFFF'); p.shadow(false); p.img(im, x, y, gw, gh); });
    masthead(p, 8, H - 22, 10, C.olive);
    p.text(A.tripRange() + '　' + o.title, 8, H - 15, 2.4, SANS, 400, C.ink);
    p.text('Made with 相約北京', PW - 8, H - 8, 2.2, LAT, 700, C.soft, 'right');
  }

  /* ---------- 輸出一頁 ---------- */
  function pageRecs(pg) {
    if (pg.t === 'cover' || pg.t === 'inside') return pg.photo ? [pg.photo] : [];
    if (pg.t === 'toc' || pg.t === 'end' || pg.t === 'food' || pg.t === 'wall') return pg.photos;
    var rs = [];
    if (pg.lay) rs = pg.lay.items.filter(function (e) { return e.k === 'photo'; }).map(function (e) { return e.it.r; });
    if (pg.t === 'lside') rs = rs.concat(pg.photos);
    if (pg.hero) rs.push(pg.hero);
    return rs;
  }
  function render(bk, sheet, o, pm, hi) {
    var size = bk.size, pg = sheet.pages[0];
    var p = Pen({ mmW: size.w, mmH: size.h, dw: bk.PW, dh: bk.H }, pm);
    p.W = bk.PW; p.region(0, -p.b, bk.PW + p.b); p.rightPage = pg.n % 2 === 1;
    var recs = pageRecs(pg);
    return Promise.all(recs.map(function (r) { return loadImg(r, hi); })).then(function (imgs) {
      var map = {}; recs.forEach(function (r, i) { map[r.id] = imgs[i]; });
      if (pg.hero) map.hero = map[pg.hero.id];
      if (pg.t === 'cover') drawCover(p, bk, o, imgs[0], bk.PW);
      else if (pg.t === 'inside') drawInside(p, bk, o, imgs[0]);
      else if (pg.t === 'toc') drawToc(p, bk, o, imgs, pg);
      else if (pg.t === 'day') drawDay(p, bk, pg, map);
      else if (pg.t === 'wall') drawWall(p, bk, pg, map);
      else if (pg.t === 'lopen') drawLOpen(p, bk, pg, map);
      else if (pg.t === 'lside') drawLSide(p, bk, pg, map);
      else if (pg.t === 'ltext') drawLText(p, bk, pg, map);
      else if (pg.t === 'food') drawFood(p, bk, pg, map);
      else if (pg.t === 'memo') drawMemo(p, bk, pg);
      else if (pg.t === 'end') drawEnd(p, bk, o, imgs);
      imgs.forEach(function (im) { if (im && im.close) im.close(); });
      return p.cv;
    });
  }

  /* ---------- 字型（Google Fonts；沒網路時改用系統字型） ---------- */
  var fontsReady = null;
  function ensureFonts(text) {
    if (!fontsReady) {
      fontsReady = new Promise(function (res) {
        if (!document.fonts || !document.fonts.load) return res();
        var l = document.createElement('link'); l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Josefin+Sans:wght@400;700&family=Noto+Serif+TC:wght@700;900&family=Pacifico&display=swap';
        l.onload = res; l.onerror = res; document.head.appendChild(l);
        setTimeout(res, 5000);
      });
    }
    return fontsReady.then(function () {
      if (!document.fonts || !document.fonts.load) return;
      var sample = String(text || '').slice(0, 4000);
      var loads = ['20px "Pacifico"', '700 20px "Caveat"', '700 20px "Josefin Sans"', '400 20px "Josefin Sans"'].map(function (f) { return document.fonts.load(f, 'note Memo 0123'); });
      loads.push(document.fonts.load('900 20px "Noto Serif TC"', sample + '北京一起寫下我們的旅行總有一天會變成秋號家族卷頭特集目錄旅途美食筆記貼票根的地方程結束回憶才正要開始'));
      loads.push(document.fonts.load('700 20px "Noto Serif TC"', sample));
      return Promise.race([Promise.all(loads).catch(function () {}), new Promise(function (r) { setTimeout(r, 6000); })]);
    });
  }

  /* ---------- 操作介面：設定 → 預覽 → 匯出 PDF / JPG ---------- */
  var LS_SUB = 'bjj-book-sub', LS_SIZE = 'bjj-book-size2';
  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = function () { test() ? res() : rej(new Error('load')); }; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s); });
  }
  var JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  // 自己的紀錄平常不署名；做書前若還沒填過名字，先問一次
  function askName() {
    var A = window.JournalAPI;
    var sh = A.openSheet('你的名字', '<div class="jr-label" style="margin-top:4px">你的名字 <span class="jr-req">必填</span></div><input class="jr-input" data-k="me" maxlength="12" placeholder="必填">' +
      '<div class="jr-hint">會標示在你拍的照片和寫的見聞上（旅遊書裡的「誰拍／誰說」）</div><div class="jr-actions"><button class="jr-btn gold" data-k="ok" type="button">下一步</button></div>');
    var inp = sh.querySelector('[data-k="me"]');
    inp.addEventListener('input', function () { inp.classList.remove('jr-invalid'); });
    sh.querySelector('[data-k="ok"]').onclick = function () {
      var v = inp.value.trim(); if (!v) { inp.classList.add('jr-invalid'); inp.focus(); A.toast('請填寫必填欄位'); return; }
      A.lsSet('bjj-author', v); sh.close(); setTimeout(openSetup, 220);
    };
  }
  function openSetup() {
    var A = window.JournalAPI, all = A.items();
    if (!all.length) { A.toast('還沒有任何紀錄，先拍照或寫見聞吧'); return; }
    var esc = A.esc, hasMine = all.some(function (r) { return r.mine; });
    if (hasMine && !A.lsGet('bjj-author', '')) { askName(); return; }
    var names = A.authorsAll();
    var st = { size: SIZES[A.lsGet(LS_SIZE, 'a6')] ? A.lsGet(LS_SIZE, 'a6') : 'a6', pad: true, cover: null, authors: names.slice() };
    var html =
      '<div class="jr-label" style="margin-top:4px">書名</div><input class="jr-input" data-k="title" maxlength="24" value="' + esc(A.lsGet('bjj-book-title', '相約北京・六日遊記')) + '">' +
      '<div class="jr-label">副標題</div><input class="jr-input" data-k="sub" maxlength="30" value="' + esc(A.lsGet(LS_SUB, '漫步古都的秋日旅行')) + '">' +
      '<div class="jr-label">收錄誰的紀錄</div><div class="jr-chips" data-k="who"></div>' +
      '<div class="jr-label">封面照片</div><div class="jr-strip" data-k="cover"></div>' +
      '<div class="jr-label">印刷尺寸</div><div class="jr-chips" data-k="size"></div><div class="jr-hint" data-k="sizehint"></div>' +
      '<div class="jr-label">頁數</div><div class="jr-chips"><button class="jr-chip on" data-k="pad" type="button">補齊為 8 的倍數</button></div>' +
      '<div class="jr-hint">不夠的頁數會補上「旅途筆記」和「貼票根」頁，印好後可以親手寫、貼。</div>' +
      '<div class="jr-actions"><button class="jr-btn gold" data-k="go" type="button">✨ 生成旅遊書</button></div>';
    var sheet = A.openSheet('製作旅遊書', html);
    var K = function (k) { return sheet.querySelector('[data-k="' + k + '"]'); };
    function drawWho() {
      K('who').innerHTML = names.map(function (n, i) { var its = all.filter(function (r) { return A.who(r) === n; }), p = its.filter(A.isPhoto).length; return '<button class="jr-chip' + (st.authors.indexOf(n) >= 0 ? ' on' : '') + '" data-n="' + esc(n) + '" type="button" style="--day-color:' + INK[i % INK.length] + '">' + esc(n) + '<small>📷' + p + ' ✍️' + (its.length - p) + '</small></button>'; }).join('');
      Array.prototype.forEach.call(K('who').children, function (b) { b.onclick = function () { var n = b.dataset.n, i = st.authors.indexOf(n); if (i >= 0) st.authors.splice(i, 1); else st.authors.push(n); drawWho(); drawCoverPick(); }; });
    }
    function drawCoverPick() {
      var ps = all.filter(function (r) { return A.isPhoto(r) && st.authors.indexOf(A.who(r)) >= 0; }).sort(A.byTime).slice(0, 60);
      if (!ps.some(function (r) { return r.id === st.cover; })) { var pp = ps.filter(function (r) { return A.peopleKind && A.peopleKind(r) === 'p'; }); st.cover = (pp[0] || ps[0] || {}).id || null; }
      K('cover').innerHTML = ps.length ? ps.map(function (r) { return '<button class="jr-thumb' + (r.id === st.cover ? ' sel' : '') + '" data-id="' + r.id + '" type="button"><img src="' + A.thumbURL(r) + '" alt=""><span class="jr-check" style="display:' + (r.id === st.cover ? 'flex' : 'none') + '">✓</span></button>'; }).join('') : '<div class="jr-hint">沒有照片，封面會用插畫</div>';
      Array.prototype.forEach.call(K('cover').querySelectorAll('.jr-thumb'), function (b) { b.onclick = function () { st.cover = b.dataset.id; drawCoverPick(); }; });
    }
    function drawSize() {
      K('size').innerHTML = Object.keys(SIZES).map(function (k) { return '<button class="jr-chip' + (st.size === k ? ' on' : '') + '" data-s="' + k + '" type="button">' + SIZES[k].label + '</button>'; }).join('');
      Array.prototype.forEach.call(K('size').children, function (b) { b.onclick = function () { st.size = b.dataset.s; drawSize(); }; });
      K('sizehint').textContent = SIZES[st.size].land ? '橫式：每一頁放左右兩個雜誌頁，翻開就像一本攤開的雜誌。' : SIZES[st.size].tt ? '直式寫真本：每頁一個雜誌頁，至少 40 頁。' : '文庫本：口袋大小，一般印刷廠都能印。';
    }
    K('pad').onclick = function () { st.pad = !st.pad; K('pad').classList.toggle('on', st.pad); };
    drawWho(); drawCoverPick(); drawSize();
    K('go').onclick = function () {
      if (!st.authors.length) { A.toast('至少選一位記錄者'); return; }
      var o = { title: K('title').value.trim() || '相約北京', sub: K('sub').value.trim(), authors: names.filter(function (n) { return st.authors.indexOf(n) >= 0; }), allNames: names, coverId: st.cover, size: st.size, pad: st.pad };
      A.lsSet('bjj-book-title', o.title); A.lsSet(LS_SUB, o.sub); A.lsSet(LS_SIZE, o.size);
      sheet.close(); setTimeout(function () { openViewer(o); }, 220);
    };
  }

  function openViewer(o) {
    var A = window.JournalAPI, size = SIZES[o.size], alive = true, bk = null;
    colorOf = {}; o.allNames.forEach(function (n, i) { colorOf[n] = INK[i % INK.length]; });
    var bx = BLEED / (size.w + 2 * BLEED) * 100, by = BLEED / (size.h + 2 * BLEED) * 100;
    var v = document.createElement('div'); v.className = 'jr-book' + (size.land ? ' land' : ' port');
    v.innerHTML = '<div class="jr-book-bar"><button class="jr-x" data-b="x" type="button" aria-label="關閉">✕</button><b>' + A.esc(o.title) + '</b><label class="bkv-guide"><input type="checkbox" data-b="guide"> 裁切線</label></div>' +
      '<div class="bkv-info"><div data-b="sum"><b>' + A.esc(size.label) + '</b></div><div class="bkv-warn" data-b="warn" style="display:none"></div><div class="bkv-prog" data-b="prog">準備字型與照片…</div></div>' +
      '<div class="bkv-grid" data-b="grid"></div>' +
      '<div class="bkv-actions"><button class="jr-btn gold" data-b="pdf" type="button" disabled>⬇ 印刷用 PDF</button><button class="jr-btn" data-b="zip" type="button" disabled>🗂 每頁 JPG</button></div>';
    document.body.appendChild(v); document.body.classList.add('jr-lock');
    requestAnimationFrame(function () { v.classList.add('show'); });
    var Q = function (k) { return v.querySelector('[data-b="' + k + '"]'); }, urls = [];
    Q('x').onclick = function () { alive = false; v.classList.remove('show'); setTimeout(function () { urls.forEach(URL.revokeObjectURL); v.remove(); A.unlock(); }, 200); };
    Q('guide').onchange = function () { v.classList.toggle('guides', Q('guide').checked); };
    var allText = o.title + o.sub + o.authors.join('') + A.items().map(function (r) { return (r.text || '') + (r.note || '') + (r.place || ''); }).join('') + DAYS.map(function (d) { return d.short + d.label; }).join('');
    var sel = A.items().filter(function (r) { return A.isPhoto(r) && o.authors.indexOf(A.who(r)) >= 0; });
    var detect = A.detectPeople ? A.detectPeople(sel, function (i, n) { if (alive) Q('prog').textContent = '辨識合照與人物照片… ' + i + ' / ' + n; }).catch(function () { if (alive) Q('prog').textContent = '無法辨識人物（可能沒有網路），照片會以一般大小排版'; }) : Promise.resolve();
    detect.then(function () { return ensureFonts(allText); }).then(function () { return build(o); }).then(function (b) {
      bk = b; if (!alive) return;
      Q('sum').innerHTML = '<b>' + A.esc(size.label) + '</b>・封面＋內頁 ' + bk.interior + ' 頁・300 dpi・四邊含 3 mm 出血';
      if (size.tt && bk.interior > 80) { Q('warn').style.display = ''; Q('warn').textContent = '內頁超過 80 頁，寫真本最多 80 頁；可以少收錄一些照片，或分成兩本。'; }
      // 預覽：封面單獨一張，其後依實體頁攤開（直式兩頁一組）
      var grid = Q('grid'), i = 0, row = null;
      (function next() {
        if (!alive) return;
        if (i >= bk.sheets.length) { Q('prog').textContent = '預覽完成。下載 PDF 時會以 300 dpi 原圖重新輸出。'; Q('pdf').disabled = false; Q('zip').disabled = false; return; }
        var sh = bk.sheets[i];
        Q('prog').textContent = '排版中… ' + (i + 1) + ' / ' + bk.sheets.length;
        render(bk, sh, o, size.land ? 2.6 : 3.6, false).then(function (cv) {
          cv.toBlob(function (bl) {
            var u = URL.createObjectURL(bl); urls.push(u);
            var cell = document.createElement('figure'); cell.className = 'bkv-page';
            cell.innerHTML = '<div class="bkv-sheet"><img src="' + u + '" alt=""><i style="left:' + bx + '%;right:' + bx + '%;top:' + by + '%;bottom:' + by + '%"></i></div><figcaption>' + (sh.n === 0 ? '封面' : 'P.' + sh.n) + '</figcaption>';
            if (size.land || sh.n === 0) { var solo = document.createElement('div'); solo.className = 'bkv-spread' + (sh.n === 0 ? ' cover' : ''); solo.appendChild(cell); grid.appendChild(solo); }
            else {
              if (sh.n % 2 === 0 || !row) { row = document.createElement('div'); row.className = 'bkv-spread pair'; grid.appendChild(row); if (sh.n === 1) { var blank = document.createElement('figure'); blank.className = 'bkv-page blank'; row.appendChild(blank); } }
              row.appendChild(cell); if (sh.n % 2 === 1) row = null;
            }
            i++; setTimeout(next, 0);
          }, 'image/jpeg', 0.85);
        });
      })();
    }).catch(function () { if (alive) Q('prog').textContent = '排版失敗，請再試一次'; });

    function hiRes(onPage) {   // 逐頁以 300 dpi 原圖輸出
      var pm = 300 / 25.4, k = 0;
      return new Promise(function (res, rej) {
        (function step() {
          if (!alive) return rej(new Error('closed'));
          if (k >= bk.sheets.length) return res();
          render(bk, bk.sheets[k], o, pm, true).then(function (cv) {
            cv.toBlob(function (b) {
              cv.width = cv.height = 0;
              b.arrayBuffer().then(function (ab) { onPage(k, new Uint8Array(ab)); k++; setTimeout(step, 0); });
            }, 'image/jpeg', 0.92);
          }).catch(rej);
        })();
      });
    }
    function twoStep(btn, label, make) {
      var ready = null;
      btn.onclick = function () {
        if (ready) { A.saveFiles([ready], '已開始下載'); return; }
        btn.disabled = true;
        make(function (pct) { btn.textContent = '輸出中 ' + pct + '%'; }).then(function (file) {
          ready = file; btn.disabled = false; btn.textContent = '✅ 儲存' + label + '（' + A.mb(file.size) + '）';
          A.toast(label + '做好了，再按一次儲存');
        }).catch(function (e) { btn.disabled = false; btn.textContent = '⬇ ' + label; if (alive) A.toast(e && e.message === 'load' ? '需要網路才能產生檔案，請連上網路再試' : '輸出失敗：照片太多時可分兩本，或用電腦操作'); });
      };
    }
    var stamp = function () { var d = new Date(); return (d.getMonth() + 1) + '' + d.getDate(); };
    twoStep(Q('pdf'), '印刷用 PDF', function (prog) {
      return loadScript(JSPDF, function () { return window.jspdf && window.jspdf.jsPDF; }).then(function () {
        var Wm = size.w + 2 * BLEED, Hm = size.h + 2 * BLEED, ori = Wm > Hm ? 'landscape' : 'portrait';
        var doc = new window.jspdf.jsPDF({ orientation: ori, unit: 'mm', format: [Wm, Hm], compress: true });
        doc.setProperties({ title: o.title, author: o.authors.join('、'), creator: '相約北京 旅遊書' });
        return hiRes(function (k, bytes) {
          if (k > 0) doc.addPage([Wm, Hm], ori);
          doc.addImage(bytes, 'JPEG', 0, 0, Wm, Hm, undefined, 'NONE');
          prog(Math.round((k + 1) / bk.sheets.length * 100));
        }).then(function () { return new File([doc.output('blob')], A.safe(o.title) + '_' + A.safe(size.label.split(' ')[0]) + '_印刷用_' + stamp() + '.pdf', { type: 'application/pdf' }); });
      });
    });
    twoStep(Q('zip'), '每頁 JPG', function (prog) {
      return loadScript(JSZIP, function () { return !!window.JSZip; }).then(function () {
        var zip = new window.JSZip();
        return hiRes(function (k, bytes) {
          zip.file((k < 10 ? '00' : k < 100 ? '0' : '') + k + (k === 0 ? '_封面' : '') + '.jpg', bytes);
          prog(Math.round((k + 1) / bk.sheets.length * 95));
        }).then(function () { return zip.generateAsync({ type: 'blob', compression: 'STORE' }); })
          .then(function (b) { return new File([b], A.safe(o.title) + '_每頁圖片_' + stamp() + '.zip', { type: 'application/zip' }); });
      });
    });
  }

  window.BookMaker = { open: openSetup, _build: build, _render: render, _setColors: function (m) { colorOf = m; }, SIZES: SIZES };
})();
