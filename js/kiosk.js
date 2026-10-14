/* 게스트북 · 키오스크
   ?screen=both   위+아래 한 화면 (세로 모니터 한 대)
   ?screen=top    위 화면만 (카메라·촬영·저장·인쇄를 맡음)
   ?screen=bottom 아래 화면만 (안내·카운트다운, 위 화면 창과 자동으로 맞춰짐)
   ?debug         카메라 원본과 얼굴 인식 상자를 구석에 표시 */
(function () {
  'use strict';

  let S = FG.loadSettings();
  const P = new URLSearchParams(location.search);
  const SCREEN = ['both', 'top', 'bottom'].includes(P.get('screen')) ? P.get('screen') : 'both';
  const DEBUG = P.has('debug');
  const ENGINE = SCREEN !== 'bottom';
  document.body.dataset.screen = SCREEN;

  const $ = (id) => document.getElementById(id);
  const pix = $('pix');
  const pctx = pix.getContext('2d');
  const video = $('cam');
  const dbg = $('debug');

  let state = { state: 'boot', message: '카메라를 켜는 중이에요' };
  let count = 0;
  let archive = [];

  /* ───────── 설정 반영 ───────── */
  let lastCameraKey = null;
  function applySettings() {
    S = FG.loadSettings();
    FG.applyThemeVars(S);
    document.body.classList.toggle('no-screen-btn', !S.screenButton);
    document.body.classList.toggle('printer-left', S.printerSide === 'left');
    document.body.classList.toggle('printer-down', S.printerSide === 'down');
    bindTexts();
    sizeCanvas();
    const camKey = S.cameraId + '|' + S.rotate;
    if (ENGINE && lastCameraKey !== null && camKey !== lastCameraKey) startCamera();
    lastCameraKey = camKey;
  }
  function bindTexts() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const k = el.dataset.bind;
      if (k === 'count') el.textContent = FG.pad(count);
      else if (k === 'grid') el.textContent = S.cols + ' × ' + S.rows;
      else if (k === 'countdown') el.textContent = S.countdown;
      else el.textContent = S[k] || '';
    });
  }
  function sizeCanvas() {
    const r = $('top').getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ar = S.cols / S.rows;
    let w = r.width, h = w / ar;
    if (h > r.height) { h = r.height; w = h * ar; }
    const dpr = window.devicePixelRatio || 1;
    pix.style.width = Math.floor(w) + 'px';
    pix.style.height = Math.floor(h) + 'px';
    pix.width = Math.round(Math.floor(w) * dpr);
    pix.height = Math.round(Math.floor(h) * dpr);
  }

  /* ───────── 아래 화면 그리기 ───────── */
  const STEP_OF = { idle: 0, attract: 0, ready: 1, boot: 0, error: 0 };
  function render(st) {
    state = st;
    if (st.count != null) count = st.count;
    document.body.dataset.state = st.state;
    bindTexts();

    const on = STEP_OF[st.state] || 0;
    document.querySelectorAll('.steps li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('on', n === on);
      li.classList.toggle('done', on > 0 && n < on);
    });

    if (st.state === 'countdown') {
      const el = $('countBox');
      dotInto($('countNum'), el, String(st.n), 'center', true);
      requestAnimationFrame(() => dotInto($('countNum'), el, String(st.n), 'center', true));
      el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
      const last = st.n <= 1;
      $('countKo').textContent = last ? '웃어요' : '가만히 있어요';
      $('countEn').textContent = last ? 'Smile' : 'Hold still';
    }
    if (st.state === 'done') {
      dotInto($('doneNo'), $('doneNoBox'), 'NO ' + FG.pad(st.no), 'left', true);
      $('v-done').classList.toggle('noprint', !st.printed);
    }
    if (st.state === 'error' || st.state === 'boot') $('errMsg').textContent = st.message || '';
    if (st.state === 'name') drawNamePreview(st.name || '');
    if (st.state === 'idle' || st.state === 'ready' || st.state === 'attract') { dotInto($('pressWord'), $('pressBox'), 'PRESS', 'left', true); requestAnimationFrame(() => dotInto($('pressWord'), $('pressBox'), 'PRESS', 'left', true)); }
    if (st.state === 'done') drawDoneName(st.name || '');
  }

  /* ───────── 보행자 언어 글자 (숫자 · 번호) ───────── */
  function dotInto(cv, box, text, align, noGhost) {
    const r = { width: box.offsetWidth, height: box.offsetHeight }; // 애니메이션 확대와 무관한 실제 크기
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const t = FG.themeOf(S);
    const cell = Math.max(1, Math.floor(Math.min(cv.height / 7, cv.width / Math.max(1, FG.dotCols(text)))));
    const w = FG.dotCols(text) * cell;
    const opt = { cell, color: t.text, shape: S.nameShape, ghost: !noGhost && cell >= 6 ? 'color-mix(in srgb, ' + t.text + ' 10%, transparent)' : null };
    if (align === 'center') {
      // 가운데 정렬은 글자 간격 칸이 아니라 실제로 찍힌 점을 기준으로 맞춤 (숫자 1처럼 한쪽으로 치우친 글자도 정중앙)
      const tmp = document.createElement('canvas'); tmp.width = w + cell; tmp.height = 7 * cell;
      FG.drawDotText(tmp.getContext('2d'), text, 0, 0, Object.assign({}, opt, { ghost: null }));
      const d = tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height).data;
      let x0 = tmp.width, x1 = -1, y0 = tmp.height, y1 = -1;
      for (let yy = 0; yy < tmp.height; yy++) for (let xx = 0; xx < tmp.width; xx++) if (d[(yy * tmp.width + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 < 0) return;
      const ox = Math.round((cv.width - (x1 - x0 + 1)) / 2) - x0, oy = Math.round((cv.height - (y1 - y0 + 1)) / 2) - y0;
      FG.drawDotText(g, text, ox, oy, opt);
      return;
    }
    const x = align === 'right' ? cv.width - w : 0;
    FG.drawDotText(g, text, x, Math.round((cv.height - 7 * cell) / 2), opt);
  }

  /* ───────── 이름 (카 에스페란토 보행자 언어) ───────── */
  function sizeTo(cv, box) {
    const r = { width: box.offsetWidth, height: box.offsetHeight };
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    return dpr;
  }
  function drawNamePreview(name) {
    const cv = $('namePv'), box = $('namePvBox');
    sizeTo(cv, box);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const t = FG.themeOf(S);
    // 칸 크기는 고정(최대 글자 수 기준) — 칠 때마다 글자가 커졌다 작아졌다 하지 않게
    const max = Math.max(6, Math.min(16, Number(S.nameMax) || 12));
    const cell = Math.max(2, Math.floor(Math.min(cv.width / (Math.max(8, Math.min(max, name.length + 1)) * 6), cv.height / 8)));
    const y = Math.round((cv.height - 7 * cell) / 2);
    if (name) FG.drawDotText(g, name, 0, y, { cell, color: t.text, shape: S.nameShape });
    // 커서: 다음 글자 자리에 깜빡이는 막대
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      g.fillStyle = t.accent;
      g.fillRect(Math.round(name.length * 6 * cell), y, Math.round(cell * 0.9), 7 * cell);
    }
  }
  function drawDoneName(name) {
    const cv = $('doneName'), box = $('doneNameBox');
    sizeTo(cv, box);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!name) return;
    const cell = Math.max(2, Math.min(Math.floor(cv.height / 7), Math.floor(cv.width / FG.dotCols(name))));
    FG.drawDotText(g, name, 0, Math.round((cv.height - 7 * cell) / 2), { cell, color: FG.themeOf(S).text, shape: S.nameShape });
  }
  // 커서 깜빡임
  setInterval(() => { if (state.state === 'name') drawNamePreview(state.name || ''); }, 120);

  function buildKeyboard() {
    const kb = $('kbd');
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    kb.innerHTML = rows.map((r) => '<div class="row">' + r.split('').map((c) => `<button type="button" data-k="${c}">${c}</button>`).join('') + '</div>').join('') +
      '<div class="row"><button type="button" class="wide" data-k="BACK">지우기</button><button type="button" class="wide" data-k=" ">띄어쓰기</button><button type="button" class="wide ok" data-k="ENTER">완료</button></div>';
    kb.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      sendKey(b.dataset.k);
    });
  }
  buildKeyboard();
  function setState(st) {
    render(st);
    FG.bus.post({ type: 'state', st });
  }

  let toastTimer;
  function toast(text, local) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
    if (!local) FG.bus.post({ type: 'toast', text });
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
    return { unlock: ctx, tick: (last) => tone(last ? 1320 : 880, 0.13, 0.16), shutter };
  })();

  /* ───────── 입력 ───────── */
  function press() {
    audio.unlock();
    if (ENGINE) shoot(); else FG.bus.post({ type: 'press' });
  }
  function sendKey(k) {
    if (ENGINE) nameKey(k); else FG.bus.post({ type: 'key', k });
  }
  window.addEventListener('keydown', (e) => {
    if (state.state === 'name') {
      let k = null;
      if (e.key === 'Enter' || e.code === 'NumpadEnter') k = 'ENTER';
      else if (e.key === 'Backspace') k = 'BACK';
      else if (e.key && e.key.length === 1) k = e.key;
      else if (e.key === 'Process') { toast('영문으로 적어 주세요 (한/영 키)', true); e.preventDefault(); return; }
      if (k) { e.preventDefault(); if (!(e.repeat && k === 'ENTER')) sendKey(k); }
      return;
    }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); press(); }
  });
  ['top', 'bottom'].forEach((id) => $(id).addEventListener('pointerdown', () => { if (S.tapToShoot && state.state !== 'name') press(); }));
  // 화면 위 촬영 버튼
  $('shootBtn').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    const b = e.currentTarget; b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 160);
    press();
  });

  FG.bus.on((m) => {
    if (!m) return;
    if (m.type === 'settings') applySettings();
    if (ENGINE) {
      if (m.type === 'press') shoot();
      if (m.type === 'key') nameKey(m.k);
      if (m.type === 'hello') FG.bus.post({ type: 'state', st: state });
      if (m.type === 'entries-changed') refreshArchive();
    } else {
      if (m.type === 'state') render(m.st);
      if (m.type === 'toast') toast(m.text, true);
    }
  });

  if (!ENGINE) {
    applySettings();
  if (FG.cloud) {
    FG.syncSettings().then((ch) => { if (ch) applySettings(); });
    setInterval(async () => { if (await FG.syncSettings()) applySettings(); }, 15000);
  }
    render({ state: 'idle', count: 0 });
    FG.bus.post({ type: 'hello' });
    FG.enableFullscreenOnFirstInput();
    FG.autoHideCursor();
    FG.escToAdmin();
    window.addEventListener('resize', sizeCanvas);
    return; // 아래 화면 전용 창은 여기까지
  }

  /* ───────── 카메라 ───────── */
  let stream = null, camReady = false, camTimer = null;
  async function startCamera() {
    clearTimeout(camTimer);
    camReady = false;
    try {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('이 주소에서는 카메라를 쓸 수 없어요. start.command 로 열어 주세요 (http://localhost).');
      }
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
      if (!busy) setState({ state: 'idle', count });
    } catch (e) {
      console.error(e);
      setState({ state: 'error', count, message: '카메라 · ' + (e.message || e.name || e) });
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
      // 그래픽 가속(WebGL)이 안 되면 CPU로 계산 (조금 느리지만 동작)
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
      if (!S.faceDetect || !camReady || !src || (busy && state.state !== 'countdown')) { await FG.sleep(150); continue; }
      try {
        const dets = await faceapi.detectAllFaces(src.el, opt);
        let best = null, bestScore = 0;
        dets.forEach((d) => {
          const b = d.box;
          const cx = (b.x + b.width / 2) / src.w;
          const score = b.width * b.height * (1 - Math.min(0.6, Math.abs(cx - 0.5)));
          if (score > bestScore) { bestScore = score; best = b; }
        });
        if (best && best.width > src.w * 0.08) {
          face = { x: best.x, y: best.y, w: best.width, h: best.height, t: performance.now(), sw: src.w, sh: src.h };
        }
      } catch (e) { /* 프레임 건너뜀 */ }
      await FG.sleep(35);
    }
  }
  function faceFresh(now, ms) { return face && now - face.t < ms && lastSrc && face.sw === lastSrc.w; }
  function presentNow(now) {
    if (!camReady) return false;
    if (!S.faceDetect || !faceReady) return true;
    return faceFresh(now, 1500); // 느린 컴퓨터에서도 깜빡이지 않도록 여유
  }

  /* ───────── 인물 분리 (배경 지우기) ───────── */
  let seg = null, segReady = false, segBusy = false, segT = 0;
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
      console.warn('인물 분리를 불러오지 못했어요. 머리 모양 기준으로 배경을 어둡게 합니다.', e);
    }
  }
  async function segLoop() {
    for (;;) {
      const src = lastSrc;
      if (!S.segment || !camReady || !src || frozen) { await FG.sleep(120); continue; }
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
  const FACE_HOLD = 4000; // 얼굴을 잠깐 놓쳐도 4초 동안은 그 자리를 유지
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
  /* 자르는 범위가 카메라 화면 밖으로 나가지 않게 (밖은 비어 있어 흰 줄로 찍히던 문제) */
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

  /* ───────── 보관함 · 소개 모드 ───────── */
  async function refreshArchive() {
    try { archive = await FG.db.all(); } catch (e) { archive = []; }
    count = archive.length;
    attract = null;
    if (state.state !== 'countdown') render(Object.assign({}, state, { count }));
    FG.bus.post({ type: 'state', st: state });
  }
  let attract = null;
  function perm(n) { const p = new Uint32Array(n); for (let i = 0; i < n; i++) p[i] = i; for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; } return p; }
  function startAttract(now, fromBits) {
    const list = archive.filter((e) => e.cols === S.cols && e.rows === S.rows).slice(-80);
    if (!list.length) { attract = null; return false; }
    const n = S.cols * S.rows;
    attract = { list, i: list.length - 1, from: fromBits || new Uint8Array(n), to: FG.strToBits(list[list.length - 1].bits), t0: now, perm: perm(n) };
    return true;
  }
  function attractBits(now) {
    const a = attract, MORPH = 900, HOLD = 2800, n = S.cols * S.rows;
    const el = now - a.t0;
    if (el > MORPH + HOLD) {
      a.from = a.to;
      a.i = (a.i - 1 + a.list.length) % a.list.length;
      a.to = FG.strToBits(a.list[a.i].bits);
      a.t0 = now; a.perm = perm(n);
      return a.from;
    }
    if (el >= MORPH) return a.to;
    const k = Math.floor((el / MORPH) * n);
    const out = Uint8Array.from(a.from);
    for (let j = 0; j < k; j++) out[a.perm[j]] = a.to[a.perm[j]];
    return out;
  }

  /* 카메라가 없을 때 위 화면 */
  let errBits = null, errT = 0;
  function errorBits(now) {
    const n = S.cols * S.rows;
    if (!errBits || errBits.length !== n) errBits = FG.demoBits(S.cols, S.rows);
    if (now - errT > 180) {
      errT = now;
      const base = FG.demoBits(S.cols, S.rows);
      for (let i = 0; i < n; i++) errBits[i] = Math.random() < 0.03 ? 1 - base[i] : base[i];
    }
    return errBits;
  }

  /* ───────── 상태 흐름 ───────── */
  let lastSeen = 0;
  function updateIdle(now, liveBits) {
    if (busy || !camReady) return;
    if (presentNow(now)) {
      lastSeen = now;
      if (state.state !== 'ready') setState({ state: 'ready', count });
      return;
    }
    if (now - lastSeen < 1200) return;
    const wantAttract = archive.length && now - lastSeen > S.attractAfter * 1000;
    if (wantAttract) {
      if (state.state !== 'attract' && startAttract(now, liveBits)) setState({ state: 'attract', count });
    } else if (state.state !== 'idle' && state.state !== 'attract') {
      setState({ state: 'idle', count });
    }
  }

  /* ───────── 촬영 ───────── */
  const pxr = new FG.Pixelizer();
  let busy = false, frozen = null, liveBits = null, lastRun = 0;

  function flash() {
    const f = $('flash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  /* 이름 받기 */
  let naming = null; // { buf, resolve, timer }
  function nameIdle() {
    clearTimeout(naming.timer);
    naming.timer = setTimeout(() => finishName(), 45000); // 45초 동안 손대지 않으면 그대로 넘어감
  }
  function finishName() {
    if (!naming) return;
    clearTimeout(naming.timer);
    const n = naming;
    naming = null;
    n.resolve(n.buf.trim());
  }
  function nameKey(k) {
    if (!naming) return;
    nameIdle();
    if (k === 'ENTER') { finishName(); return; }
    const max = Math.max(4, Math.min(16, Number(S.nameMax) || 12));
    if (k === 'BACK') naming.buf = naming.buf.slice(0, -1);
    else {
      const next = FG.cleanName(naming.buf + k, max);
      if (next === naming.buf) {
        if (!FG.cleanName(k)) toast('영문 · 숫자만 적을 수 있어요');
        else if (naming.buf.length >= max) toast(max + '자까지 적을 수 있어요');
      }
      naming.buf = next;
    }
    audio.tick(false);
    setState({ state: 'name', name: naming.buf, count });
  }
  function askName() {
    return new Promise((resolve) => {
      naming = { buf: '', resolve, timer: null };
      nameIdle();
      setState({ state: 'name', name: '', count });
    });
  }

  async function shoot() {
    if (busy) return;
    const now = performance.now();
    if (now - lastFrame > 250) tick(now);
    if (!camReady) { toast('카메라를 준비하고 있어요'); return; }
    if (S.requireFace && S.faceDetect && faceReady && !faceFresh(now, 2500)) { toast('얼굴이 화면 가운데 오도록 서 주세요'); return; }
    busy = true;
    try {
      const n0 = Math.max(0, Math.min(10, Number(S.countdown) | 0));
      for (let n = n0; n >= 1; n--) {
        setState({ state: 'countdown', n, count });
        audio.tick(n === 1);
        await FG.sleep(1000);
      }
      const src = frameSource();
      const tnow = performance.now();
      const bits = src && crop ? pxr.run(src.el, crop, faceRel(tnow), S, false, maskNow(tnow)) : liveBits;
      const bgMask = src && crop && pxr.lastBg ? Uint8Array.from(pxr.lastBg) : null;
      let tone = null;
      try { tone = src && crop ? FG.toneGrid(src.el, crop, faceRel(tnow), S, maskNow(tnow)) : null; } catch (e) { console.warn('명암 격자를 만들지 못했어요', e); }
      frozen = { bits, t0: performance.now() };
      flash();
      audio.shutter();
      setState({ state: 'shoot', count });
      const ts = Date.now();

      let name = '';
      if (S.askName) { await FG.sleep(900); name = await askName(); }

      const entry = await FG.db.add({ bits: FG.bitsToStr(bits), bg: FG.packBg(bgMask ? FG.bitsToStr(bgMask) : '', tone), cols: S.cols, rows: S.rows, ts, name }, Number(S.numberStart) || 1);
      archive.push(entry);
      count = archive.length;
      FG.bus.post({ type: 'entry', entry });

      if (!S.askName) await FG.sleep(650);
      setState({ state: 'done', no: entry.no, count, printed: !!S.print, name });
      if (S.print) {
        await FG.fontsReady;
        const cv = FG.renderReceipt(entry, S);
        await FG.sleep(120);
        Promise.resolve(FG.printCanvas(cv, S)).catch((err) => { console.warn(err); toast('프린터에 닿지 않았어요. 게스트북에는 저장됐어요'); });
      }
      await FG.sleep(Math.max(3, Number(S.holdSeconds) || 8) * 1000);
    } catch (e) {
      console.error(e);
      toast('문제가 생겼어요. 다시 눌러 주세요');
    } finally {
      if (naming) { clearTimeout(naming.timer); naming = null; }
      frozen = null;
      pxr.reset();
      busy = false;
      lastSeen = performance.now();
      setState({ state: presentNow(performance.now()) ? 'ready' : 'idle', count });
    }
  }

  /* ───────── 그리기 반복 ───────── */
  function drawDebug(src, now) {
    if (!src) return;
    dbg.hidden = false;
    const w = 320, h = Math.round((320 * src.h) / src.w);
    if (dbg.width !== w) { dbg.width = w; dbg.height = h; }
    const c = dbg.getContext('2d');
    c.drawImage(src.el, 0, 0, w, h);
    const k = w / src.w;
    c.lineWidth = 2;
    if (crop) { c.strokeStyle = '#4af'; c.strokeRect(crop.x * k, crop.y * k, crop.w * k, crop.h * k); }
    if (faceFresh(now, 700)) { c.strokeStyle = '#ff4a2e'; c.strokeRect(face.x * k, face.y * k, face.w * k, face.h * k); }
    c.fillStyle = '#fff'; c.font = '12px monospace';
    c.fillText((faceReady ? 'face ok' : 'no face') + ' · ' + (maskNow(now) ? 'seg ok' : 'no seg') + ' · ' + state.state, 6, 14);
    if (maskNow(now)) { c.globalAlpha = 0.35; c.drawImage(segCv, 0, 0, w, h); c.globalAlpha = 1; }
  }

  /* 창이 가려져 그리기 반복(rAF)이 멈춰도 촬영 흐름은 이어지도록 보조 타이머를 둠 */
  let lastFrame = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    tick(now);
  }
  setInterval(() => { const now = performance.now(); if (now - lastFrame > 250) tick(now); }, 100);

  function tick(now) {
    lastFrame = now;
    const src = frameSource();
    lastSrc = src;
    if (src) {
      const t = targetCrop(src, now);
      if (!frozen) crop = clampCrop(crop ? lerpRect(crop, t, 0.18) : t, src);
    }

    let bits, reveal = null;
    if (frozen) {
      bits = frozen.bits;
      reveal = Math.max(0, Math.min(S.rows, Math.floor(((now - frozen.t0 - 220) / 1500) * S.rows)));
    } else if (state.state === 'attract' && attract) {
      bits = attractBits(now);
    } else if (src && crop) {
      if (!liveBits || now - lastRun > 30) { liveBits = pxr.run(src.el, crop, faceRel(now), S, true, maskNow(now)); lastRun = now; }
      bits = liveBits;
    } else {
      bits = errorBits(now);
    }

    const colors = FG.themeOf(S);
    pctx.fillStyle = colors.frame;
    pctx.fillRect(0, 0, pix.width, pix.height);
    FG.drawPortrait(pctx, bits, S.cols, S.rows, 0, 0, pix.width, pix.height, { grid: S.screenGrid, shape: S.shape, colors, reveal });

    updateIdle(now, liveBits);
    if (DEBUG) drawDebug(src, now);
  }

  if (DEBUG) window.__pxr = pxr;
  if (DEBUG) window.__seg = () => { const d = segCtx.getImageData(0, 0, segCv.width, segCv.height).data; let r = 0, a = 0, n = d.length / 4, a0 = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; a += d[i + 3]; if (d[i + 3] < 10) a0++; } return { w: segCv.width, h: segCv.height, r: r / n, a: a / n, a0: a0 / n }; };
  if (DEBUG) window.__kiosk = () => ({ state: state.state, faceAge: face ? performance.now() - face.t : null, lastFrameAge: performance.now() - lastFrame, camReady, faceReady, vis: document.visibilityState, paused: video.paused });

  /* ───────── 시작 ───────── */
  applySettings();
  if (FG.cloud) {
    FG.syncSettings().then((ch) => { if (ch) applySettings(); });
    setInterval(async () => { if (await FG.syncSettings()) applySettings(); }, 15000);
  }
  if (window.ResizeObserver) new ResizeObserver(sizeCanvas).observe($('top'));
  window.addEventListener('resize', sizeCanvas);
  FG.enableFullscreenOnFirstInput();
  FG.autoHideCursor();
  FG.escToAdmin();
  render(state);
  refreshArchive();
  if (FG.cloud) setInterval(() => { if (!busy) refreshArchive(); }, 60000);
  FG.fontsReady.then(sizeCanvas);
  startCamera();
  loadFace();
  loadSeg();
  requestAnimationFrame(frame);
})();
