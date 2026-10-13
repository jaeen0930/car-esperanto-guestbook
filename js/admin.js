/* 게스트북 · 관리 화면 */
(function () {
  'use strict';
  let S = FG.loadSettings();
  let entries = [];
  let selected = null;
  const $ = (id) => document.getElementById(id);
  const form = $('settings');

  if (location.protocol === 'file:') $('fileWarn').hidden = false;

  /* ───────── 설정 폼 ───────── */
  const NUMERIC = new Set(['cols', 'rows', 'bias', 'darkPct', 'detail', 'bgDarken', 'zoom', 'countdown', 'holdSeconds', 'attractAfter', 'copies', 'numberStart', 'wallMinSlots', 'rotate', 'paper', 'nameMax']);
  function fillForm() {
    Array.prototype.forEach.call(form.elements, (el) => {
      if (!el.name || !(el.name in S)) return;
      if (el.type === 'checkbox') el.checked = !!S[el.name];
      else el.value = S[el.name];
    });
    form.querySelectorAll('.seg').forEach((seg) => {
      const v = String(S[seg.dataset.name]);
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    });
    form.querySelectorAll('output[data-for]').forEach((o) => { o.textContent = fmtOut(o.dataset.for, S[o.dataset.for]); });
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const k = el.dataset.bind;
      el.textContent = k === 'grid' ? S.cols + ' × ' + S.rows : S[k];
    });
  }
  function fmtOut(name, v) {
    if (name === 'bias') return (v > 0 ? '+' : '') + v;
    if (name === 'bgDarken' || name === 'darkPct') return Math.round(v * 100) + '%';
    if (name === 'detail') return Number(v).toFixed(1);
    if (name === 'zoom') return '×' + Number(v).toFixed(2);
    return v;
  }
  let savedTimer;
  function commit(name, value) {
    if (NUMERIC.has(name)) value = Number(value);
    if (name === 'cols') value = Math.max(12, Math.min(64, Math.round(value) || 24));
    if (name === 'rows') value = Math.max(16, Math.min(86, Math.round(value) || 32));
    S[name] = value;
    FG.saveSettings(S);
    fillForm();
    renderPreviews();
    const el = $('saved');
    el.classList.add('on');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('on'), 1200);
  }
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name) return;
    if (el.type === 'text' || el.tagName === 'TEXTAREA') return; // 글자는 change 때 저장
    if (el.type === 'number' && el.value === '') return;
    commit(el.name, el.type === 'checkbox' ? el.checked : el.value);
  });
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.name) return;
    commit(el.name, el.type === 'checkbox' ? el.checked : el.value);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) commit(seg.dataset.name, b.dataset.v);
    });
  });
  $('btnReset').addEventListener('click', () => {
    const keepCam = S.cameraId;
    S = Object.assign({}, FG.DEFAULTS, { cameraId: keepCam });
    FG.saveSettings(S);
    fillForm();
    renderPreviews();
  });

  /* 카메라 목록 */
  $('btnCams').addEventListener('click', async () => {
    const sel = form.elements.cameraId;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      st.getTracks().forEach((t) => t.stop());
      sel.innerHTML = '<option value="">기본 카메라</option>' + devs.map((d, i) => `<option value="${d.deviceId}">${(d.label || '카메라 ' + (i + 1)).replace(/</g, '&lt;')}</option>`).join('');
      sel.value = S.cameraId || '';
    } catch (e) {
      $('btnCams').textContent = '카메라 권한 필요';
    }
  });

  /* ───────── 미리보기 ───────── */
  function sampleEntry() {
    const last = entries[entries.length - 1];
    if (last) return last;
    return { no: nextNo(), ts: Date.now(), cols: S.cols, rows: S.rows, bits: FG.demoBits(S.cols, S.rows), name: 'JAEEUN' };
  }
  function nextNo() {
    const max = entries.reduce((m, e) => Math.max(m, e.no), 0);
    return Math.max(max + 1, Number(S.numberStart) || 1);
  }
  function renderPreviews() {
    const e = sampleEntry();
    const bits = typeof e.bits === 'string' ? FG.strToBits(e.bits) : e.bits;
    const cols = e.cols, rows = e.rows;
    const c = $('pvScreen');
    const dpr = window.devicePixelRatio || 1;
    const w = 240, h = Math.round((240 * rows) / cols);
    c.style.height = h + 'px';
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    FG.drawPortrait(g, bits, cols, rows, 0, 0, c.width, c.height, { grid: S.screenGrid, shape: S.shape, colors: FG.themeOf(S) });

    FG.fontsReady.then(() => {
      const r = FG.renderReceipt(e, S);
      const pv = $('pvReceipt');
      pv.width = r.width; pv.height = r.height;
      pv.getContext('2d').drawImage(r, 0, 0);
      pv.style.width = (S.paper === 58 ? 300 : 380) + 'px';
      $('pvPaper').textContent = S.paper + 'mm 감열지 · 가로 영수증 ' + Math.round(r.width / r.height * FG.receiptSpec(S.paper).printable) + ' × ' + FG.receiptSpec(S.paper).printable + ' mm';
    });
  }
  $('btnTestPrint').addEventListener('click', async () => {
    await FG.fontsReady;
    try { await FG.printCanvas(FG.renderReceipt(sampleEntry(), S), S); if (S.printMode === 'epos') alert('프린터로 보냈어요'); }
    catch (e) { alert('인쇄하지 못했어요. ' + e.message + '\n\n프린터 주소, 같은 네트워크인지, 아이패드에서 https://' + (S.eposHost || '프린터주소') + ' 를 한 번 열어 인증서를 허용했는지 확인해 주세요.'); }
  });
  $('btnSaveReceipt').addEventListener('click', async () => {
    await FG.fontsReady;
    const e = sampleEntry();
    FG.renderReceipt(e, S).toBlob((b) => FG.download(b, FG.fileNameOf(e)));
  });

  /* ───────── 보관함 ───────── */
  async function loadArchive() {
    try { entries = await FG.db.all(); } catch (e) { entries = []; }
    $('stCount').textContent = entries.length;
    $('stNext').textContent = '#' + FG.pad(nextNo());
    const box = $('archive');
    if (!entries.length) {
      box.innerHTML = '<p class="empty">아직 저장된 얼굴이 없어요.</p>';
    } else {
      box.innerHTML = '';
      const colors = FG.themeOf(S);
      const frag = document.createDocumentFragment();
      entries.slice().reverse().forEach((e) => {
        const b = document.createElement('button');
        b.className = 'thumb' + (selected && selected.no === e.no ? ' sel' : '');
        b.type = 'button';
        b.title = '#' + FG.pad(e.no) + ' · ' + (e.name ? e.name + ' · ' : '') + FG.fmtDate(e.ts) + ' ' + FG.fmtTime(e.ts);
        b.appendChild(FG.tinyCanvas(FG.strToBits(e.bits), e.cols, e.rows, colors));
        const s = document.createElement('span'); s.textContent = '#' + FG.pad(e.no);
        b.appendChild(s);
        b.dataset.no = e.no;
        const pk = document.createElement('span'); pk.className = 'pick'; pk.title = '지울 얼굴로 고르기';
        pk.addEventListener('click', (ev) => { ev.stopPropagation(); if (picked.has(e.no)) picked.delete(e.no); else picked.add(e.no); updatePick(); });
        b.appendChild(pk);
        if (picked.has(e.no)) b.classList.add('picked');
        b.addEventListener('click', () => select(e));
        frag.appendChild(b);
      });
      box.appendChild(frag);
    }
    if (selected && !entries.find((x) => x.no === selected.no)) select(null);
    renderPreviews();
  }
  function select(e) {
    selected = e;
    $('selected').hidden = !e;
    document.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('sel', !!e && t.title.startsWith('#' + FG.pad(e.no) + ' ')));
    if (!e) return;
    const c = $('selCanvas');
    c.width = e.cols * 8; c.height = e.rows * 8;
    FG.drawPortrait(c.getContext('2d'), FG.strToBits(e.bits), e.cols, e.rows, 0, 0, c.width, c.height, { grid: true, shape: S.shape, colors: FG.themeOf(S) });
    $('selNo').textContent = '#' + FG.pad(e.no);
    $('selMeta').textContent = (e.name ? e.name + ' · ' : '') + FG.fmtDate(e.ts) + ' ' + FG.fmtTime(e.ts) + ' · ' + e.cols + ' × ' + e.rows;
    disarm($('btnDelete'), '이 얼굴 지우기');
  }

  /* 두 번 눌러야 실행되는 버튼 (실수 방지) */
  function armed(btn, label, armedLabel, fn) {
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('arm')) { disarm(btn, label); await fn(); return; }
      btn.classList.add('arm');
      btn.textContent = armedLabel;
      clearTimeout(btn._t);
      btn._t = setTimeout(() => disarm(btn, label), 3500);
    });
  }
  function disarm(btn, label) { btn.classList.remove('arm'); btn.textContent = label; clearTimeout(btn._t); }

  armed($('btnDelete'), '이 얼굴 지우기', '한 번 더 누르면 지워요', async () => {
    if (!selected) return;
    await FG.db.remove(selected.no);
    selected = null;
    FG.bus.post({ type: 'entries-changed' });
    loadArchive();
  });
  /* 골라서 지우기 (모두 지우기는 위험해서 없앰) */
  const picked = new Set();
  function updatePick() {
    const n = picked.size;
    $('pickInfo').textContent = n ? n + '개 골랐어요' : '지울 얼굴의 네모 칸을 눌러 고르세요';
    $('btnDelPicked').disabled = !n;
    $('btnPickNone').hidden = !n;
    disarm($('btnDelPicked'), n ? '선택한 ' + n + '개 지우기' : '선택한 얼굴 지우기');
    document.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('picked', picked.has(Number(t.dataset.no))));
  }
  $('btnPickNone').addEventListener('click', () => { picked.clear(); updatePick(); });
  armed($('btnDelPicked'), '선택한 얼굴 지우기', '한 번 더 누르면 지워요', async () => {
    const list = [...picked];
    for (const no of list) { try { await FG.db.remove(no); } catch (e) { console.error(e); } }
    picked.clear();
    if (selected && list.includes(selected.no)) selected = null;
    FG.bus.post({ type: 'entries-changed' });
    await loadArchive();
    updatePick();
  });
  $('btnSaveSel').addEventListener('click', async () => {
    if (!selected) return;
    await FG.fontsReady;
    FG.renderReceipt(selected, S).toBlob((b) => FG.download(b, FG.fileNameOf(selected)));
  });
  $('btnReprint').addEventListener('click', async () => {
    if (!selected) return;
    await FG.fontsReady;
    Promise.resolve(FG.printCanvas(FG.renderReceipt(selected, S), S)).catch((e) => alert("인쇄하지 못했어요. " + e.message));
  });

  $('btnExport').addEventListener('click', () => {
    const data = { app: 'face-guestbook', version: 1, exportedAt: new Date().toISOString(), settings: S, entries };
    const d = new Date();
    const stamp = d.getFullYear() + FG.pad(d.getMonth() + 1, 2) + FG.pad(d.getDate(), 2) + '-' + FG.pad(d.getHours(), 2) + FG.pad(d.getMinutes(), 2);
    FG.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'face-guestbook-' + stamp + '.json');
  });
  $('fileImport').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : data.entries;
      let n = 0;
      for (const e of list || []) {
        if (e && typeof e.no === 'number' && typeof e.bits === 'string' && e.cols && e.rows) { await FG.db.put(e); n++; }
      }
      FG.bus.post({ type: 'entries-changed' });
      await loadArchive();
      $('fileImport').parentElement.firstChild.textContent = n + '개 불러옴 ';
    } catch (e) {
      $('fileImport').parentElement.firstChild.textContent = '파일을 읽지 못했어요 ';
    }
    ev.target.value = '';
  });

  /* 벽 포스터: 쌓인 얼굴 전체를 한 장으로 */
  $('btnPoster').addEventListener('click', async () => {
    if (!entries.length) return;
    await FG.fontsReady;
    const list = entries;
    const cols = S.cols, rows = S.rows;
    const ar = rows / cols;
    const n = list.length;
    const c = Math.max(1, Math.ceil(Math.sqrt(0.75 * n * ar)));
    const r = Math.ceil(n / c);
    const cell = n > 900 ? 4 : n > 200 ? 6 : 10;
    const tw = cols * cell, th = rows * cell, gap = cell * 2;
    const m = Math.max(80, tw);
    const head = Math.round(m * 1.2);
    const W = m * 2 + c * tw + (c - 1) * gap;
    const H = m * 2 + head + r * th + (r - 1) * gap;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const t = FG.themeOf(S);
    g.fillStyle = t.wall; g.fillRect(0, 0, W, H);
    g.fillStyle = t.text;
    const fs = Math.round(head * 0.34);
    g.font = `800 ${fs}px Pretendard, sans-serif`;
    g.fillText(S.title, m, m + fs);
    g.font = `500 ${Math.round(fs * 0.45)}px "JetBrains Mono", monospace`;
    g.fillStyle = t.dim;
    const right = FG.pad(n) + ' FACES · ' + FG.fmtDate(list[0].ts) + ' – ' + FG.fmtDate(list[n - 1].ts);
    g.fillText(right, W - m - g.measureText(right).width, m + fs);
    list.forEach((e, i) => {
      const x = m + (i % c) * (tw + gap), y = m + head + Math.floor(i / c) * (th + gap);
      FG.drawPortrait(g, FG.strToBits(e.bits), e.cols, e.rows, x, y, tw, th, { grid: false, shape: S.shape, colors: t });
    });
    cv.toBlob((b) => FG.download(b, 'face-guestbook-wall-' + FG.pad(n) + '.png'));
  });

  FG.bus.on((m) => {
    if (!m) return;
    if (m.type === 'entry') loadArchive();
    if (m.type === 'settings') { S = FG.loadSettings(); fillForm(); renderPreviews(); }
  });

  $('stStore').textContent = FG.cloud ? '웹' : '이 컴퓨터';
  if (FG.cloud) $('storeNote').textContent = '웹 저장소에 저장돼요. 키오스크 · 벽 · 관리 화면을 어느 기기에서 열어도 같은 기록이 보여요. 그래도 가끔 백업 파일을 받아 두면 안심이에요.';
  fillForm();
  loadArchive();
  // 다른 기기의 새 기록 · 설정 반영
  if (FG.cloud) {
    FG.syncSettings().then((ch) => { if (ch) { S = FG.loadSettings(); fillForm(); renderPreviews(); } });
    setInterval(async () => {
      if (await FG.syncSettings()) { S = FG.loadSettings(); fillForm(); renderPreviews(); }
      const n = (await FG.db.all()).length; if (n !== entries.length) loadArchive();
    }, 15000);
  }
})();
