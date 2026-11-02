/* 게스트북 화면 (피그마 guest book ui: Main · Front · Back)
   얼굴 카드 5열 격자, 새로 찍힌 얼굴이 맨 앞에. 카드를 누르면 영수증 앞면, 영수증을 누르면 뒷면(남긴 글).
   ?from=kiosk  키오스크에서 왔을 때: 로고를 누르거나 60초 동안 손대지 않으면 키오스크로 돌아감 */
(function () {
  'use strict';
  let S = FG.loadSettings();
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const FROM_KIOSK = new URLSearchParams(location.search).get('from') === 'kiosk';
  const W = 1024, H = 1366;
  const COLORS = { on: '#f2f1ec', off: '#0f0f0f', line: '#2a2a2a' };
  const CW = 171, CH = 228, PX = 184.57, PY = 242.4, X0 = 1.22, Y0 = 5.26;

  let entries = [];      // 최신이 앞
  let scale = 1;
  function fit() {
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `translate(${-W * scale / 2}px, ${-H * scale / 2}px) scale(${scale})`;
    renderGrid(true);
  }

  async function load() {
    let list = [];
    try { list = (await FG.db.all()).filter((e) => e.cols && e.rows && e.bits); } catch (e) { list = []; }
    entries = list.sort((a, b) => b.no - a.no);
    $('hCount').textContent = FG.pad(entries.length);
    renderGrid(true);
  }

  /* ───────── 격자 ───────── */
  const cards = new Map(); // no → element
  function cardEl(e) {
    let el = cards.get(e.no);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'gcard';
    const cv = document.createElement('canvas');
    const msg = FG.msgOf(e);
    el.appendChild(cv);
    const m = document.createElement('div'); m.className = 'msg';
    const p = document.createElement('p'); p.textContent = msg; m.appendChild(p); el.appendChild(m);
    el.classList.toggle('has-msg', !!msg);
    el.addEventListener('click', () => openDetail(entries.findIndex((x) => x.no === e.no)));
    cards.set(e.no, el);
    el._drawn = 0;
    return el;
  }
  function drawCard(el, e) {
    const cv = el.querySelector('canvas');
    const k = (window.devicePixelRatio || 1) * scale;
    const w = Math.round(CW * k), h = Math.round(CH * k);
    if (el._drawn === w) return;
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    FG.drawPortrait(g, FG.strToBits(e.bits), e.cols, e.rows, 0, 0, w, h, { grid: true, shape: FG.shapeOf(e, S) === 'dot' ? 'dot' : 'square', colors: COLORS });
    el._drawn = w;
  }
  function renderGrid(redraw) {
    const inner = $('gridIn');
    const keep = new Set(entries.map((e) => e.no));
    cards.forEach((el, no) => { if (!keep.has(no)) { el.remove(); cards.delete(no); } });
    entries.forEach((e, i) => {
      const el = cardEl(e);
      el.style.left = (X0 + (i % 5) * PX) + 'px';
      el.style.top = (Y0 + Math.floor(i / 5) * PY) + 'px';
      if (el.parentNode !== inner) inner.appendChild(el);
      if (redraw) el._drawn = 0;
      drawCard(el, e);
    });
    inner.style.height = (Math.ceil(entries.length / 5) * PY + Y0) + 'px';
  }

  /* 남긴 글이 있는 카드 하나씩 잠깐 글을 보여 줌 */
  let showing = null;
  setInterval(() => {
    if (!$('detail').hidden) return;
    if (showing) { showing.classList.remove('show'); showing = null; return; }
    const withMsg = Array.from(cards.values()).filter((el) => el.classList.contains('has-msg'));
    if (!withMsg.length) return;
    showing = withMsg[(Math.random() * withMsg.length) | 0];
    showing.classList.add('show');
  }, 3200);

  /* ───────── 영수증 보기 (Front · Back) ───────── */
  let cur = -1, side = 'front', token = 0;
  async function openDetail(i) {
    if (i < 0 || i >= entries.length) return;
    cur = i; side = 'front';
    disarm();
    await paintCard();
    $('detail').hidden = false;
    poke();
  }
  async function paintCard(animate) {
    const e = entries[cur]; if (!e) return;
    const my = ++token;
    await FG.fontsReady;
    if (my !== token) return;
    const img = $('cardImg'), card = $('card');
    const rc = FG.renderReceipt(e, S, side);
    if (animate) { card.classList.add('flip'); await FG.sleep(200); }
    img.src = rc.toDataURL('image/png');
    card.classList.remove('flip');
    $('caption').textContent = 'No  ' + FG.pad(e.no) + ' · ' + (e.name || 'GUEST') + ' ';
  }
  function closeDetail() { $('detail').hidden = true; cur = -1; token++; disarm(); }
  $('dim').addEventListener('click', closeDetail);
  $('card').addEventListener('click', () => { side = side === 'front' ? 'back' : 'front'; paintCard(true); poke(); });
  $('prev').addEventListener('click', () => { if (entries.length) { cur = (cur - 1 + entries.length) % entries.length; side = 'front'; disarm(); paintCard(true); } poke(); });
  $('next').addEventListener('click', () => { if (entries.length) { cur = (cur + 1) % entries.length; side = 'front'; disarm(); paintCard(true); } poke(); });

  const del = $('delete');
  function disarm() { del.classList.remove('arm'); del.textContent = 'DELETE'; clearTimeout(del._t); }
  del.addEventListener('click', async () => {
    if (cur < 0) return;
    if (!del.classList.contains('arm')) {
      del.classList.add('arm'); del.textContent = 'DELETE?';
      clearTimeout(del._t); del._t = setTimeout(disarm, 3500);
      return;
    }
    disarm();
    const e = entries[cur];
    try { await FG.db.remove(e.no); } catch (err) { console.error(err); toast('지우지 못했어요'); return; }
    closeDetail();
    FG.bus.post({ type: 'entries-changed' });
    load();
  });
  $('reprint').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (cur < 0 || btn.disabled) return;
    btn.disabled = true;
    try {
      await FG.fontsReady;
      try { if (await Promise.race([FG.syncSettings(), FG.sleep(1500).then(() => false)])) S = FG.loadSettings(); } catch (e) { /* 그대로 */ }
      await FG.printCanvas(FG.renderReceipt(entries[cur], S), S);
      toast('다시 출력했어요');
    } catch (err) { console.error(err); toast('프린터에 닿지 않았어요'); }
    setTimeout(() => { btn.disabled = false; }, 2500);
  });

  let toastT;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

  /* 키오스크에서 왔으면 돌아가기 */
  let idleT = null;
  function poke() {
    clearTimeout(idleT);
    if (FROM_KIOSK) idleT = setTimeout(() => { location.href = 'kiosk.html'; }, 60000);
  }
  window.addEventListener('pointerdown', poke, { capture: true });
  $('logo').addEventListener('click', () => { if (FROM_KIOSK) location.href = 'kiosk.html'; else closeDetail(); });

  window.addEventListener('keydown', (ev) => {
    if ($('detail').hidden) return;
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); closeDetail(); }
    if (ev.key === 'ArrowLeft') $('prev').click();
    if (ev.key === 'ArrowRight') $('next').click();
    if (ev.key === ' ') { ev.preventDefault(); $('card').click(); }
  }, true);

  /* 새 얼굴 */
  function addFresh(list) {
    let changed = false;
    list.forEach((e) => { if (e && e.bits && !entries.some((x) => x.no === e.no)) { entries.unshift(e); changed = true; } });
    if (!changed) return;
    entries.sort((a, b) => b.no - a.no);
    $('hCount').textContent = FG.pad(entries.length);
    renderGrid();
    const el = cards.get(entries[0].no);
    if (el) { el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); $('grid').scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  FG.bus.on((m) => {
    if (!m) return;
    if (m.type === 'entry' && m.entry) addFresh([m.entry]);
    if (m.type === 'entries-changed') load();
    if (m.type === 'settings') S = FG.loadSettings();
  });
  if (FG.cloud) {
    setInterval(async () => {
      const known = Math.max(0, ...entries.map((e) => e.no));
      try { addFresh(await FG.db.since(known)); } catch (e) { /* 무시 */ }
    }, 4000);
    FG.syncSettings().then((ch) => { if (ch) S = FG.loadSettings(); });
    setInterval(async () => { if (await FG.syncSettings()) S = FG.loadSettings(); }, 15000);
  }
  setInterval(async () => { try { const n = await FG.db.count(); if (n !== entries.length) load(); } catch (e) { /* 무시 */ } }, 20000);

  window.addEventListener('resize', fit);
  FG.enableFullscreenOnFirstInput();
  FG.autoHideCursor();
  FG.escToAdmin();
  fit();
  load();
  poke();
  FG.fontsReady.then(() => renderGrid(true));
})();
