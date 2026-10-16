// 相約北京：旅遊書排版引擎
// 把大家的照片與見聞，自動排成可送印的寫真本 PDF（含 3mm 出血、300dpi）
// 所有插畫（祥雲、宮門、長城、寶塔、燈籠、印章、回紋）都是程式即時繪製的向量圖，沒有版權問題
(function () {
  'use strict';
  var SERIF = '"Songti TC","STSong","Noto Serif TC","Noto Serif CJK TC","Source Han Serif TC","PMingLiU",serif';
  var SANS = '"PingFang TC","Heiti TC","Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei",sans-serif';
  var TW = 192, TH = 144, M = 11, BLEED = 3;     // 設計單位 = 寫真本的毫米；大本等比放大
  var C = { red: '#9E2A2B', redD: '#5E1617', gold: '#C9962E', goldL: '#E8CF8A', paper: '#FBF4E6', paper2: '#F1E4C8', ink: '#2B221C', soft: '#7A6A58', line: '#E3D2AC' };
  var INK = ['#9E2A2B', '#2B5F75', '#4C7A5A', '#6B4A7A', '#8B5E34', '#B07A1E', '#3D6B8C', '#A04870'];
  var CN = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖', '拾'];
  var SIZES = { s: { label: '寫真本 19.2×14.4 cm', w: 192, h: 144 }, l: { label: '精裝寫真本 26×19.5 cm', w: 260, h: 195 } };
  var KIN = '，。、；：？！）」』〉》…—,.!?;:)～', OPEN = '（「『《〈(';

  /* ---------- 文字換行（以設計單位量測） ---------- */
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
          // 開括號不留在行尾；標題遇到「・」或空格就在那裡斷行，比較好讀
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

  /* ---------- 畫筆：設計單位 → 像素 ---------- */
  function Pen(size, pm) {
    var s = size.w / TW, cv = document.createElement('canvas');
    cv.width = Math.round((size.w + BLEED * 2) * pm); cv.height = Math.round((size.h + BLEED * 2) * pm);
    var c = cv.getContext('2d');
    var P = function (u) { return (BLEED + u * s) * pm; }, L = function (u) { return u * s * pm; };
    var b = BLEED / s;  // 出血換算成設計單位
    var pen = { cv: cv, c: c, P: P, L: L, b: b };
    pen.font = function (size, fam, wt) { c.font = fontStr(size, fam, wt, s * pm); };
    pen.fill = function (col) { c.fillStyle = col; c.fillRect(0, 0, cv.width, cv.height); };
    pen.rect = function (x, y, w, h, col) { c.fillStyle = col; c.fillRect(P(x), P(y), L(w), L(h)); };
    pen.rr = function (x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(P(x), P(y), L(w), L(h), L(r)); else { var X = P(x), Y = P(y), W = L(w), H = L(h), R = L(r); c.moveTo(X + R, Y); c.arcTo(X + W, Y, X + W, Y + H, R); c.arcTo(X + W, Y + H, X, Y + H, R); c.arcTo(X, Y + H, X, Y, R); c.arcTo(X, Y, X + W, Y, R); c.closePath(); } };
    pen.text = function (str, x, y, size, fam, wt, col, align, spacing) {
      pen.font(size, fam, wt); c.fillStyle = col; c.textBaseline = 'alphabetic'; c.textAlign = align || 'left';
      if (spacing) { try { c.letterSpacing = L(spacing) + 'px'; } catch (e) {} }
      c.fillText(str, P(x), P(y));
      if (spacing) { try { c.letterSpacing = '0px'; } catch (e) {} }
    };
    pen.lines = function (lines, x, y, size, lh, fam, wt, col, align) { lines.forEach(function (l, i) { pen.text(l, x, y + i * lh, size, fam, wt, col, align); }); return y + lines.length * lh; };
    // 紙張底色 + 細緻紙紋
    pen.paper = function (col) {
      pen.fill(col || C.paper);
      var t = document.createElement('canvas'); t.width = t.height = 96; var tc = t.getContext('2d');
      for (var i = 0; i < 260; i++) { tc.fillStyle = 'rgba(120,90,50,' + (Math.random() * 0.06) + ')'; tc.fillRect(Math.random() * 96, Math.random() * 96, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
      c.fillStyle = c.createPattern(t, 'repeat'); c.fillRect(0, 0, cv.width, cv.height);
    };
    // 照片：圓角裁切，比例差太多時改為完整顯示
    pen.photo = function (img, x, y, w, h, r, shadow) {
      if (!img) { pen.rr(x, y, w, h, r); c.fillStyle = C.paper2; c.fill(); return; }
      var iw = img.width, ih = img.height, ratio = (iw / ih) / (w / h), contain = ratio < 0.62 || ratio > 1.62;
      c.save();
      if (shadow !== false) { c.shadowColor = 'rgba(40,25,10,.22)'; c.shadowBlur = L(1.6); c.shadowOffsetY = L(0.5); }
      pen.rr(x, y, w, h, r); c.fillStyle = contain ? C.paper2 : '#fff'; c.fill();
      c.restore(); c.save(); pen.rr(x, y, w, h, r); c.clip();
      var dw, dh;
      if (contain) { var k = Math.min(L(w) / iw, L(h) / ih); dw = iw * k; dh = ih * k; }
      else { var k2 = Math.max(L(w) / iw, L(h) / ih); dw = iw * k2; dh = ih * k2; }
      c.drawImage(img, P(x) + (L(w) - dw) / 2, P(y) + (L(h) - dh) / 2, dw, dh);
      c.restore();
    };
    pen.circlePhoto = function (img, cx, cy, r) {
      c.save(); c.beginPath(); c.arc(P(cx), P(cy), L(r), 0, Math.PI * 2); c.clip();
      c.fillStyle = C.paper2; c.fill();
      if (img) { var k = Math.max(L(2 * r) / img.width, L(2 * r) / img.height), dw = img.width * k, dh = img.height * k; c.drawImage(img, P(cx) - dw / 2, P(cy) - dh / 2, dw, dh); }
      c.restore();
    };
    return pen;
  }

  /* ---------- 向量插畫 ---------- */
  // 祥雲：三個漩渦圓團 + 尾巴
  function cloud(p, x, y, r, col, alpha, flip) {
    var c = p.c, P = p.P, L = p.L, f = flip ? -1 : 1;
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha;
    var blobs = [[0, 0, r], [1.25 * r * f, -0.35 * r, r * 0.78], [-1.1 * r * f, 0.2 * r, r * 0.62], [2.2 * r * f, 0.25 * r, r * 0.5]];
    c.fillStyle = col;
    c.beginPath(); blobs.forEach(function (b) { c.moveTo(P(x + b[0]) + L(b[2]), P(y + b[1])); c.arc(P(x + b[0]), P(y + b[1]), L(b[2]), 0, Math.PI * 2); });
    c.fill();
    // 底部平整的雲腳
    c.beginPath(); c.moveTo(P(x - 1.7 * r * f), P(y + 0.55 * r));
    c.quadraticCurveTo(P(x + 0.6 * r * f), P(y + 1.05 * r), P(x + 2.75 * r * f), P(y + 0.6 * r));
    c.lineTo(P(x + 2.6 * r * f), P(y + 0.2 * r)); c.lineTo(P(x - 1.6 * r * f), P(y + 0.1 * r)); c.closePath(); c.fill();
    // 漩渦紋
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineCap = 'round';
    blobs.slice(0, 3).forEach(function (b) {
      c.lineWidth = L(b[2] * 0.11); c.beginPath();
      for (var t = 0; t <= Math.PI * 3; t += 0.12) { var rr = b[2] * 0.72 * (1 - t / (Math.PI * 3.4)), xx = P(x + b[0] + rr * Math.cos(t) * f), yy = P(y + b[1] + rr * Math.sin(t)); if (t === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy); }
      c.stroke();
    });
    c.restore();
  }
  // 屋頂（重檐起翹）
  function roof(p, cx, by, w, h, col) {
    var c = p.c, P = p.P;
    c.fillStyle = col; c.beginPath();
    c.moveTo(P(cx - w / 2), P(by - h * 0.32));
    c.quadraticCurveTo(P(cx - w * 0.42), P(by + h * 0.06), P(cx - w * 0.3), P(by));
    c.lineTo(P(cx + w * 0.3), P(by));
    c.quadraticCurveTo(P(cx + w * 0.42), P(by + h * 0.06), P(cx + w / 2), P(by - h * 0.32));
    c.quadraticCurveTo(P(cx + w * 0.4), P(by - h * 0.3), P(cx + w * 0.33), P(by - h * 0.55));
    c.lineTo(P(cx + w * 0.27), P(by - h)); c.lineTo(P(cx - w * 0.27), P(by - h));
    c.lineTo(P(cx - w * 0.33), P(by - h * 0.55));
    c.quadraticCurveTo(P(cx - w * 0.4), P(by - h * 0.3), P(cx - w / 2), P(by - h * 0.32));
    c.fill();
    // 正脊兩端吻獸
    p.rect(cx - w * 0.29, by - h * 1.18, w * 0.03, h * 0.22, col); p.rect(cx + w * 0.26, by - h * 1.18, w * 0.03, h * 0.22, col);
  }
  // 城樓（天安門造型剪影）
  function gate(p, cx, by, w, col, hole) {
    var h = w * 0.46, wallH = h * 0.36;
    p.rect(cx - w / 2, by - wallH, w, wallH, col);
    p.rect(cx - w * 0.52, by - wallH - h * 0.025, w * 1.04, h * 0.025, col);
    var c = p.c, P = p.P, L = p.L;
    if (hole) { c.fillStyle = hole; [-0.3, -0.15, 0, 0.15, 0.3].forEach(function (k, i) { var dw = w * (i === 2 ? 0.07 : 0.055), dh = wallH * (i === 2 ? 0.62 : 0.5); c.beginPath(); c.moveTo(P(cx + w * k - dw / 2), P(by)); c.lineTo(P(cx + w * k - dw / 2), P(by - dh + dw / 2)); c.arc(P(cx + w * k), P(by - dh + dw / 2), L(dw / 2), Math.PI, 0); c.lineTo(P(cx + w * k + dw / 2), P(by)); c.fill(); }); }
    var hallW = w * 0.64, y1 = by - wallH - h * 0.025;
    p.rect(cx - hallW / 2, y1 - h * 0.16, hallW, h * 0.16, col);
    if (hole) for (var i = 0; i < 9; i++) p.rect(cx - hallW / 2 + hallW * (0.06 + i * 0.105), y1 - h * 0.13, hallW * 0.05, h * 0.13, hole);
    roof(p, cx, y1 - h * 0.16, hallW * 1.25, h * 0.15, col);
    p.rect(cx - hallW * 0.4, y1 - h * 0.31 - h * 0.08, hallW * 0.8, h * 0.08, col);
    roof(p, cx, y1 - h * 0.39, hallW * 1.06, h * 0.2, col);
  }
  // 長城：山稜 + 城牆垛口 + 烽火台
  function greatWall(p, x, by, w, col) {
    var c = p.c, P = p.P, h = w * 0.32, pts = [];
    for (var i = 0; i <= 40; i++) { var t = i / 40; pts.push([x + w * t, by - h * (0.35 + 0.35 * Math.sin(t * Math.PI * 1.6 + 0.6) * Math.sin(t * Math.PI))]); }
    c.fillStyle = col; c.beginPath(); c.moveTo(P(x), P(by)); pts.forEach(function (q) { c.lineTo(P(q[0]), P(q[1])); }); c.lineTo(P(x + w), P(by)); c.closePath(); c.fill();
    c.save(); c.globalAlpha = 0.55; c.strokeStyle = col; c.lineWidth = p.L(h * 0.06); c.beginPath();
    pts.forEach(function (q, i) { if (i === 0) c.moveTo(P(q[0]), P(q[1] - h * 0.04)); else c.lineTo(P(q[0]), P(q[1] - h * 0.04)); }); c.stroke(); c.restore();
    for (var j = 1; j < 40; j += 2) p.rect(pts[j][0], pts[j][1] - h * 0.11, w * 0.012, h * 0.05, col);
    [10, 27].forEach(function (k) { var q = pts[k]; p.rect(q[0] - w * 0.025, q[1] - h * 0.3, w * 0.05, h * 0.3, col); roof(p, q[0], q[1] - h * 0.3, w * 0.075, h * 0.09, col); });
  }
  // 寶塔（頤和園佛香閣意象）
  function pagoda(p, cx, by, h, col) {
    var w = h * 0.55, y = by;
    p.rect(cx - w * 0.6, y - h * 0.06, w * 1.2, h * 0.06, col); y -= h * 0.06;
    for (var i = 0; i < 4; i++) {
      var ww = w * (0.62 - i * 0.11), hh = h * 0.13;
      p.rect(cx - ww / 2, y - hh, ww, hh, col);
      roof(p, cx, y - hh, ww * 1.55, h * 0.09, col); y -= hh + h * 0.09;
    }
    p.rect(cx - w * 0.015, y - h * 0.1, w * 0.03, h * 0.1, col);
  }
  // 燈籠
  function lantern(p, cx, cy, r, col) {
    var c = p.c, P = p.P, L = p.L;
    p.rect(cx - 0.05 * r, cy - 1.6 * r, 0.1 * r, 0.5 * r, C.gold);
    p.rect(cx - 0.45 * r, cy - 1.15 * r, 0.9 * r, 0.25 * r, C.gold);
    p.rect(cx - 0.45 * r, cy + 0.9 * r, 0.9 * r, 0.25 * r, C.gold);
    c.fillStyle = col || C.red; c.beginPath(); c.ellipse(P(cx), P(cy), L(r * 1.05), L(r * 0.98), 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,220,150,.45)'; c.lineWidth = L(r * 0.05);
    [-0.6, -0.25, 0.25, 0.6].forEach(function (k) { c.beginPath(); c.ellipse(P(cx), P(cy), L(r * Math.abs(k) * 1.05), L(r * 0.97), 0, 0, Math.PI * 2); c.stroke(); });
    for (var i = -2; i <= 2; i++) p.rect(cx + i * 0.09 * r - 0.02 * r, cy + 1.15 * r, 0.04 * r, 0.75 * r, C.gold);
  }
  // 印章
  function seal(p, x, y, sz, chars, col, rot) {
    var c = p.c, P = p.P, L = p.L;
    c.save(); c.translate(P(x + sz / 2), P(y + sz / 2)); c.rotate(rot || -0.05); c.translate(-P(x + sz / 2), -P(y + sz / 2));
    p.rr(x, y, sz, sz, sz * 0.1); c.fillStyle = col || C.red; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = L(sz * 0.03); p.rr(x + sz * 0.07, y + sz * 0.07, sz * 0.86, sz * 0.86, sz * 0.06); c.stroke();
    var ch = Array.from(chars), n = ch.length <= 2 ? 1 : 2, cell = sz * 0.8 / (ch.length <= 2 ? ch.length : 2);
    ch.forEach(function (t, i) {
      var col2 = n === 1 ? 0 : (i < 2 ? 1 : 0), row = n === 1 ? i : i % 2;   // 直書：右欄先
      var cx = n === 1 ? x + sz / 2 : x + sz * 0.1 + cell * col2 + cell / 2, cy = y + sz * 0.1 + cell * row + cell * 0.82;
      p.text(t, cx, cy, cell * 0.9, SERIF, 900, '#fff', 'center');
    });
    c.restore();
  }
  // 回紋角飾
  function corners(p, col, inset, sz) {
    var c = p.c, P = p.P, L = p.L; inset = inset || 6; sz = sz || 9;
    c.save(); c.strokeStyle = col; c.lineWidth = L(0.45); c.lineCap = 'square';
    [[inset, inset, 1, 1], [TW - inset, inset, -1, 1], [inset, TH - inset, 1, -1], [TW - inset, TH - inset, -1, -1]].forEach(function (q) {
      var x = q[0], y = q[1], dx = q[2], dy = q[3], u = sz / 6;
      c.beginPath(); c.moveTo(P(x + dx * sz), P(y)); c.lineTo(P(x), P(y)); c.lineTo(P(x), P(y + dy * sz));
      c.moveTo(P(x + dx * u), P(y + dy * sz * 0.8)); c.lineTo(P(x + dx * u), P(y + dy * u)); c.lineTo(P(x + dx * sz * 0.8), P(y + dy * u));
      c.lineTo(P(x + dx * sz * 0.8), P(y + dy * u * 3)); c.lineTo(P(x + dx * u * 3), P(y + dy * u * 3)); c.lineTo(P(x + dx * u * 3), P(y + dy * u * 2));
      c.stroke();
    });
    c.restore();
  }
  function footer(p, n, label, dark) {
    var col = dark ? 'rgba(255,240,215,.75)' : C.soft, right = n % 2 === 1;
    p.text(String(n), right ? TW - 18 : 18, TH - 7, 2.8, SERIF, 700, col, right ? 'right' : 'left');
    if (label) p.text(label, right ? TW - 25 : 25, TH - 7, 2.3, SANS, 400, col, right ? 'right' : 'left', 0.3);
  }
  function illus(p, day, x, by, w, col) {
    var t = (day && (day.title + day.short)) || '';
    if (/長城/.test(t)) greatWall(p, x - w / 2, by, w, col);
    else if (/頤和園|圓明園/.test(t)) pagoda(p, x, by, w * 0.75, col);
    else gate(p, x, by, w, col);
  }

  /* ---------- 排版：把紀錄分配到每一頁 ---------- */
  var NLH = 6.1, NSZ = 3.9, ATTR = 5.2, GAP = 4.2;
  function infoOf(day, name) {
    var hit = day.stops.filter(function (s) { return s.name === name; })[0] || day.meals.filter(function (m) { return m.name === name; })[0] || [day.hotel, day.altHotel].filter(function (h) { return h && h.name === name; })[0];
    if (!hit || !hit.desc) return '';
    var t = String(hit.desc).replace(/【[^】]*】/g, '').trim(), out = '';
    t.replace(/([。！？])/g, '$1\u0001').split('\u0001').some(function (sen) { if ((out + sen).length > 92 && out) return true; out += sen; return false; });
    return out.length > 96 ? out.slice(0, 94) + '…' : out;
  }
  function flow(queue, col) {
    var out = [], y = col.y;
    while (queue.length) {
      var q = queue[0], pad = q.r.star ? 3 : 0, w = col.w - pad * 2;
      var lines = q.rest || wrap(q.r.text, NSZ, SERIF, 400, w);
      var need = lines.length * NLH + ATTR + pad * 2 + GAP;
      if (need <= col.y1 - y) { out.push({ r: q.r, x: col.x, y: y, w: col.w, lines: lines, attr: true, pad: pad, cont: !!q.rest }); y += need; queue.shift(); continue; }
      var fit = Math.floor((col.y1 - y - pad * 2 - 2) / NLH);
      if (fit >= 3 || (y === col.y && fit >= 1)) { out.push({ r: q.r, x: col.x, y: y, w: col.w, lines: lines.slice(0, fit), attr: false, pad: pad, cont: !!q.rest }); q.rest = lines.slice(fit); }
      break;
    }
    return out;
  }
  function photoChunks(n) {   // 依剩餘張數挑版型，避免最後一頁孤零零一張小圖
    var out = [];
    while (n > 0) {
      if (n === 1 || n === 2 || n === 3 || n === 4) { out.push(n); break; }
      if (n === 5) { out.push(3, 2); break; }
      if (n === 6) { out.push(3, 3); break; }
      if (n === 7) { out.push(4, 3); break; }
      out.push(4); n -= 4;
    }
    return out;
  }
  var TPL = {
    1: [[11, 20, 170, 96]],
    2: [[11, 20, 83, 92], [98, 20, 83, 92]],
    3: [[11, 20, 104, 94], [119, 20, 62, 38], [119, 74, 62, 38]],
    4: [[11, 20, 83, 37], [98, 20, 83, 37], [11, 72, 83, 37], [98, 72, 83, 37]]
  };

  function build(o) {
    var A = window.JournalAPI;
    var items = A.items().filter(function (r) { return o.authors.indexOf(A.who(r)) >= 0; });
    var pages = [{ t: 'cover' }, { t: 'toc' }];
    DAYS.forEach(function (day) {
      var its = items.filter(function (r) { return r.day === day.id; }).sort(A.byTime);
      if (!its.length) return;
      var dp = { t: 'day', day: day, its: its }; pages.push(dp);
      A.groupsFor(day, its).forEach(function (g) {
        var place = A.placeTitle(g.place), label = day.label + '・' + place;
        var notes = g.items.filter(A.isNote), ps = g.items.filter(A.isPhoto);
        var info = g.place.name ? infoOf(day, g.place.name) : '';
        var kicker = day.label + (g.place.kind === 'stop' ? '・第 ' + g.place.n + ' 站' : g.place.kind === 'meal' ? '・美食' : g.place.kind === 'hotel' ? '・住宿' : '・隨記');
        // 景點首頁：左欄標題＋重點＋見聞，右欄第一張照片
        var colW = 72, titleLines = clamp(wrap(place, 8, SERIF, 700, colW), 2);
        var y = M + 13 + titleLines.length * 9.5 + 3;
        var infoLines = info ? clamp(wrap(info, 3.25, SANS, 400, colW - 8), 6) : [];
        var infoY = y; if (infoLines.length) y += 10 + infoLines.length * 5 + 5;
        var q = notes.map(function (r) { return { r: r }; });
        var placed = flow(q, { x: M, y: y, y1: TH - M - 3, w: colW });
        pages.push({ t: 'place', day: day, kicker: kicker, label: label, titleLines: titleLines, infoLines: infoLines, infoY: infoY, notes: placed, photo: ps[0] || null, deco: !ps.length });
        // 寫不下的見聞：兩欄續頁
        while (q.length) {
          var a = flow(q, { x: M, y: M + 12, y1: TH - M - 3, w: 80 }), b = flow(q, { x: M + 90, y: M + 12, y1: TH - M - 3, w: 80 });
          if (!a.length && !b.length) { q.shift(); continue; }
          pages.push({ t: 'text', day: day, label: label, place: place, notes: a.concat(b) });
        }
        var rest = ps.slice(1), k = 0;
        photoChunks(rest.length).forEach(function (n) { pages.push({ t: 'photos', day: day, label: label, place: place, photos: rest.slice(k, k + n) }); k += n; });
      });
    });
    var end = { t: 'end' };
    var interior = pages.length - 1 + 1;            // 不含封面，含結尾頁
    var target = o.pad ? Math.max(40, Math.ceil(interior / 8) * 8) : interior;
    var fill = Math.max(0, target - interior);
    for (var i = 0; i < fill; i++) pages.push({ t: 'memo', i: i });
    pages.push(end);
    pages.forEach(function (pg, i) { pg.n = i; });   // 封面 = 0，內頁從 1 開始
    var dayStart = {}; pages.forEach(function (pg) { if (pg.t === 'day') dayStart[pg.day.id] = pg.n; });
    var cover = items.filter(function (r) { return r.id === o.coverId; })[0] || items.filter(A.isPhoto)[0] || null;
    return { pages: pages, items: items, dayStart: dayStart, cover: cover, interior: pages.length - 1 };
  }

  /* ---------- 繪製各種頁面 ---------- */
  function loadImg(r, hi) {
    if (!r) return Promise.resolve(null);
    var blob = hi ? r.blob : (r.thumb || r.blob);
    var viaImg = function () { return new Promise(function (res) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 0); }; im.onerror = function () { URL.revokeObjectURL(u); res(null); }; im.src = u; }); };
    if (window.createImageBitmap) return createImageBitmap(blob).catch(viaImg);
    return viaImg();
  }
  function dayDateLabel(day) { var m = String(day.title || '').match(/^([^ ]*?（.）)/); return m ? m[1] : window.JournalAPI.dayDate(day); }

  function drawNotes(p, notes, colorOf) {
    notes.forEach(function (n) {
      var r = n.r, x = n.x, y = n.y, pad = n.pad, h = n.lines.length * NLH + (n.attr ? ATTR : 0) + pad * 2;
      if (r.star) {
        p.rr(x, y, n.w, h, 1.6); p.c.fillStyle = 'rgba(232,207,138,.38)'; p.c.fill();
        p.rect(x, y + 1, 1, h - 2, C.gold);
        if (!n.cont) { p.rr(x + n.w - 13, y - 2.4, 12, 4.8, 2.4); p.c.fillStyle = C.red; p.c.fill(); p.text('★ 重點', x + n.w - 7, y + 1, 2.5, SANS, 700, '#fff', 'center'); }
      } else p.rect(x - 2.6, y + 0.6, 0.6, n.lines.length * NLH - 1, C.goldL);
      p.lines(n.lines, x + pad, y + pad + NSZ * 1.02, NSZ, NLH, SERIF, 400, C.ink);
      if (n.attr) {
        var who = window.JournalAPI.who(r);
        p.text('（' + who + ' 說）', x + n.w - pad, y + pad + n.lines.length * NLH + 3.4, 2.9, SANS, 700, colorOf[who] || C.red, 'right');
      }
    });
  }
  function caption(p, r, x, y, w, colorOf) {
    var A = window.JournalAPI, who = A.who(r), attr = '（' + who + ' 拍）', sz = 3, lh = 4.3;
    var lines = r.note ? clamp(wrap(r.note, sz, SANS, 400, w), 2) : [];
    var last = lines.length ? lines[lines.length - 1] : '', attrX, attrY;
    if (!lines.length) { attrX = x; attrY = y; }
    else if (textW(last, sz, SANS, 400) + textW(attr, 2.7, SANS, 700) + 1 <= w) { attrX = x + textW(last, sz, SANS, 400) + 0.8; attrY = y + (lines.length - 1) * lh; }
    else { if (lines.length === 2) lines = clamp(lines, 1); attrX = x; attrY = y + lines.length * lh; }
    p.lines(lines, x, y, sz, lh, SANS, 400, C.ink);
    p.text(attr, attrX, attrY, 2.7, SANS, 700, colorOf[who] || C.red);
  }
  function header(p, day, title) {
    p.c.fillStyle = day.color; p.c.beginPath(); p.c.arc(p.P(M + 1.6), p.P(M + 3.6), p.L(1.6), 0, Math.PI * 2); p.c.fill();
    p.text(title, M + 5, M + 5.2, 4.2, SERIF, 700, C.ink);
    var w = textW(title, 4.2, SERIF, 700);
    p.rect(M + 8 + w, M + 4, TW - M - (M + 8 + w), 0.35, C.line);
    p.text(day.label, TW - M, M + 2.8, 2.4, SANS, 700, day.color, 'right', 0.3);
  }

  function drawCover(p, bk, o, img) {
    var c = p.c, g = c.createLinearGradient(0, 0, p.cv.width, p.cv.height);
    g.addColorStop(0, '#A8302F'); g.addColorStop(1, C.redD); c.fillStyle = g; c.fillRect(0, 0, p.cv.width, p.cv.height);
    cloud(p, 20, 18, 5, C.goldL, 0.16); cloud(p, 150, 26, 4, C.goldL, 0.14, true); cloud(p, 176, 98, 3.5, C.goldL, 0.12);
    gate(p, 96, TH + p.b, 210, 'rgba(0,0,0,.16)');
    // 月洞門照片框
    c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = p.L(3); c.beginPath(); c.arc(p.P(56), p.P(70), p.L(45), 0, Math.PI * 2); c.fillStyle = C.goldL; c.fill(); c.restore();
    c.beginPath(); c.arc(p.P(56), p.P(70), p.L(43.4), 0, Math.PI * 2); c.fillStyle = C.redD; c.fill();
    p.circlePhoto(img, 56, 70, 42.2);
    if (!img) lantern(p, 56, 66, 14);
    c.strokeStyle = C.goldL; c.lineWidth = p.L(0.35); c.beginPath(); c.arc(p.P(56), p.P(70), p.L(47.5), 0, Math.PI * 2); c.stroke();
    var x = 112;
    p.text('TRAVEL  BOOK', x, 36, 2.9, SANS, 700, C.goldL, 'left', 1.2);
    var tl = clamp(wrap(o.title, 10.5, SERIF, 900, 70), 3), y = p.lines(tl, x, 50, 10.5, 12.5, SERIF, 900, '#FFF3D6');
    p.rect(x, y - 6, 22, 0.9, C.gold);
    y = p.lines(clamp(wrap(o.sub, 3.6, SANS, 400, 70), 2), x, y + 2, 3.6, 5.4, SANS, 400, 'rgba(255,240,215,.9)');
    p.text(window.JournalAPI.tripRange(), x, y + 4, 3.4, SERIF, 700, C.goldL, 'left', 0.6);
    p.lines(clamp(wrap(o.authors.join('・') + '　共同記錄', 3.2, SANS, 400, 70), 2), x, y + 11, 3.2, 4.8, SANS, 400, 'rgba(255,240,215,.8)');
    seal(p, 166, 108, 15, '北京遊記', '#C23B3A');
  }

  function drawToc(p, bk, o, colorOf) {
    var A = window.JournalAPI;
    p.paper(); corners(p, 'rgba(201,150,46,.6)');
    p.text('一起旅行的人', M + 2, 26, 5.4, SERIF, 700, C.ink); p.rect(M + 2, 29, 14, 0.8, C.gold);
    var y = 40;
    o.authors.forEach(function (n) {
      var its = bk.items.filter(function (r) { return A.who(r) === n; }), ph = its.filter(A.isPhoto).length;
      p.c.fillStyle = colorOf[n]; p.c.beginPath(); p.c.arc(p.P(M + 7), p.P(y - 1.3), p.L(4.6), 0, Math.PI * 2); p.c.fill();
      p.text(Array.from(n)[0], M + 7, y + 0.3, 4.4, SERIF, 900, '#fff', 'center');
      p.text(n, M + 15, y - 0.6, 4.2, SERIF, 700, C.ink);
      p.text('照片 ' + ph + ' 張・見聞 ' + (its.length - ph) + ' 則', M + 15, y + 3.8, 2.6, SANS, 400, C.soft);
      y += 13;
    });
    lantern(p, 40, 118, 6); cloud(p, 58, 122, 3.5, C.goldL, 0.5);
    var x = 92; p.text('目錄', x, 26, 5.4, SERIF, 700, C.ink); p.rect(x, 29, 14, 0.8, C.gold);
    y = 42;
    DAYS.forEach(function (d) {
      var n = bk.dayStart[d.id]; if (n == null) return;
      p.rect(x, y - 4.4, 1.4, 6.2, d.color);
      p.text(d.label, x + 4, y, 3.4, SANS, 700, d.color, 'left', 0.2);
      p.text(clamp(wrap(d.short, 3.8, SERIF, 700, 52), 1)[0], x + 21, y, 3.8, SERIF, 700, C.ink);
      p.text(A.dayDate(d), x + 21, y + 4.3, 2.5, SANS, 400, C.soft);
      p.c.save(); p.c.setLineDash([p.L(0.6), p.L(1.1)]); p.c.strokeStyle = C.line; p.c.lineWidth = p.L(0.35); p.c.beginPath(); p.c.moveTo(p.P(x + 21 + Math.min(52, textW(d.short, 3.8, SERIF, 700)) + 2), p.P(y - 0.6)); p.c.lineTo(p.P(TW - M - 7), p.P(y - 0.6)); p.c.stroke(); p.c.restore();
      p.text(String(n), TW - M, y, 3.6, SERIF, 700, C.ink, 'right');
      y += 12;
    });
    footer(p, bk.pages[1].n);
  }

  function drawDay(p, bk, pg, colorOf) {
    var A = window.JournalAPI, d = pg.day, c = p.c;
    p.paper();
    var g = c.createLinearGradient(0, 0, 0, p.cv.height); g.addColorStop(0, d.color); g.addColorStop(1, 'rgba(20,10,5,.9)');
    c.fillStyle = d.color; c.fillRect(0, 0, p.P(80), p.cv.height);
    c.save(); c.globalAlpha = 0.35; c.fillStyle = g; c.fillRect(0, 0, p.P(80), p.cv.height); c.restore();
    cloud(p, 58, 14, 4.5, '#fff', 0.12, true); cloud(p, 66, 86, 3, '#fff', 0.1);
    illus(p, d, 40, TH + p.b, 74, 'rgba(255,255,255,.16)');
    p.text('DAY  ' + (d.id < 10 ? '0' : '') + d.id, M + 3, 28, 3.2, SANS, 700, C.goldL, 'left', 1);
    p.text('第' + (CN[d.id] || d.id) + '天', M + 2, 50, 15, SERIF, 900, '#fff');
    p.text(dayDateLabel(d), M + 3, 59, 3.8, SANS, 400, 'rgba(255,255,255,.85)');
    p.lines(clamp(wrap(d.short, 6, SERIF, 700, 60), 2), M + 3, 72, 6, 8, SERIF, 700, '#fff');
    var x = 92;
    p.text('今日行程', x, M + 9, 5, SERIF, 700, C.ink); p.rect(x, M + 12, 12, 0.8, C.gold);
    var rows = []; d.stops.forEach(function (s, i) { rows.push({ k: 'stop', n: i + 1, name: s.name, sub: s.stay || '' }); });
    d.meals.forEach(function (m) { rows.push({ k: 'meal', name: m.type + '｜' + m.name }); });
    var top = M + 22, bottom = 110, rh = Math.min(10, (bottom - top) / Math.max(1, rows.length));
    var stopsN = d.stops.length;
    if (stopsN > 1) p.rect(x + 3.1, top - 1.5, 0.5, (stopsN - 1) * rh, d.color + '66');
    rows.forEach(function (r, i) {
      var y = top + i * rh;
      if (r.k === 'stop') {
        c.fillStyle = d.color; c.beginPath(); c.arc(p.P(x + 3.35), p.P(y - 1.5), p.L(2.6), 0, Math.PI * 2); c.fill();
        p.text(String(r.n), x + 3.35, y - 0.4, 2.8, SANS, 700, '#fff', 'center');
        var has = pg.its.filter(function (it) { return it.place === r.name; }).length;
        p.text(clamp(wrap(r.name, 3.7, SERIF, 700, 64), 1)[0], x + 8, y, 3.7, SERIF, 700, C.ink);
        if (r.sub) p.text(r.sub, TW - M, y, 2.5, SANS, 400, C.soft, 'right');
        if (has) p.text('★', x + 9 + Math.min(64, textW(r.name, 3.7, SERIF, 700)), y - 0.2, 2.8, SANS, 700, C.gold);
      } else {
        c.fillStyle = C.gold; c.beginPath(); c.arc(p.P(x + 3.35), p.P(y - 1.3), p.L(1.1), 0, Math.PI * 2); c.fill();
        p.text(clamp(wrap(r.name, 3.2, SANS, 400, 80), 1)[0], x + 8, y, 3.2, SANS, 400, C.soft);
      }
    });
    var hotels = [d.hotel, d.altHotel].filter(function (h) { return h && !h.skipBounds; });
    if (hotels.length) { p.rr(x, 114, TW - M - x, 8.5, 1.5); c.fillStyle = C.paper2; c.fill(); p.text('住宿｜' + clamp(wrap(hotels.map(function (h) { return h.name; }).join(' / '), 3.1, SANS, 400, 74), 1)[0], x + 3, 119.6, 3.1, SANS, 400, C.ink); }
    var ph = pg.its.filter(A.isPhoto).length, who = {}; pg.its.forEach(function (r) { who[A.who(r)] = 1; });
    p.text('照片 ' + ph + ' 張・見聞 ' + (pg.its.length - ph) + ' 則｜' + Object.keys(who).join('、'), TW - M, 129, 2.5, SANS, 400, C.soft, 'right');
    footer(p, pg.n, '', pg.n % 2 === 0);
  }

  function drawPlace(p, bk, pg, img, colorOf) {
    var d = pg.day, c = p.c;
    p.paper(); corners(p, 'rgba(201,150,46,.45)', 5, 7);
    p.text(pg.kicker, M, M + 4, 2.7, SANS, 700, d.color, 'left', 0.4);
    var y = p.lines(pg.titleLines, M, M + 13, 8, 9.5, SERIF, 700, C.ink);
    p.rect(M, y - 6.3, 14, 0.8, C.gold);
    if (pg.infoLines.length) {
      var h = 10 + pg.infoLines.length * 5;
      p.rr(M, pg.infoY, 72, h, 1.8); c.fillStyle = 'rgba(201,150,46,.13)'; c.fill(); c.strokeStyle = 'rgba(201,150,46,.55)'; c.lineWidth = p.L(0.3); c.stroke();
      p.rr(M + 3, pg.infoY - 2.6, 13, 5.2, 1); c.fillStyle = C.red; c.fill();
      p.text('重點', M + 9.5, pg.infoY + 1.1, 2.8, SANS, 700, '#fff', 'center', 0.4);
      p.lines(pg.infoLines, M + 4, pg.infoY + 8.2, 3.25, 5, SANS, 400, '#4A3C30');
    }
    drawNotes(p, pg.notes, colorOf);
    if (pg.photo) { p.photo(img, 90, M, 91, 108, 1.4); caption(p, pg.photo, 90, M + 113, 91, colorOf); }
    else {
      p.rr(90, M, 91, 116, 2); c.fillStyle = 'rgba(241,228,200,.7)'; c.fill();
      illus(p, d, 135.5, M + 116, 80, 'rgba(158,42,43,.13)');
      lantern(p, 112, 34, 6); lantern(p, 160, 30, 4.5, '#B53A33');
      cloud(p, 128, 58, 3.6, C.gold, 0.35);
    }
    footer(p, pg.n, pg.label);
  }

  function drawPhotos(p, bk, pg, imgs, colorOf) {
    p.paper(); header(p, pg.day, pg.place);
    var tpl = TPL[pg.photos.length];
    if (pg.photos.length === 1 && imgs[0]) {   // 單張照片依原始比例置中，直式照片不會被裁切
      var ar = imgs[0].width / imgs[0].height, bw = 170, bh = 96;
      if (ar < bw / bh) bw = bh * ar; else bh = bw / ar;
      tpl = [[(TW - bw) / 2, 20 + (96 - bh) / 2, bw, bh]];
    }
    tpl.forEach(function (b, i) {
      p.photo(imgs[i], b[0], b[1], b[2], b[3], 1.2);
      caption(p, pg.photos[i], b[0], b[1] + b[3] + 4.3, b[2], colorOf);
    });
    footer(p, pg.n, pg.label);
  }

  function drawText(p, bk, pg, colorOf) {
    p.paper(); corners(p, 'rgba(201,150,46,.45)', 5, 7); header(p, pg.day, pg.place + '（續）');
    var right = pg.notes.some(function (n) { return n.x > M + 50; });
    if (right) p.rect(M + 85, M + 14, 0.3, TH - 2 * M - 20, C.line);
    else {
      p.rr(M + 90, M + 12, 80, TH - 2 * M - 18, 2); p.c.fillStyle = 'rgba(241,228,200,.7)'; p.c.fill();
      illus(p, pg.day, M + 130, TH - M - 6, 70, 'rgba(158,42,43,.13)');
      lantern(p, M + 108, 36, 5); cloud(p, M + 140, 48, 3.2, C.gold, 0.35);
    }
    drawNotes(p, pg.notes, colorOf);
    footer(p, pg.n, pg.label);
  }

  function drawMemo(p, bk, pg) {
    var c = p.c; p.paper(); corners(p, 'rgba(201,150,46,.45)', 5, 7);
    if (pg.i % 2 === 0) {
      p.text('旅途筆記', M + 2, 25, 5, SERIF, 700, C.ink); p.rect(M + 2, 28, 12, 0.8, C.gold);
      p.text('______ 年 ____ 月 ____ 日', TW - M - 2, 25, 3, SANS, 400, C.soft, 'right');
      c.save(); c.setLineDash([p.L(0.5), p.L(1.2)]); c.strokeStyle = 'rgba(160,130,90,.45)'; c.lineWidth = p.L(0.3);
      for (var y = 40; y <= 124; y += 9) { c.beginPath(); c.moveTo(p.P(M + 2), p.P(y)); c.lineTo(p.P(TW - M - 2), p.P(y)); c.stroke(); }
      c.restore(); cloud(p, 168, 118, 3, C.gold, 0.25);
    } else {
      p.text('貼票根的地方', M + 2, 25, 5, SERIF, 700, C.ink); p.rect(M + 2, 28, 12, 0.8, C.gold);
      p.text('門票、車票、明信片、收據…', M + 2, 33.5, 2.8, SANS, 400, C.soft);
      c.save(); c.setLineDash([p.L(1.2), p.L(1.2)]); c.strokeStyle = 'rgba(160,130,90,.5)'; c.lineWidth = p.L(0.35);
      [[M + 2, 40, 80, 40], [M + 88, 40, 82, 40], [M + 2, 86, 120, 38], [M + 128, 86, 42, 38]].forEach(function (b) { p.rr(b[0], b[1], b[2], b[3], 2); c.stroke(); });
      c.restore(); lantern(p, M + 149, 105, 5);
    }
    footer(p, pg.n);
  }

  function drawEnd(p, bk, o) {
    var c = p.c, g = c.createLinearGradient(0, 0, 0, p.cv.height);
    g.addColorStop(0, '#7E2223'); g.addColorStop(1, '#3F0E0F'); c.fillStyle = g; c.fillRect(0, 0, p.cv.width, p.cv.height);
    cloud(p, 26, 30, 5, C.goldL, 0.14); cloud(p, 160, 22, 4, C.goldL, 0.12, true);
    gate(p, 96, TH + p.b, 150, 'rgba(232,207,138,.14)');
    p.text('旅程結束', TW / 2, 54, 9, SERIF, 900, '#FFF3D6', 'center', 2);
    p.text('回憶才正要開始', TW / 2, 66, 5, SERIF, 700, C.goldL, 'center', 1.2);
    p.rect(TW / 2 - 10, 72, 20, 0.7, C.gold);
    p.text(o.authors.join('・') + '　共同記錄', TW / 2, 81, 3.3, SANS, 400, 'rgba(255,240,215,.85)', 'center');
    p.text(window.JournalAPI.tripRange(), TW / 2, 87, 3, SERIF, 700, C.goldL, 'center', 0.6);
    seal(p, TW / 2 - 6, 93, 12, '相約', '#C23B3A');
  }

  function render(bk, pg, o, size, pm, hi, colorOf) {
    var p = Pen(size, pm), recs = pg.t === 'cover' ? [bk.cover] : pg.t === 'place' ? [pg.photo] : pg.t === 'photos' ? pg.photos : [];
    return Promise.all(recs.map(function (r) { return loadImg(r, hi); })).then(function (imgs) {
      if (pg.t === 'cover') drawCover(p, bk, o, imgs[0]);
      else if (pg.t === 'toc') drawToc(p, bk, o, colorOf);
      else if (pg.t === 'day') drawDay(p, bk, pg, colorOf);
      else if (pg.t === 'place') drawPlace(p, bk, pg, imgs[0], colorOf);
      else if (pg.t === 'photos') drawPhotos(p, bk, pg, imgs, colorOf);
      else if (pg.t === 'text') drawText(p, bk, pg, colorOf);
      else if (pg.t === 'memo') drawMemo(p, bk, pg);
      else drawEnd(p, bk, o);
      imgs.forEach(function (im) { if (im && im.close) im.close(); });
      return p.cv;
    });
  }

  /* ---------- 操作介面：設定 → 預覽 → 匯出 PDF / JPG ---------- */
  var LS_SUB = 'bjj-book-sub', LS_SIZE = 'bjj-book-size';
  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = function () { test() ? res() : rej(new Error('load')); }; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s); });
  }
  var JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  function openSetup() {
    var A = window.JournalAPI, all = A.items();
    if (!all.length) { A.toast('還沒有任何紀錄，先拍照或寫見聞吧'); return; }
    var names = A.authorsAll(), esc = A.esc;
    var st = { size: A.lsGet(LS_SIZE, 's'), pad: true, cover: null, authors: names.slice() };
    var html =
      '<div class="jr-label" style="margin-top:4px">書名</div><input class="jr-input" data-k="title" maxlength="24" value="' + esc(A.lsGet('bjj-book-title', '相約北京・六日遊記')) + '">' +
      '<div class="jr-label">副標題</div><input class="jr-input" data-k="sub" maxlength="40" value="' + esc(A.lsGet(LS_SUB, '一家人的北京慢旅行')) + '">' +
      '<div class="jr-label">收錄誰的紀錄</div><div class="jr-chips" data-k="who"></div>' +
      '<div class="jr-label">封面照片</div><div class="jr-strip" data-k="cover"></div>' +
      '<div class="jr-label">印刷尺寸</div><div class="jr-chips" data-k="size"></div>' +
      '<div class="jr-label">頁數</div><div class="jr-chips"><button class="jr-chip on" data-k="pad" type="button">補齊為 8 的倍數（寫真本 40–80 頁）</button></div>' +
      '<div class="jr-hint">不夠的頁數會補上「旅途筆記」和「貼票根」頁，印好後可以親手寫、貼。</div>' +
      '<div class="jr-actions"><button class="jr-btn gold" data-k="go" type="button">✨ 生成旅遊書</button></div>';
    var sheet = A.openSheet('製作旅遊書', html);
    var K = function (k) { return sheet.querySelector('[data-k="' + k + '"]'); };
    function drawWho() {
      K('who').innerHTML = names.map(function (n, i) { var its = all.filter(function (r) { return A.who(r) === n; }), p = its.filter(A.isPhoto).length; return '<button class="jr-chip' + (st.authors.indexOf(n) >= 0 ? ' on' : '') + '" data-n="' + esc(n) + '" type="button" style="--day-color:' + INK[i % INK.length] + '">' + esc(n) + '<small>📷' + p + ' ✍️' + (its.length - p) + '</small></button>'; }).join('');
      Array.prototype.forEach.call(K('who').children, function (b) { b.onclick = function () { var n = b.dataset.n, i = st.authors.indexOf(n); if (i >= 0) st.authors.splice(i, 1); else st.authors.push(n); drawWho(); drawCover(); }; });
    }
    function drawCover() {
      var ps = all.filter(function (r) { return A.isPhoto(r) && st.authors.indexOf(A.who(r)) >= 0; }).sort(A.byTime).slice(0, 60);
      if (!ps.some(function (r) { return r.id === st.cover; })) st.cover = ps[0] ? ps[0].id : null;
      K('cover').innerHTML = ps.length ? ps.map(function (r) { return '<button class="jr-thumb' + (r.id === st.cover ? ' sel' : '') + '" data-id="' + r.id + '" type="button"><img src="' + A.thumbURL(r) + '" alt=""><span class="jr-check" style="display:flex">✓</span></button>'; }).join('') : '<div class="jr-hint">沒有照片，封面會用燈籠插畫</div>';
      Array.prototype.forEach.call(K('cover').querySelectorAll('.jr-thumb'), function (b) { b.onclick = function () { st.cover = b.dataset.id; drawCover(); }; });
      Array.prototype.forEach.call(K('cover').querySelectorAll('.jr-thumb:not(.sel) .jr-check'), function (x) { x.style.display = 'none'; });
    }
    function drawSize() {
      K('size').innerHTML = Object.keys(SIZES).map(function (k) { return '<button class="jr-chip' + (st.size === k ? ' on' : '') + '" data-s="' + k + '" type="button">' + SIZES[k].label + '</button>'; }).join('');
      Array.prototype.forEach.call(K('size').children, function (b) { b.onclick = function () { st.size = b.dataset.s; drawSize(); }; });
    }
    K('pad').onclick = function () { st.pad = !st.pad; K('pad').classList.toggle('on', st.pad); };
    drawWho(); drawCover(); drawSize();
    K('go').onclick = function () {
      if (!st.authors.length) { A.toast('至少選一位記錄者'); return; }
      var o = { title: K('title').value.trim() || '相約北京', sub: K('sub').value.trim(), authors: names.filter(function (n) { return st.authors.indexOf(n) >= 0; }), allNames: names, coverId: st.cover, size: st.size, pad: st.pad };
      A.lsSet('bjj-book-title', o.title); A.lsSet(LS_SUB, o.sub); A.lsSet(LS_SIZE, o.size);
      sheet.close(); setTimeout(function () { openViewer(o); }, 220);
    };
  }

  function openViewer(o) {
    var A = window.JournalAPI, size = SIZES[o.size], bk = build(o), alive = true;
    var colorOf = {}; o.allNames.forEach(function (n, i) { colorOf[n] = INK[i % INK.length]; });
    var bx = BLEED / (size.w + 2 * BLEED) * 100, by = BLEED / (size.h + 2 * BLEED) * 100;
    var over = bk.interior > 80;
    var v = document.createElement('div'); v.className = 'jr-book';
    v.innerHTML = '<div class="jr-book-bar"><button class="jr-x" data-b="x" type="button" aria-label="關閉">✕</button><b>' + A.esc(o.title) + '</b><label class="bkv-guide"><input type="checkbox" data-b="guide"> 裁切線</label></div>' +
      '<div class="bkv-info"><div><b>' + A.esc(size.label) + '</b>・封面＋內頁 ' + bk.interior + ' 頁・300 dpi・四邊含 3 mm 出血</div>' +
      (over ? '<div class="bkv-warn">內頁超過 80 頁，寫真本最多 80 頁；可以少收錄一些照片，或分成兩本。</div>' : '') +
      '<div class="bkv-prog" data-b="prog">排版中…</div></div>' +
      '<div class="bkv-grid" data-b="grid"></div>' +
      '<div class="bkv-actions"><button class="jr-btn gold" data-b="pdf" type="button" disabled>⬇ 印刷用 PDF</button><button class="jr-btn" data-b="zip" type="button" disabled>🗂 每頁 JPG</button></div>';
    document.body.appendChild(v); document.body.classList.add('jr-lock');
    requestAnimationFrame(function () { v.classList.add('show'); });
    var Q = function (k) { return v.querySelector('[data-b="' + k + '"]'); }, urls = [];
    Q('x').onclick = function () { alive = false; v.classList.remove('show'); setTimeout(function () { urls.forEach(URL.revokeObjectURL); v.remove(); A.unlock(); }, 200); };
    Q('guide').onchange = function () { v.classList.toggle('guides', Q('guide').checked); };
    var grid = Q('grid'), i = 0;
    (function next() {
      if (!alive) return;
      if (i >= bk.pages.length) { Q('prog').textContent = '預覽完成，共 ' + bk.pages.length + ' 頁。下載 PDF 時會以 300 dpi 原圖重新輸出。'; Q('pdf').disabled = false; Q('zip').disabled = false; return; }
      var pg = bk.pages[i];
      Q('prog').textContent = '排版中… ' + (i + 1) + ' / ' + bk.pages.length;
      render(bk, pg, o, size, 3.2, false, colorOf).then(function (cv) {
        cv.toBlob(function (b) {
          var u = URL.createObjectURL(b); urls.push(u);
          var cell = document.createElement('figure'); cell.className = 'bkv-page' + (pg.n === 0 ? ' cover' : '');
          cell.innerHTML = '<div class="bkv-sheet"><img src="' + u + '" alt=""><i style="left:' + bx + '%;right:' + bx + '%;top:' + by + '%;bottom:' + by + '%"></i></div><figcaption>' + (pg.n === 0 ? '封面' : 'P.' + pg.n) + '</figcaption>';
          grid.appendChild(cell); i++; setTimeout(next, 0);
        }, 'image/jpeg', 0.85);
      });
    })();

    function hiRes(onPage) {   // 逐頁以 300 dpi 原圖輸出
      var pm = 300 / 25.4, k = 0;
      return new Promise(function (res, rej) {
        (function step() {
          if (!alive) return rej(new Error('closed'));
          if (k >= bk.pages.length) return res();
          var pg = bk.pages[k];
          render(bk, pg, o, size, pm, true, colorOf).then(function (cv) {
            cv.toBlob(function (b) {
              cv.width = cv.height = 0;
              b.arrayBuffer().then(function (ab) { onPage(k, pg, new Uint8Array(ab)); k++; setTimeout(step, 0); });
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
        var W = size.w + 2 * BLEED, H = size.h + 2 * BLEED;
        var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: true });
        doc.setProperties({ title: o.title, author: o.authors.join('、'), creator: '相約北京 旅遊書' });
        return hiRes(function (k, pg, bytes) {
          if (k > 0) doc.addPage([W, H], 'landscape');
          doc.addImage(bytes, 'JPEG', 0, 0, W, H, undefined, 'NONE');
          prog(Math.round((k + 1) / bk.pages.length * 100));
        }).then(function () { return new File([doc.output('blob')], A.safe(o.title) + '_印刷用_' + stamp() + '.pdf', { type: 'application/pdf' }); });
      });
    });
    twoStep(Q('zip'), '每頁 JPG', function (prog) {
      return loadScript(JSZIP, function () { return !!window.JSZip; }).then(function () {
        var zip = new window.JSZip();
        return hiRes(function (k, pg, bytes) {
          zip.file((k < 10 ? '00' : k < 100 ? '0' : '') + k + (k === 0 ? '_封面' : '') + '.jpg', bytes);
          prog(Math.round((k + 1) / bk.pages.length * 95));
        }).then(function () { return zip.generateAsync({ type: 'blob', compression: 'STORE' }); })
          .then(function (b) { return new File([b], A.safe(o.title) + '_每頁圖片_' + stamp() + '.zip', { type: 'application/zip' }); });
      });
    });
  }

  window.BookMaker = { open: openSetup, _build: build, _render: render, SIZES: SIZES };
})();
