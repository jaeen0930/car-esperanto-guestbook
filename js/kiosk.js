/* 게스트북 · 키오스크 (피그마 Guest book design · kiosk ui)
   흐름: 메인 → 도형 고르기 → 촬영(3·2·1) → 다시 찍기 / 다음 → 이름 → 남길 말 → 감사 · PRINT → GUEST BOOK
   ?debug  카메라 원본과 얼굴 인식 상자를 구석에 표시 */
(function () {
  'use strict';

  let S = FG.loadSettings();
  const P = new URLSearchParams(location.search);
  const DEBUG = P.has('debug');
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const pix = $('pix'), pctx = pix.getContext('2d');
  const facesCv = $('faces'), fctx = facesCv.getContext('2d');
  const video = $('cam');

  const W = 1024, H = 1366;
  const VIEW_ROWS = 26;             // 화면 얼굴 상자에 보이는 줄 수 (피그마: 24 × 26 칸, 870.8 × 943.4)
  const COLORS = { on: '#f2f1ec', off: '#0f0f0f', line: '#2a2a2a' };

  let state = 'boot';
  let archive = [];
  const sess = { shape: null, bits: null, bgMask: null, tone: null, name: '', ime: null, entry: null, msgMode: 'en', strokes: [] };

  /* ───────── 화면 맞추기 (1024 × 1366 무대를 창에 맞춰 늘림) ───────── */
  let scale = 1;
  function fit() {
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `translate(${-W * scale / 2}px, ${-H * scale / 2}px) scale(${scale})`;
    sizeCanvases();
  }
  function backing(cv, w, h) {
    const k = (window.devicePixelRatio || 1) * scale;
    const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    return k;
  }
  function sizeCanvases() {
    backing(pix, 870.8, 943.4);
    backing(facesCv, W, H);
    drawFaces(true);
    if (state === 'name') drawName();
    if (state === 'message') sizeDraw();
    if (state === 'thanks' || state === 'printed') drawThanks();
  }

  /* ───────── 설정 ───────── */
  let lastCameraKey = null;
  function applySettings() {
    S = FG.loadSettings();
    document.querySelectorAll('[data-bind]').forEach((el) => { el.textContent = S[el.dataset.bind] || ''; });
    const camKey = S.cameraId + '|' + S.rotate;
    if (lastCameraKey !== null && camKey !== lastCameraKey) startCamera();
    lastCameraKey = camKey;
  }

  /* ───────── 상태 ───────── */
  function go(st) {
    state = st;
    document.body.dataset.state = st;
    touch();
    if (st === 'main') { resetSession(); drawFaces(true); }
    if (st === 'shape') updateShape();
    if (st === 'name') { document.body.classList.add('can-next'); drawName(); }
    if (st === 'message') sizeDraw();
    if (st === 'thanks' || st === 'printed') drawThanks();
    if (st !== 'countdown') { $('digit').classList.remove('on'); }
  }
  function resetSession() {
    sess.shape = null; sess.bits = null; sess.bgMask = null; sess.tone = null; sess.name = ''; sess.entry = null;
    sess.strokes = []; sess.ime = FG.Hangul(300); sess.msgMode = 'en'; sess.shift = 0;
    frozen = null; pxr.reset();
    document.body.classList.remove('can-next');
    $('printBtn').classList.remove('busy');
  }

  /* 오래 손대지 않으면 처음으로 */
  let idleTimer = null;
  function touch() {
    clearTimeout(idleTimer);
    if (state === 'main' || state === 'boot' || state === 'error' || state === 'countdown') return;
    const sec = state === 'thanks' || state === 'printed' ? 45 : 90;
    idleTimer = setTimeout(() => go('main'), sec * 1000);
  }
  window.addEventListener('pointerdown', touch, { capture: true });

  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  /* ───────── 소리 ───────── */
  const audio = (function () {
    let ac = null;
    function ctx() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f, d, v) {
      if (!S.sound) return;
      const a = ctx(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, a.currentTime);
      g.gain.linearRampToValueAtTime(v, a.currentTime + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
      o.connect(g).connect(a.destination);
      o.start(); o.stop(a.currentTime + d + 0.03);
    }
    function shutter() {
      if (!S.sound) return;
      const a = ctx(); if (!a) return;
      const len = Math.floor(a.sampleRate * 0.09);
      const b = a.createBuffer(1, len, a.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const s = a.createBufferSource(); s.buffer = b;
      const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
      const g = a.createGain(); g.gain.value = 0.45;
      s.connect(f).connect(g).connect(a.destination);
      s.start();
    }
    return { unlock: ctx, tick: (last) => tone(last ? 1320 : 880, 0.13, 0.16), key: () => tone(660, 0.05, 0.06), shutter };
  })();

  /* ───────── 메인: 다녀간 얼굴 타일 (피그마 프레임 5 자리 그대로) ───────── */
  const TILES = [
    [0, 859.1, 105.7, 98.8], [414.04, 859.1, 106.07, 98.06], [724.29, 859.1, 106.07, 98.06],
    [105.68, 962.49, 97.6, 90.24], [520.63, 962.49, 97.6, 90.24], [625.09, 962.49, 97.6, 90.24], [928.82, 961.35, 95.18, 90.56],
    [209.45, 1063.26, 96.67, 90.89], [312.67, 1064.37, 99.26, 92.06],
    [626.69, 1177.18, 97.6, 90.24], [105.68, 1267.42, 97.6, 90.24],
  ];
  let tileSet = [], tileT = 0;
  function drawFaces(force) {
    if (state !== 'main' && !force) return;
    const k = facesCv.width / W;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, facesCv.width, facesCv.height);
    const list = archive.filter((e) => e.cols && e.rows && e.bits);
    if (!list.length) return;
    if (tileSet.length !== TILES.length) tileSet = TILES.map((_, i) => list[(list.length - 1 - i + list.length * 10) % list.length]);
    TILES.forEach(([x, y, w, h], i) => {
      const e = tileSet[i]; if (!e) return;
      const bits = FG.strToBits(e.bits);
      const vr = Math.min(e.rows, Math.round((e.cols * h) / w));
      FG.drawPortrait(fctx, bits.subarray(0, e.cols * vr), e.cols, vr, x * k, y * k, w * k, h * k, { grid: true, shape: 'square', colors: COLORS });
    });
  }
  setInterval(() => {
    if (state !== 'main') return;
    const list = archive.filter((e) => e.cols && e.rows && e.bits);
    if (list.length > TILES.length) { const i = (Math.random() * TILES.length) | 0; tileSet[i] = list[(Math.random() * list.length) | 0]; drawFaces(); }
  }, 2600);
  $('v-main').addEventListener('click', () => { audio.unlock(); go('shape'); });

  /* ───────── 도형 ───────── */
  function updateShape() {
    document.querySelectorAll('.shape').forEach((b) => b.classList.toggle('on', b.dataset.shape === sess.shape));
    document.body.classList.toggle('can-next', !!sess.shape);
  }
  document.querySelectorAll('.shape').forEach((b) => b.addEventListener('click', () => { sess.shape = b.dataset.shape; audio.key(); updateShape(); }));

  /* ───────── 다음 ───────── */
  $('nextBtn').addEventListener('click', () => {
    audio.key();
    if (state === 'shape' && sess.shape) go('photo');
    else if (state === 'review') go('name');
    else if (state === 'name') { sess.name = sess.name.trim(); go('message'); }
    else if (state === 'message') finishMessage();
  });

  /* ───────── 촬영 ───────── */
  $('shutter').addEventListener('click', () => { audio.unlock(); shoot(); });
  $('retake').addEventListener('click', () => { frozen = null; pxr.reset(); go('photo'); });

  /* ───────── 이름 ───────── */
  const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  function buildNameKeys() {
    const kb = $('kbdName');
    const pos = [[33, 0], [75, 54], [75, 108]], pitch = 84;
    let html = '';
    KEY_ROWS.forEach((row, r) => row.split('').forEach((c, i) => {
      html += `<button type="button" data-k="${c}" style="left:${pos[r][0] + pitch * i}px;top:${pos[r][1]}px">${c}</button>`;
    }));
    html += `<button type="button" class="wide" data-k="BACK" style="left:${75 + pitch * 7}px;top:108px" aria-label="지우기">←</button>`;
    kb.innerHTML = html;
    kb.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); flashKey(b); nameKey(b.dataset.k);
    });
  }
  function flashKey(b) { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 180); }
  function nameKey(k) {
    const max = Math.max(4, Math.min(16, Number(S.nameMax) || 12));
    if (k === 'BACK') sess.name = sess.name.slice(0, -1);
    else if (k === 'ENTER') { $('nextBtn').click(); return; }
    else {
      const next = FG.cleanName(sess.name + k, max);
      if (next === sess.name && sess.name.length >= max) toast(max + '자까지 적을 수 있어요');
      sess.name = next;
    }
    audio.key();
    drawName();
  }
  function drawName() {
    const cv = $('nameCv'), k = backing(cv, 760, 92), g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    const name = sess.name;
    let cell = 8.6;                                   // 피그마: 글자 높이 60.2 = 7칸
    const maxW = 744;
    if (name && FG.dotCols(name) * cell + 18 > maxW) cell = (maxW - 18) / FG.dotCols(name);
    const top = 18.4 + (60.2 - 7 * cell) / 2;
    if (name) FG.drawDotText(g, name, 0, top, { cell, color: '#fff', shape: 'pixel' });
    const on = Math.floor(performance.now() / 530) % 2 === 0;
    if (on) {
      g.fillStyle = '#ff0005';
      const x = name ? FG.dotCols(name) * cell + 9.7 : 0;
      g.fillRect(x, 18.4, 7.735, 60.232);
    }
  }
  setInterval(() => { if (state === 'name') drawName(); }, 130);

  /* ───────── 남길 말 (터치로 글씨/그림) ───────── */
  const DECO = [[170.94, 205.18], [123.04, 253.15], [170.94, 157.28], [830.06, 1063.47], [878.06, 206.28], [830.16, 158.38], [222.06, 1063.47], [174.16, 1063.47], [782.16, 1063.47], [877.96, 1111.37]];
  $('deco').innerHTML = DECO.map(([x, y]) => `<i style="left:${x}px;top:${y}px"></i>`).join('');

  const DRAW_W = 176, DRAW_H = 228;           // 저장용 그림 해상도 (그림판 비율과 맞춤)
  const drawCv = $('drawCv'), dctx = drawCv.getContext('2d');
  let drawing = false, lastPt = null;
  function drawBox() { return drawCv.getBoundingClientRect(); }   // CSS 540 × 700
  function sizeDraw() {
    const k = (window.devicePixelRatio || 1) * scale;
    const w = Math.max(1, Math.round(540 * k)), h = Math.max(1, Math.round(700 * k));
    if (drawCv.width !== w || drawCv.height !== h) { drawCv.width = w; drawCv.height = h; }
    redrawInk();
  }
  function redrawInk() {
    const k = (window.devicePixelRatio || 1) * scale;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, drawCv.width, drawCv.height);
    dctx.setTransform(k, 0, 0, k, 0, 0);          // 좌표를 CSS 픽셀(540×700)로
    dctx.strokeStyle = '#111'; dctx.lineCap = 'round'; dctx.lineJoin = 'round'; dctx.lineWidth = 9;
    sess.strokes.forEach((st) => {
      if (st.length < 2) { if (st.length === 1) { dctx.beginPath(); dctx.arc(st[0].x * 540, st[0].y * 700, 4.5, 0, 7); dctx.fillStyle = '#111'; dctx.fill(); } return; }
      dctx.beginPath(); dctx.moveTo(st[0].x * 540, st[0].y * 700);
      for (let i = 1; i < st.length; i++) dctx.lineTo(st[i].x * 540, st[i].y * 700);
      dctx.stroke();
    });
  }
  function ptFrom(e) { const r = drawBox(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  drawCv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); drawCv.setPointerCapture(e.pointerId);
    drawing = true; lastPt = ptFrom(e);
    sess.strokes.push([lastPt]); redrawInk();
  });
  drawCv.addEventListener('pointermove', (e) => {
    if (!drawing) return; e.preventDefault();
    const p = ptFrom(e);
    if (lastPt && Math.hypot(p.x - lastPt.x, p.y - lastPt.y) < 0.004) return;
    sess.strokes[sess.strokes.length - 1].push(p); lastPt = p; redrawInk();
  });
  const endDraw = () => { drawing = false; lastPt = null; };
  drawCv.addEventListener('pointerup', endDraw);
  drawCv.addEventListener('pointercancel', endDraw);
  drawCv.addEventListener('pointerleave', () => { if (drawing) lastPt = null; });
  $('clearBtn').addEventListener('click', () => { sess.strokes = []; redrawInk(); audio.key(); });

  /* 그림을 1비트 비트맵으로 (DRAW_W × DRAW_H) */
  function drawToBits() {
    if (!sess.strokes.some((s) => s.length)) return null;
    const oc = document.createElement('canvas'); oc.width = DRAW_W; oc.height = DRAW_H;
    const g = oc.getContext('2d');
    g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2, DRAW_W * 0.022);
    sess.strokes.forEach((st) => {
      if (!st.length) return;
      if (st.length === 1) { g.beginPath(); g.arc(st[0].x * DRAW_W, st[0].y * DRAW_H, g.lineWidth / 2, 0, 7); g.fill(); return; }
      g.beginPath(); g.moveTo(st[0].x * DRAW_W, st[0].y * DRAW_H);
      for (let i = 1; i < st.length; i++) g.lineTo(st[i].x * DRAW_W, st[i].y * DRAW_H);
      g.stroke();
    });
    const img = g.getImageData(0, 0, DRAW_W, DRAW_H).data;
    const bits = new Uint8Array(DRAW_W * DRAW_H);
    for (let i = 0; i < bits.length; i++) bits[i] = img[i * 4 + 3] > 40 ? 1 : 0;
    return bits;
  }

  async function finishMessage() {
    const bits = drawToBits();
    const draw = bits ? FG.packDraw(DRAW_W, DRAW_H, bits) : null;
    try {
      const entry = await FG.db.add({
        bits: FG.bitsToStr(sess.bits), cols: S.cols, rows: S.rows, ts: Date.now(), name: sess.name,
        bg: FG.packBg(sess.bgMask ? FG.bitsToStr(sess.bgMask) : '', sess.tone, { shape: sess.shape, draw }),
      }, Number(S.numberStart) || 1);
      sess.entry = entry;
      archive.push(entry);
      tileSet = [];
      FG.bus.post({ type: 'entry', entry });
    } catch (e) {
      console.error(e); toast('저장하지 못했어요. 다시 눌러 주세요'); return;
    }
    go('thanks');
  }

  /* ───────── 감사 · 출력 ───────── */
  function drawThanks() {
    const cv = $('thanksName'), k = backing(cv, 760, 46), g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    const name = FG.cleanName(sess.name || '', 16) || 'GUEST';
    const cell = Math.min(5.7, 744 / FG.dotCols(name));
    FG.drawDotText(g, name, 0, 3, { cell, color: '#fff', shape: 'pixel', gap: Math.max(1, cell * 0.18) });
  }
  $('printBtn').addEventListener('click', async () => {
    const btn = $('printBtn');
    if (!sess.entry || btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    try {
      await FG.fontsReady;
      try { if (await Promise.race([FG.syncSettings(), FG.sleep(1500).then(() => false)])) applySettings(); } catch (e) { /* 그대로 */ }
      const cv = FG.renderReceipt(sess.entry, S);
      await FG.printCanvas(cv, S);
    } catch (err) {
      console.warn(err); toast('프린터에 닿지 않았어요. 게스트북에는 저장됐어요');
    }
    btn.classList.remove('busy');
    go('printed');
  });
  $('gbBtn').addEventListener('click', () => { location.href = 'wall.html?from=kiosk'; });

  /* 로고 누르면 처음 화면으로 */
  $('logo').addEventListener('click', () => { if (state !== 'main' && state !== 'boot' && state !== 'countdown') { audio.key(); go('main'); } });

  /* ───────── 실제 키보드 (시험용) ───────── */
  window.addEventListener('keydown', (e) => {
    if (state === 'name') {
      if (e.key === 'Backspace') { e.preventDefault(); nameKey('BACK'); }
      else if (e.key === 'Enter') { e.preventDefault(); nameKey('ENTER'); }
      else if (e.key && e.key.length === 1) { e.preventDefault(); nameKey(e.key.toUpperCase()); }
      return;
    }
    if (state === 'message') {
      if (e.key === 'Backspace') { e.preventDefault(); sess.strokes.pop(); redrawInk(); }
      else if (e.key === 'Enter') { e.preventDefault(); finishMessage(); }
      return;
    }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state === 'main') go('shape');
      else if (state === 'photo') shoot();
      else $('nextBtn').click();
    }
  });

  FG.bus.on((m) => {
    if (!m) return;
    if (m.type === 'settings') applySettings();
    if (m.type === 'entries-changed') refreshArchive();
  });

  /* ───────── 카메라 ───────── */
  let stream = null, camReady = false, camTimer = null;
  async function startCamera() {
    clearTimeout(camTimer);
    camReady = false;
    try {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('이 주소에서는 카메라를 쓸 수 없어요 (https 로 열어 주세요).');
      const v = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
      if (S.cameraId) v.deviceId = { exact: S.cameraId };
      try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
      catch (e) {
        if (!S.cameraId) throw e;
        delete v.deviceId;
        stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
      }
      video.srcObject = stream;
      await video.play();
      camReady = true;
      crop = null;
      if (state === 'boot' || state === 'error') go('main');
    } catch (e) {
      console.error(e);
      $('errMsg').textContent = '카메라 · ' + (e.message || e.name || e);
      if (state === 'boot' || state === 'error' || state === 'main') go('error');
      camTimer = setTimeout(startCamera, 5000);
    }
  }

  const rotCv = document.createElement('canvas');
  const rotCtx = rotCv.getContext('2d');
  function frameSource() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!camReady || !vw || !vh) return null;
    const rot = (((Number(S.rotate) || 0) % 360) + 360) % 360;
    if (!rot) return { el: video, w: vw, h: vh };
    const sw = rot % 180 ? vh : vw, sh = rot % 180 ? vw : vh;
    if (rotCv.width !== sw || rotCv.height !== sh) { rotCv.width = sw; rotCv.height = sh; }
    rotCtx.save();
    rotCtx.translate(sw / 2, sh / 2);
    rotCtx.rotate((rot * Math.PI) / 180);
    rotCtx.drawImage(video, -vw / 2, -vh / 2);
    rotCtx.restore();
    return { el: rotCv, w: sw, h: sh };
  }

  /* ───────── 얼굴 인식 ───────── */
  let faceReady = false, face = null, lastSrc = null;
  async function loadFace() {
    if (!window.faceapi) return;
    try {
      const tf = faceapi.tf;
      let ok = false;
      try { ok = await tf.setBackend('webgl'); } catch (e) { ok = false; }
      if (!ok) await tf.setBackend('cpu');
      await tf.ready();
      await faceapi.nets.tinyFaceDetector.loadFromUri('models');
      faceReady = true;
      detectLoop();
    } catch (e) {
      console.warn('얼굴 인식 모델을 불러오지 못했어요. 가운데 자르기로 동작합니다.', e);
    }
  }
  async function detectLoop() {
    const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 });
    for (;;) {
      const src = lastSrc;
      const live = state === 'shape' || state === 'photo' || state === 'countdown';
      if (!S.faceDetect || !camReady || !src || !live) { await FG.sleep(150); continue; }
      try {
        const dets = await faceapi.detectAllFaces(src.el, opt);
        let best = null, bestScore = 0;
        dets.forEach((d) => {
          const b = d.box;
          const cx = (b.x + b.width / 2) / src.w;
          const score = b.width * b.height * (1 - Math.min(0.6, Math.abs(cx - 0.5)));
          if (score > bestScore) { bestScore = score; best = b; }
        });
        if (best && best.width > src.w * 0.08) face = { x: best.x, y: best.y, w: best.width, h: best.height, t: performance.now(), sw: src.w, sh: src.h };
      } catch (e) { /* 프레임 건너뜀 */ }
      await FG.sleep(35);
    }
  }
  function faceFresh(now, ms) { return face && now - face.t < ms && lastSrc && face.sw === lastSrc.w; }

  /* ───────── 인물 분리 ───────── */
  let seg = null, segReady = false, segT = 0;
  const segCv = document.createElement('canvas');
  const segCtx = segCv.getContext('2d', { willReadFrequently: true });
  let segSrcW = 0;
  async function loadSeg() {
    if (!window.SelfieSegmentation) return;
    try {
      seg = new SelfieSegmentation({ locateFile: (f) => 'vendor/selfie/' + f });
      seg.setOptions({ modelSelection: 0, selfieMode: false });
      seg.onResults((res) => {
        const m = res.segmentationMask;
        if (!m) return;
        const w = 256, h = Math.round((256 * (lastSrc ? lastSrc.h : 9)) / (lastSrc ? lastSrc.w : 16));
        if (segCv.width !== w || segCv.height !== h) { segCv.width = w; segCv.height = h; }
        segCtx.clearRect(0, 0, w, h);
        segCtx.drawImage(m, 0, 0, w, h);
        segSrcW = lastSrc ? lastSrc.w : 0;
        segT = performance.now();
      });
      await seg.initialize();
      segReady = true;
      segLoop();
    } catch (e) {
      console.warn('인물 분리를 불러오지 못했어요.', e);
    }
  }
  async function segLoop() {
    for (;;) {
      const src = lastSrc;
      const live = state === 'shape' || state === 'photo' || state === 'countdown';
      if (!S.segment || !camReady || !src || frozen || !live) { await FG.sleep(120); continue; }
      try { await seg.send({ image: src.el }); } catch (e) { await FG.sleep(500); }
      await FG.sleep(30);
    }
  }
  function maskNow(now) {
    if (!S.segment || !segReady || !lastSrc || now - segT > 1500 || segSrcW !== lastSrc.w) return null;
    return { el: segCv, scale: segCv.width / lastSrc.w };
  }

  /* ───────── 자르기 ───────── */
  let crop = null;
  const FACE_HOLD = 4000;
  function targetCrop(src, now) {
    const ar = S.cols / S.rows;
    const z = Math.max(0.5, Math.min(2.5, Number(S.zoom) || 1));
    if (S.faceDetect && faceFresh(now, FACE_HOLD)) {
      const cw = (face.w * 1.6) / z, ch = cw / ar;
      const cx = face.x + face.w / 2, cy = face.y + face.h / 2;
      return { x: cx - cw / 2, y: cy - ch * 0.42, w: cw, h: ch };
    }
    let ch = (src.h * 0.92) / z, cw = ch * ar;
    if (cw > src.w) { cw = src.w; ch = cw / ar; }
    return { x: (src.w - cw) / 2, y: (src.h - ch) / 2, w: cw, h: ch };
  }
  function clampCrop(c, src) {
    let w = c.w, h = c.h;
    if (h > src.h) { const k = src.h / h; h = src.h; w *= k; }
    if (w > src.w) { const k = src.w / w; w = src.w; h *= k; }
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const x = Math.max(0, Math.min(src.w - w, cx - w / 2));
    const y = Math.max(0, Math.min(src.h - h, cy - h / 2));
    return { x, y, w, h };
  }
  function lerpRect(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k }; }
  function faceRel(now) {
    if (!crop || !faceFresh(now, FACE_HOLD)) return null;
    let x = (face.x - crop.x) / crop.w;
    const y = (face.y - crop.y) / crop.h, w = face.w / crop.w, h = face.h / crop.h;
    if (S.mirror) x = 1 - x - w;
    return { x, y, w, h };
  }

  async function refreshArchive() {
    try { archive = await FG.db.all(); } catch (e) { archive = []; }
    tileSet = [];
    drawFaces();
  }

  /* ───────── 촬영 ───────── */
  const pxr = new FG.Pixelizer();
  let busy = false, frozen = null, liveBits = null, lastRun = 0;
  function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  async function shoot() {
    if (busy) return;
    if (state !== 'photo' && state !== 'review') return;
    if (!camReady) { toast('카메라를 준비하고 있어요'); return; }
    const now0 = performance.now();
    if (S.requireFace && S.faceDetect && faceReady && !faceFresh(now0, 2500)) { toast('얼굴이 화면 가운데 오도록 서 주세요'); return; }
    busy = true;
    frozen = null; pxr.reset();
    try {
      go('countdown');
      const n0 = Math.max(1, Math.min(3, Number(S.countdown) | 0 || 3));
      const dg = $('digit');
      for (let n = n0; n >= 1; n--) {
        { const u = 'url("' + new URL('assets/ui/digit-' + n + '.svg', location.href).href + '")'; dg.style.webkitMaskImage = u; dg.style.maskImage = u; }
        dg.classList.add('on'); dg.classList.remove('tick'); void dg.offsetWidth; dg.classList.add('tick');
        audio.tick(n === 1);
        await FG.sleep(1000);
      }
      dg.classList.remove('on');
      const src = frameSource();
      const t = performance.now();
      const bits = src && crop ? pxr.run(src.el, crop, faceRel(t), S, false, maskNow(t)) : liveBits;
      sess.bits = bits;
      sess.bgMask = src && crop && pxr.lastBg ? Uint8Array.from(pxr.lastBg) : null;
      try { sess.tone = src && crop ? FG.toneGrid(src.el, crop, faceRel(t), S, maskNow(t)) : null; } catch (e) { sess.tone = null; }
      frozen = { bits, t0: performance.now() };
      flash();
      audio.shutter();
      go('review');
    } catch (e) {
      console.error(e); toast('문제가 생겼어요. 다시 눌러 주세요'); go('photo');
    } finally {
      busy = false;
    }
  }

  /* ───────── 그리기 반복 ───────── */
  let lastFrame = 0;
  function frame(now) { requestAnimationFrame(frame); tick(now); }
  setInterval(() => { const now = performance.now(); if (now - lastFrame > 250) tick(now); }, 100);
  function tick(now) {
    lastFrame = now;
    const src = frameSource();
    lastSrc = src;
    if (src && !frozen) { const t = targetCrop(src, now); crop = clampCrop(crop ? lerpRect(crop, t, 0.18) : t, src); }
    if (state === 'main' || state === 'boot' || state === 'error') return;

    let bits, reveal = null;
    if (frozen) {
      bits = frozen.bits;
      reveal = Math.max(0, Math.min(VIEW_ROWS, Math.floor(((now - frozen.t0 - 220) / 1500) * VIEW_ROWS)));
    } else if (src && crop) {
      if (!liveBits || now - lastRun > 30) { liveBits = pxr.run(src.el, crop, faceRel(now), S, true, maskNow(now)); lastRun = now; }
      bits = liveBits;
    } else {
      bits = FG.demoBits(S.cols, S.rows);
    }
    const vr = Math.min(S.rows, VIEW_ROWS);
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.fillStyle = '#000'; pctx.fillRect(0, 0, pix.width, pix.height);
    FG.drawPortrait(pctx, bits.subarray ? bits.subarray(0, S.cols * vr) : bits, S.cols, vr, 0, 0, pix.width, pix.height,
      { grid: true, shape: sess.shape === 'dot' ? 'dot' : 'square', colors: COLORS, reveal });
  }

  if (DEBUG) window.__kiosk = () => ({ state, camReady, faceReady, face, sess });

  /* ───────── 시작 ───────── */
  buildNameKeys();
  resetSession();
  applySettings();
  if (FG.cloud) {
    FG.syncSettings().then((ch) => { if (ch) applySettings(); });
    setInterval(async () => { if (await FG.syncSettings()) applySettings(); }, 15000);
  }
  window.addEventListener('resize', fit);
  fit();
  FG.enableFullscreenOnFirstInput();
  FG.autoHideCursor();
  FG.escToAdmin();
  go('boot');
  $('errMsg').textContent = '카메라를 켜는 중이에요';
  refreshArchive();
  if (FG.cloud) setInterval(() => { if (state === 'main') refreshArchive(); }, 60000);
  FG.fontsReady.then(sizeCanvases);
  startCamera();
  loadFace();
  loadSeg();
  requestAnimationFrame(frame);
})();
