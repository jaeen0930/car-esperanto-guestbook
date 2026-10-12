/* 게스트북 · 벽
   다녀간 얼굴이 순서대로 쌓입니다. 사람이 적을 땐 크게, 많아지면 촘촘한 모자이크로.
   새 얼굴이 찍히면 가운데에 크게 떴다가 제자리로 들어갑니다. */
(function () {
  'use strict';
  let S = FG.loadSettings();
  const cv = document.getElementById('wall');
  const ctx = cv.getContext('2d');
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');

  let entries = [];
  let tiles = new Map();    // no → 작은 캔버스
  let lay = null;           // 배치
  let dirty = true;
  const queue = [];         // 새로 들어온 얼굴
  let show = null;          // 지금 크게 보여 주는 얼굴
  let twinkle = null;
  let shownList = [];

  const dpr = () => window.devicePixelRatio || 1;

  function applySettings() {
    S = FG.loadSettings();
    FG.applyThemeVars(S);
    document.getElementById('hTitle').textContent = S.title;
    document.getElementById('hLabel').textContent = S.label;
    document.getElementById('hdr').hidden = !S.wallHeader;
    tiles = new Map();
    dirty = true;
  }

  function setCount() { document.getElementById('hCount').textContent = FG.pad(entries.length); }

  async function load() {
    try { entries = (await FG.db.all()).filter((e) => e.cols && e.rows); } catch (e) { entries = []; }
    setCount();
    dirty = true;
  }

  function tileOf(e) {
    let t = tiles.get(e.no);
    if (!t) { t = FG.tinyCanvas(FG.strToBits(e.bits), e.cols, e.rows, FG.themeOf(S)); tiles.set(e.no, t); }
    return t;
  }

  /* 화면을 가장 크게 채우는 열 수 찾기 */
  function computeLayout(n) {
    const W = cv.width, H = cv.height;
    const pad = Math.round(Math.min(W, H) * 0.03);
    const head = S.wallHeader ? Math.round(Math.min(W, H) * 0.075) : 0;
    const aw = W - pad * 2, ah = H - pad * 2 - head;
    const ar = S.rows / S.cols;
    const slots = Math.max(n, Number(S.wallMinSlots) || 0, 1);
    let best = null;
    for (let c = 1; c <= slots; c++) {
      const r = Math.ceil(slots / c);
      const g = 0.08;
      const s = Math.min(aw / (c + (c - 1) * g), ah / (r * ar + (r - 1) * g));
      if (!best || s > best.s) best = { c, r, s, g };
    }
    const s = Math.floor(best.s);
    const gap = Math.max(1, Math.round(best.s * best.g));
    const th = Math.round(s * ar);
    const gw = best.c * s + (best.c - 1) * gap;
    const gh = best.r * th + (best.r - 1) * gap;
    return {
      c: best.c, r: best.r, slots, tw: s, th, gap,
      x0: Math.round((W - gw) / 2),
      y0: Math.round(pad + head + (ah - gh) / 2),
    };
  }
  function slotRect(i) {
    const c = i % lay.c, r = Math.floor(i / lay.c);
    return { x: lay.x0 + c * (lay.tw + lay.gap), y: lay.y0 + r * (lay.th + lay.gap), w: lay.tw, h: lay.th };
  }

  function drawTile(g, e, rc, bitsOverride) {
    const colors = FG.themeOf(S);
    const cell = rc.w / e.cols;
    if (cell >= 6 || bitsOverride) {
      const bits = bitsOverride || FG.strToBits(e.bits);
      if (cell >= 3) {
        FG.drawPortrait(g, bits, e.cols, e.rows, rc.x, rc.y, rc.w, rc.h, { grid: S.screenGrid && cell >= 8, shape: S.shape, colors });
        return;
      }
      g.imageSmoothingEnabled = false;
      g.drawImage(FG.tinyCanvas(bits, e.cols, e.rows, colors), rc.x, rc.y, rc.w, rc.h);
      return;
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(tileOf(e), rc.x, rc.y, rc.w, rc.h);
  }

  /* 쌓인 벽 (변화가 있을 때만 다시 그림) */
  function rebuild(hideNo) {
    const W = cv.width, H = cv.height;
    base.width = W; base.height = H;
    const colors = FG.themeOf(S);
    bctx.fillStyle = colors.wall;
    bctx.fillRect(0, 0, W, H);
    const visible = entries.filter((e) => e.no !== hideNo);
    shownList = visible;
    lay = computeLayout(visible.length + (hideNo != null ? 1 : 0));
    for (let i = 0; i < lay.slots; i++) {
      const rc = slotRect(i);
      const e = visible[i];
      if (e && e.cols === S.cols && e.rows === S.rows) drawTile(bctx, e, rc);
      else if (e) drawTile(bctx, e, rc);
      else {
        bctx.fillStyle = colors.slot;
        bctx.fillRect(rc.x, rc.y, rc.w, rc.h);
      }
    }
    dirty = false;
  }

  function resize() {
    const w = Math.round(window.innerWidth * dpr()), h = Math.round(window.innerHeight * dpr());
    if (cv.width !== w || cv.height !== h) {
      cv.width = w; cv.height = h;
      cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px';
      dirty = true;
    }
  }

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* 새 얼굴 연출 */
  const T_REVEAL = 1400, T_HOLD = 3200, T_FLY = 900;
  function startShow(e, now) {
    show = { e, t0: now, bits: FG.strToBits(e.bits) };
    entries = entries.filter((x) => x.no !== e.no).concat([e]).sort((a, b) => a.no - b.no);
    setCount();
    rebuild(e.no);
  }
  function drawShow(now) {
    const s = show, el = now - s.t0;
    const W = cv.width, H = cv.height;
    const colors = FG.themeOf(S);
    const ar = s.e.rows / s.e.cols;
    const bh = Math.round(H * 0.6), bw = Math.round(bh / ar);
    const big = { x: Math.round((W - bw) / 2), y: Math.round((H - bh) / 2 - H * 0.03), w: bw, h: bh };
    const idx = entries.findIndex((x) => x.no === s.e.no);
    const slot = slotRect(Math.max(0, idx));

    if (el < T_HOLD) {
      const a = Math.min(1, el / 300);
      ctx.globalAlpha = 0.82 * a;
      ctx.fillStyle = colors.wall;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      const reveal = Math.max(0, Math.min(s.e.rows, Math.floor((el / T_REVEAL) * s.e.rows)));
      FG.drawPortrait(ctx, s.bits, s.e.cols, s.e.rows, big.x, big.y, big.w, big.h, { grid: S.screenGrid, shape: S.shape, colors, reveal });
      ctx.globalAlpha = a;
      ctx.fillStyle = colors.text;
      const fs = Math.round(H * 0.034);
      ctx.font = `500 ${fs}px "JetBrains Mono", Menlo, monospace`;
      ctx.textBaseline = 'top';
      const ty = big.y + big.h + Math.round(fs * 0.6);
      const label = s.e.name || ('NO ' + FG.pad(s.e.no));
      const cell = Math.max(2, Math.min(Math.round(fs / 7 * 1.2), Math.floor(big.w / FG.dotCols(label))));
      FG.drawDotText(ctx, label, big.x, ty, { cell, color: colors.text, shape: S.nameShape });
      const meta = (s.e.name ? 'NO ' + FG.pad(s.e.no) + '  ' : '') + FG.fmtDate(s.e.ts) + '  ' + FG.fmtTime(s.e.ts);
      const mc = Math.max(2, Math.min(Math.round(cell * 0.45), Math.floor(big.w / FG.dotCols(meta))));
      FG.drawDotText(ctx, meta, big.x, ty + cell * 7 + Math.round(cell * 2.5), { cell: mc, color: colors.dim, shape: S.nameShape });
      ctx.globalAlpha = 1;
      return false;
    }
    const t = Math.min(1, (el - T_HOLD) / T_FLY);
    const k = ease(t);
    ctx.globalAlpha = 0.82 * (1 - k);
    ctx.fillStyle = colors.wall;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const r = { x: big.x + (slot.x - big.x) * k, y: big.y + (slot.y - big.y) * k, w: big.w + (slot.w - big.w) * k, h: big.h + (slot.h - big.h) * k };
    FG.drawPortrait(ctx, s.bits, s.e.cols, s.e.rows, r.x, r.y, r.w, r.h, { grid: S.screenGrid && r.w / s.e.cols >= 8, shape: S.shape, colors });
    return t >= 1;
  }

  /* 가끔 한 얼굴이 다시 맺힘 */
  function drawTwinkle(now) {
    if (!S.wallTwinkle || !entries.length || show) return;
    if (!twinkle || now - twinkle.t0 > 2600) {
      const i = (Math.random() * entries.length) | 0;
      const e = entries[i];
      twinkle = { i, e, t0: now, bits: FG.strToBits(e.bits), perm: null };
      const n = e.cols * e.rows, p = new Uint32Array(n);
      for (let j = 0; j < n; j++) p[j] = j;
      for (let j = n - 1; j > 0; j--) { const q = (Math.random() * (j + 1)) | 0; const tmp = p[j]; p[j] = p[q]; p[q] = tmp; }
      twinkle.perm = p;
    }
    const el = now - twinkle.t0, D = 700;
    if (el > D) return;
    const n = twinkle.bits.length;
    const k = Math.floor((el / D) * n);
    const out = new Uint8Array(n);
    for (let j = 0; j < n; j++) out[j] = twinkle.bits[j] ? 0 : 1;
    for (let j = 0; j < k; j++) out[twinkle.perm[j]] = twinkle.bits[twinkle.perm[j]];
    const rc = slotRect(twinkle.i);
    drawTile(ctx, twinkle.e, rc, out);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    resize();
    if (!show && queue.length) startShow(queue.shift(), now);
    if (dirty) rebuild(show ? show.e.no : undefined);
    ctx.drawImage(base, 0, 0);
    if (show) {
      if (drawShow(now)) { show = null; dirty = true; }
    } else {
      drawTwinkle(now);
    }
  }

  /* ───────── 얼굴을 누르면 영수증 카드 ───────── */
  const cardEl = document.getElementById('card');
  let cardIdx = -1, cardTimer = null, cardToken = 0;
  async function openCard(i) {
    if (i < 0 || i >= shownList.length) return;
    cardIdx = i;
    disarmDel();
    const e = shownList[i];
    const my = ++cardToken;
    await FG.fontsReady;
    if (my !== cardToken) return;
    document.getElementById('cardImg').src = FG.renderReceipt(e, S).toDataURL('image/png');
    document.getElementById('cardImg').alt = (e.name || 'GUEST') + ' · NO ' + FG.pad(e.no);
    document.getElementById('cardNo').textContent = 'NO ' + FG.pad(e.no) + (e.name ? ' · ' + e.name : '');
    if (cardEl.hidden) { cardEl.hidden = false; void cardEl.offsetWidth; }
    cardEl.classList.add('on');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(closeCard, 20000); // 20초 뒤 저절로 닫힘
  }
  function closeCard() {
    if (cardEl.hidden) return;
    clearTimeout(cardTimer);
    cardIdx = -1; cardToken++;
    cardEl.classList.remove('on');
    setTimeout(() => { if (cardIdx < 0) cardEl.hidden = true; }, 260);
  }
  const step = (d) => { const n = shownList.length; if (cardIdx >= 0 && n) openCard((cardIdx + d + n) % n); };
  function tileAt(ev) {
    if (!lay || show) return -1;
    const k = dpr(), x = ev.clientX * k, y = ev.clientY * k;
    for (let i = 0; i < shownList.length; i++) {
      const rc = slotRect(i);
      if (x >= rc.x && x < rc.x + rc.w && y >= rc.y && y < rc.y + rc.h) return i;
    }
    return -1;
  }
  cv.addEventListener('click', (ev) => { const i = tileAt(ev); if (i >= 0) openCard(i); });
  cv.addEventListener('pointermove', (ev) => cv.classList.toggle('hand', tileAt(ev) >= 0));
  cardEl.addEventListener('click', (ev) => { if (ev.target === cardEl) closeCard(); });
  document.getElementById('cardClose').addEventListener('click', closeCard);
  const delBtn = document.getElementById('cardDel');
  function disarmDel() { delBtn.classList.remove('arm'); delBtn.textContent = '삭제'; clearTimeout(delBtn._t); }
  delBtn.addEventListener('click', async () => {
    if (cardIdx < 0) return;
    if (!delBtn.classList.contains('arm')) {
      delBtn.classList.add('arm'); delBtn.textContent = '한 번 더 누르면 삭제';
      clearTimeout(delBtn._t); delBtn._t = setTimeout(disarmDel, 3500);
      return;
    }
    disarmDel();
    const e = shownList[cardIdx];
    try { await FG.db.remove(e.no); } catch (err) { console.error(err); return; }
    closeCard();
    FG.bus.post({ type: 'entries-changed' });
    load();
  });
  document.getElementById('cardSave').addEventListener('click', async () => {
    if (cardIdx < 0) return;
    const e = shownList[cardIdx];
    await FG.fontsReady;
    FG.renderReceipt(e, S).toBlob((b) => FG.download(b, FG.fileNameOf(e)));
  });
  document.getElementById('cardPrint').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (cardIdx < 0 || btn.disabled) return;
    const e = shownList[cardIdx];
    btn.disabled = true; btn.textContent = '출력 중…';
    clearTimeout(cardTimer); cardTimer = setTimeout(closeCard, 20000);
    try { await FG.fontsReady; await FG.printCanvas(FG.renderReceipt(e, S), S); } catch (err) { console.error(err); }
    setTimeout(() => { btn.disabled = false; btn.textContent = '다시 출력'; }, 2500);
  });
  document.getElementById('cardPrev').addEventListener('click', () => step(-1));
  document.getElementById('cardNext').addEventListener('click', () => step(1));
  window.addEventListener('keydown', (ev) => {
    if (cardEl.hidden) return;
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); closeCard(); }
    if (ev.key === 'ArrowLeft') step(-1);
    if (ev.key === 'ArrowRight') step(1);
  }, true);

  FG.bus.on((m) => {
    if (!m) return;
    if (m.type === 'entry' && m.entry) { closeCard(); queue.push(m.entry); }
    if (m.type === 'entries-changed') { queue.length = 0; show = null; load(); }
    if (m.type === 'settings') applySettings();
  });

  /* 다른 방법으로 추가된 경우 대비 */
  setInterval(async () => {
    if (show || queue.length) return;
    try { const n = await FG.db.count(); if (n !== entries.length) load(); } catch (e) { /* 무시 */ }
  }, 15000);
  // 다른 기기(키오스크)에서 찍힌 새 얼굴을 몇 초마다 가져와 크게 보여 줌
  if (FG.cloud) {
    setInterval(async () => {
      const known = Math.max(0, ...entries.map((e) => e.no), ...queue.map((e) => e.no), show ? show.e.no : 0);
      const fresh = await FG.db.since(known);
      fresh.forEach((e) => { if (!queue.some((q) => q.no === e.no)) queue.push(e); });
    }, 4000);
    FG.syncSettings().then((ch) => { if (ch) applySettings(); });
    setInterval(async () => { if (await FG.syncSettings()) applySettings(); }, 15000);
  }

  window.addEventListener('resize', () => { dirty = true; });
  FG.enableFullscreenOnFirstInput();
  FG.autoHideCursor();
  FG.escToAdmin();

  applySettings();
  resize();
  load();
  FG.fontsReady.then(() => { dirty = true; });
  requestAnimationFrame(loop);
})();
