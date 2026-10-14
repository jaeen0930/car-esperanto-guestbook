/* 게스트북 · 공통 모듈
   설정 · 저장소(IndexedDB) · 창 사이 통신 · 픽셀 변환 · 그리기 · 영수증 · 인쇄 */
(function () {
  'use strict';
  const FG = (window.FG = {});

  /* ───────── 설정 ───────── */
  FG.DEFAULTS = {
    v: 10,                   // 설정 버전 (얼굴 변환 기본값이 바뀌면 올림)
    title: 'CAR ESPERANTO',
    subtitle: '2026 DEGREE EXHIBITION\nUX DEGREE',
    askName: true,          // 찍은 뒤 이름 받기
    nameMax: 12,
    label: '게스트북',
    thanks: '소중한 시간을 내어 방문해 주셔서 진심으로 감사합니다.',
    thanksEn: 'Thank you for taking the time to visit us.',
    printerSide: 'right',   // 프린터가 아래 화면의 어느 쪽에 있나 (화살표 방향)
    printMode: 'browser',   // browser: 브라우저 인쇄 창(크롬 --kiosk-printing 이면 자동) · epos: 엡손 영수증 프린터로 바로(아이패드용)
    eposHost: '',           // 엡손 프린터 주소 (예: 192.168.0.50)
    cols: 24,
    rows: 32,
    shape: 'square',        // 점 모양 하나로: square(네모) | dot(동그라미) — 위 화면 픽셀과 영수증 얼굴 망점에 같이 씀
    theme: 'mono',          // mono | blue | paper
    screenGrid: true,       // 화면 픽셀 사이 격자선
    countdown: 3,
    holdSeconds: 8,
    darkPct: 0.32,          // 얼굴 안에서 검게 칠할 비율
    detail: 0.8,            // 이목구비 강조
    bias: 0,                // 밝기 기준 미세 보정 (화면에는 안 보임)
    bgDarken: 0.85,         // 사람 밖 배경 어둡게 (0 ~ 1)
    segment: true,          // 인물 분리로 배경 정리
    bgMode: 'white',        // 배경 칸: white | black
    cleanup: true,          // 외톨이 점 정리
    invert: false,
    mirror: true,
    rotate: 0,              // 카메라 회전 0 | 90 | 180 | 270
    zoom: 1,                // 얼굴 크기 (1 = 기본)
    faceDetect: true,
    requireFace: true,
    attractAfter: 12,
    cameraId: '',
    tapToShoot: false,      // 화면 아무 곳이나 눌러도 촬영
    screenButton: true,     // 아래 화면에 촬영 버튼 표시
    sound: true,
    print: true,
    paper: 80,              // 58 | 80 mm
    copies: 1,
    receiptGrid: false,
    numberStart: 1,
    wallHeader: true,
    wallMinSlots: 24,
    wallTwinkle: true,
  };

  FG.THEMES = {
    mono:  { name: '흑백',  frame: '#000000', off: '#0b0b0b', on: '#f2f1ec', line: '#262626', panel: '#0b0b0b', text: '#f2f1ec', dim: '#6c6b66', accent: '#ff0026', wall: '#141414', slot: '#1f1f1f' },
    blue:  { name: '블루',  frame: '#121126', off: '#1d1b3b', on: '#cddfff', line: '#38375f', panel: '#1d1b3b', text: '#cddfff', dim: '#7076a8', accent: '#ff5a3c', wall: '#16152e', slot: '#24224a' },
    paper: { name: '종이',  frame: '#d8d5cd', off: '#161616', on: '#f5f3ed', line: '#3b3b3b', panel: '#ece9e2', text: '#151515', dim: '#8b877d', accent: '#e8401f', wall: '#d8d5cd', slot: '#c9c5bb' },
  };

  const KEY = 'face-guestbook.settings';
  FG.loadSettings = function () {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    // 예전 버전에서 저장된 얼굴 변환 값은 새 기본값으로 교체
    if ((saved.v || 1) < 5) { delete saved.darkPct; delete saved.detail; delete saved.bgDarken; delete saved.zoom; }
    if ((saved.v || 1) < 6) delete saved.tapToShoot;
    if ((saved.v || 1) < 8) delete saved.thanksEn;
    if ((saved.v || 1) < 9) delete saved.receiptBg; // 줄무늬를 기본으로
    if ((saved.v || 1) < 10) {                         // 겹치던 설정 셋을 '점 모양' 하나로
      if (saved.receiptStyle === 'squares') saved.shape = 'square';
      delete saved.receiptStyle; delete saved.nameShape; delete saved.receiptBg;
    }
    if ((saved.v || 1) < 7) { delete saved.thanks; delete saved.thanksEn; if (saved.label === '얼굴 ' + '방명록') delete saved.label; }
    if ((saved.v || 1) < 5 && (saved.subtitle === 'Degree Show 2026' || saved.subtitle === '2026 한동대학교 디그리')) delete saved.subtitle;
    saved.v = FG.DEFAULTS.v;
    return Object.assign({}, FG.DEFAULTS, saved);
  };
  /* 설정도 웹에 두면 키오스크 · 벽 · 관리 기기가 같은 설정을 써요 */
  FG.syncSettings = async function () {
    if (!FG.cloud) return false;
    try { if (Date.now() - Number(localStorage.getItem(KEY + '.savedAt') || 0) < 20000) return false; } catch (e) { /* 없음 */ }
    try {
      const data = await FG.cloud.getSettings();
      if (!data) return false;
      const cur = localStorage.getItem(KEY);
      const next = JSON.stringify(data);
      if (cur !== next) { localStorage.setItem(KEY, next); return true; }
    } catch (e) { /* 연결 안 됨: 이 기기 설정 그대로 */ }
    return false;
  };
  FG.saveSettings = function (s) {
    if (FG.cloud) FG.cloud.saveSettings(s).catch((e) => console.warn('설정을 웹에 저장하지 못했어요', e));
    try { localStorage.setItem(KEY, JSON.stringify(s)); localStorage.setItem(KEY + '.savedAt', String(Date.now())); } catch (e) { /* 저장 불가 환경 */ }
    FG.bus.post({ type: 'settings' });
  };
  FG.themeOf = (s) => FG.THEMES[s.theme] || FG.THEMES.mono;
  FG.applyThemeVars = function (s, el) {
    const t = FG.themeOf(s);
    const root = el || document.documentElement;
    Object.keys(t).forEach((k) => { if (k !== 'name') root.style.setProperty('--' + k, t[k]); });
  };

  /* ───────── 창 사이 통신 ───────── */
  FG.bus = (function () {
    let ch = null;
    const handlers = [];
    try { ch = new BroadcastChannel('face-guestbook'); } catch (e) { ch = null; }
    if (ch) ch.onmessage = (e) => handlers.forEach((h) => { try { h(e.data); } catch (err) { console.error(err); } });
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) handlers.forEach((h) => h({ type: 'settings' }));
    });
    return {
      post(m) { if (ch) ch.postMessage(m); },
      on(h) { handlers.push(h); },
    };
  })();

  /* ───────── 저장소 ───────── */
  const localDb = (function () {
    let opening = null;
    function open() {
      if (opening) return opening;
      opening = new Promise((res, rej) => {
        const r = indexedDB.open('face-guestbook', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('entries')) d.createObjectStore('entries', { keyPath: 'no' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return opening;
    }
    function run(mode, fn) {
      return open().then((d) => new Promise((res, rej) => {
        const t = d.transaction('entries', mode);
        const st = t.objectStore('entries');
        let out;
        fn(st, (v) => { out = v; });
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }));
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* 무시 */ }
    return {
      all() { return run('readonly', (st, set) => { const r = st.getAll(); r.onsuccess = () => set(r.result.sort((a, b) => a.no - b.no)); }); },
      count() { return run('readonly', (st, set) => { const r = st.count(); r.onsuccess = () => set(r.result); }); },
      last() { return run('readonly', (st, set) => { const r = st.openCursor(null, 'prev'); r.onsuccess = () => set(r.result ? r.result.value : null); }); },
      add(data, start) {
        return run('readwrite', (st, set) => {
          const c = st.openCursor(null, 'prev');
          c.onsuccess = () => {
            const max = c.result ? c.result.value.no : 0;
            const entry = Object.assign({}, data, { no: Math.max(max + 1, start || 1) });
            st.put(entry);
            set(entry);
          };
        });
      },
      put(entry) { return run('readwrite', (st) => { st.put(entry); }); },
      remove(no) { return run('readwrite', (st) => { st.delete(no); }); },
      clear() { return run('readwrite', (st) => { st.clear(); }); },
    };
  })();

  /* ───────── 웹 저장소 (Supabase) ─────────
     config.js 에 주소와 키가 있으면 모든 기록을 웹 데이터베이스에 저장해요.
     인터넷이 잠깐 끊기면 이 기기에 모아 뒀다가 다시 연결되면 올려요. */
  const CFG = window.GUESTBOOK_CONFIG || {};
  FG.cloud = (function () {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return null;
    const base = String(CFG.supabaseUrl).replace(/\/$/, '') + '/rest/v1/';
    // 새 publishable 키(sb_publishable_…)는 apikey 헤더로만, 예전 anon 키(eyJ…)는 Authorization 에도 넣음
    const H = { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(CFG.supabaseKey)) H.Authorization = 'Bearer ' + CFG.supabaseKey;
    const req = async (path, opt) => {
      const r = await fetch(base + path, Object.assign({ headers: H }, opt || {}, { headers: Object.assign({}, H, (opt && opt.headers) || {}) }));
      if (!r.ok) throw new Error('cloud ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const t = await r.text();
      return t ? JSON.parse(t) : null;
    };
    const toRow = (e) => ({ no: e.no, ts: e.ts, name: e.name || '', cols: e.cols, rows: e.rows, bits: e.bits, bg: e.bg || null });
    const fromRow = (r) => ({ no: r.no, ts: Number(r.ts), name: r.name || '', cols: r.cols, rows: r.rows, bits: r.bits, bg: r.bg || undefined });
    return {
      async all() { return (await req('entries?select=no,ts,name,cols,rows,bits,bg&order=no.asc&limit=100000')).map(fromRow); },
      async since(no) { return (await req('entries?select=no,ts,name,cols,rows,bits,bg&order=no.asc&no=gt.' + (no | 0))).map(fromRow); },
      async maxNo() { const r = await req('entries?select=no&order=no.desc&limit=1'); return r && r[0] ? r[0].no : 0; },
      async insert(e) { await req('entries', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(toRow(e)) }); },
      async upsert(e) { await req('entries', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(toRow(e)) }); },
      async remove(no) { await req('entries?no=eq.' + (no | 0), { method: 'DELETE' }); },
      async clear() { await req('entries?no=gte.0', { method: 'DELETE' }); },
      async getSettings() { const r = await req('settings?id=eq.main&select=data'); return r && r[0] ? r[0].data : null; },
      async saveSettings(data) { await req('settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'main', data }) }); },
    };
  })();

  /* 올리지 못한 기록 (인터넷 끊김) */
  const PKEY = 'face-guestbook.pending';
  const pending = {
    get() { try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch (e) { return []; } },
    set(a) { try { localStorage.setItem(PKEY, JSON.stringify(a)); } catch (e) { /* 무시 */ } },
  };
  async function flushPending() {
    if (!FG.cloud) return;
    const list = pending.get();
    if (!list.length) return;
    const left = [];
    for (const e of list) { try { await FG.cloud.upsert(e); } catch (err) { left.push(e); } }
    pending.set(left);
  }
  if (FG.cloud) { setInterval(flushPending, 20000); setTimeout(flushPending, 3000); }

  FG.db = FG.cloud ? {
    async all() {
      try {
        const list = await FG.cloud.all();
        const pend = pending.get().filter((p) => !list.some((x) => x.no === p.no));
        return list.concat(pend).sort((a, b) => a.no - b.no);
      } catch (e) { console.warn('웹 저장소에 닿지 않아 이 기기 기록을 보여 줘요', e); return localDb.all(); }
    },
    async count() { return (await this.all()).length; },
    async last() { const a = await this.all(); return a[a.length - 1] || null; },
    async since(no) { try { return await FG.cloud.since(no); } catch (e) { return []; } },
    async add(data, start) {
      // 번호는 웹 기준 마지막 번호 + 1. 다른 기기와 겹치면 다음 번호로 다시 시도.
      let base = 0;
      try { base = await FG.cloud.maxNo(); } catch (e) { base = Math.max(0, ...(await localDb.all()).map((x) => x.no), ...pending.get().map((x) => x.no)); }
      let no = Math.max(base + 1, start || 1);
      for (let i = 0; i < 5; i++) {
        const entry = Object.assign({}, data, { no });
        try { await FG.cloud.insert(entry); localDb.put(entry).catch(() => {}); return entry; }
        catch (err) {
          if (/ 409 /.test(String(err.message)) || /duplicate/i.test(String(err.message))) { no++; continue; }
          // 인터넷 끊김: 이 기기에 두고 나중에 올림
          pending.set(pending.get().concat([entry]));
          localDb.put(entry).catch(() => {});
          return entry;
        }
      }
      const entry = Object.assign({}, data, { no });
      pending.set(pending.get().concat([entry]));
      return entry;
    },
    async put(entry) { await localDb.put(entry).catch(() => {}); await FG.cloud.upsert(entry); },
    async remove(no) { pending.set(pending.get().filter((p) => p.no !== no)); await localDb.remove(no).catch(() => {}); await FG.cloud.remove(no); },
    async clear() { pending.set([]); await localDb.clear().catch(() => {}); await FG.cloud.clear(); },
  } : Object.assign({ async since(no) { return (await localDb.all()).filter((e) => e.no > no); } }, localDb);
  FG.storageLabel = FG.cloud ? '웹 저장소' : '이 컴퓨터';

  /* ───────── 비트 ───────── */
  FG.bitsToStr = (bits) => Array.prototype.map.call(bits, (b) => (b ? '1' : '0')).join('');
  FG.strToBits = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) === 49 ? 1 : 0; return a; };
  FG.pad = (n, w) => String(n).padStart(w || 4, '0');

  /* 보관함이 비었을 때 미리보기용 얼굴 (24×32 기준으로 그린 추상 초상) */
  FG.demoBits = function (cols, rows) {
    cols = cols || 24; rows = rows || 32;
    const b = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols, y = (r + 0.5) / rows;
        const head = ((x - 0.5) / 0.27) ** 2 + ((y - 0.43) / 0.27) ** 2 < 1;
        const neck = Math.abs(x - 0.5) < 0.1 && y > 0.66 && y < 0.8;
        const body = y > 0.78 && ((x - 0.5) / 0.48) ** 2 + ((y - 1.08) / 0.32) ** 2 < 1;
        const hair = y < 0.33 && ((x - 0.5) / 0.3) ** 2 + ((y - 0.36) / 0.26) ** 2 < 1 && y < 0.24 + Math.abs(x - 0.5) * 0.3;
        const eyeL = ((x - 0.39) / 0.05) ** 2 + ((y - 0.42) / 0.022) ** 2 < 1;
        const eyeR = ((x - 0.61) / 0.05) ** 2 + ((y - 0.42) / 0.022) ** 2 < 1;
        const brow = y > 0.36 && y < 0.38 && (Math.abs(x - 0.39) < 0.07 || Math.abs(x - 0.61) < 0.07);
        const nose = Math.abs(x - 0.52) < 0.025 && y > 0.47 && y < 0.53;
        const mouth = y > 0.575 && y < 0.6 && Math.abs(x - 0.5) < 0.09;
        let v = (head || neck || body) ? 1 : 0;
        if (hair || eyeL || eyeR || brow || nose || mouth) v = 0;
        if (y > 0.82 && Math.abs(x - 0.5) < 0.06) v = 0;
        b[r * cols + c] = v;
      }
    }
    return b;
  };

  /* ───────── 픽셀 변환 ───────── */
  function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function boxBlur(src, cols, rows, rad) {
    const out = new Float32Array(src.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let acc = 0, n = 0;
        for (let y = Math.max(0, r - rad); y <= Math.min(rows - 1, r + rad); y++) {
          for (let x = Math.max(0, c - rad); x <= Math.min(cols - 1, c + rad); x++) { acc += src[y * cols + x]; n++; }
        }
        out[r * cols + c] = acc / n;
      }
    }
    return out;
  }

  function otsu(vals) {
    const hist = new Float64Array(256);
    let n = 0;
    for (let i = 0; i < vals.length; i++) { hist[Math.max(0, Math.min(255, vals[i] | 0))]++; n++; }
    if (!n) return 128;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; th = t; }
    }
    return th;
  }

  /* 한 장면(이미지 요소 + 자르기 범위)을 cols×rows 비트로 바꿉니다.
     face: 자르기 안에서의 얼굴 위치 {x,y,w,h} (0~1), 없으면 가운데로 가정
     prevGray: 실시간 미리보기 깜빡임을 줄이는 이전 프레임 값 */
  FG.Pixelizer = function () {
    const SS = 4; // 칸 하나당 4×4 표본
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let ema = null;
    const mcv = document.createElement('canvas');
    const mctx = mcv.getContext('2d', { willReadFrequently: true });

    this.reset = () => { ema = null; };

    /* 사람 영역 확률 (0~1) — mask: { el: 캔버스, scale: 원본 대비 배율 } */
    function personMap(mask, crop, cols, rows, mirror) {
      const W = cols * 2, H = rows * 2;
      if (mcv.width !== W || mcv.height !== H) { mcv.width = W; mcv.height = H; }
      mctx.save();
      mctx.clearRect(0, 0, W, H);
      mctx.imageSmoothingEnabled = true;
      if (mirror) { mctx.translate(W, 0); mctx.scale(-1, 1); }
      const k = mask.scale;
      try { mctx.drawImage(mask.el, crop.x * k, crop.y * k, crop.w * k, crop.h * k, 0, 0, W, H); } catch (e) { mctx.restore(); return null; }
      mctx.restore();
      const d = mctx.getImageData(0, 0, W, H).data;
      // 마스크가 알파에 담겨 오는지, 빨강에 담겨 오는지 자동 판별
      let aVar = false;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { aVar = true; break; }
      const out = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let acc = 0;
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
          const p = ((r * 2 + y) * W + c * 2 + x) * 4;
          acc += aVar ? d[p + 3] : d[p];
        }
        out[r * cols + c] = acc / (4 * 255);
      }
      return out;
    }

    this.run = function (src, crop, face, s, smooth, mask) {
      const cols = s.cols, rows = s.rows;
      const W = cols * SS, H = rows * SS;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; ema = null; }
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (s.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      try { ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H); } catch (e) { /* 아직 준비 안 됨 */ }
      ctx.restore();
      const data = ctx.getImageData(0, 0, W, H).data;

      const gray = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let acc = 0;
          for (let y = 0; y < SS; y++) {
            let p = ((r * SS + y) * W + c * SS) * 4;
            for (let x = 0; x < SS; x++, p += 4) acc += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
          }
          gray[r * cols + c] = acc / (SS * SS);
        }
      }

      if (smooth) {
        if (!ema || ema.length !== gray.length) ema = Float32Array.from(gray);
        else for (let i = 0; i < gray.length; i++) ema[i] = ema[i] * 0.45 + gray[i] * 0.55;
        gray.set(ema);
      }

      const f = face || { x: 0.32, y: 0.24, w: 0.36, h: 0.4 };
      const fx = f.x + f.w / 2, fy = f.y + f.h / 2;

      // ① 세부 강조: 주변 평균보다 밝은 곳은 더 밝게, 어두운 곳은 더 어둡게 (눈·코·입 살리기)
      const amt = s.detail == null ? 0.8 : Number(s.detail);
      if (amt > 0) {
        const blur = boxBlur(gray, cols, rows, 2);
        for (let i = 0; i < gray.length; i++) gray[i] = gray[i] + amt * (gray[i] - blur[i]);
      }

      // ② 얼굴 안쪽(눈·코·입이 있는 좁은 타원) 값으로 밝기 범위를 맞춤
      //    조명·피부색·역광과 상관없이 얼굴 기준으로 같은 결과
      const inner = (x, y) => Math.hypot((x - fx) / (f.w * 0.36), (y - (fy + f.h * 0.04)) / (f.h * 0.44)) < 1;
      const faceVals = [];
      const faceMask = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (inner((c + 0.5) / cols, (r + 0.5) / rows)) { faceVals.push(gray[r * cols + c]); faceMask[r * cols + c] = 1; }
        }
      }
      const ref = faceVals.length > 10 ? faceVals : Array.from(gray);
      const sorted = Float32Array.from(ref).sort();
      const pct = (p) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];
      const lo = pct(0.03), hi = pct(0.97);
      const span = Math.max(20, hi - lo);
      // 얼굴보다 훨씬 밝은 배경(창문·흰 벽)은 255에서 잘라 냄
      for (let i = 0; i < gray.length; i++) gray[i] = Math.max(-40, Math.min(255, ((gray[i] - lo) / span) * 255));

      // ③ 배경: 사람 영역(인물 분리)이 있으면 그걸로, 없으면 머리+어깨 모양으로 사람 밖을 정함
      //    bgMode 'white' = 배경을 흰 칸으로(레퍼런스처럼 머리카락 윤곽이 살아남), 'black' = 검은 칸으로
      const k = Math.max(0, Math.min(1, s.bgDarken));
      const person = mask && mask.el ? personMap(mask, crop, cols, rows, s.mirror) : null;
      const bgw = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (person) { bgw[i] = 1 - smoothstep(0.3, 0.7, person[i]); continue; }
          const x = (c + 0.5) / cols, y = (r + 0.5) / rows;
          const below = y > fy;
          const rx = below ? f.w * 1.35 : f.w * 0.8;
          const ry = below ? f.h * 2.4 : f.h * 0.98;
          const d = Math.hypot((x - fx) / rx, (y - (fy - (below ? 0 : f.h * 0.08))) / ry);
          bgw[i] = smoothstep(1.05, 1.5, d);
        }
      }
      const bgWhite = (s.bgMode || 'white') === 'white';

      // ④ 문턱값: 얼굴 안쪽에서 어두운 쪽 몇 %를 검게 (기본 30%)
      const darkPct = s.darkPct == null ? 0.32 : Number(s.darkPct);
      const fvals = [];
      for (let i = 0; i < gray.length; i++) if (faceMask[i]) fvals.push(gray[i]);
      let th;
      if (s.algo === 'otsu') th = otsu(fvals.length > 10 ? fvals : Array.from(gray));
      else {
        const fv = Float32Array.from(fvals.length > 10 ? fvals : Array.from(gray)).sort();
        th = fv[Math.max(0, Math.min(fv.length - 1, Math.round(darkPct * (fv.length - 1))))];
      }
      th += Number(s.bias) || 0;

      let bits = new Uint8Array(cols * rows);
      for (let i = 0; i < bits.length; i++) bits[i] = gray[i] > th ? 1 : 0;

      // ⑤ 이목구비: 얼굴 둘레 안에서 주변(5 × 5 칸)보다 어두운 곳은 검게 — 눈썹 · 눈 · 콧날 그림자 · 입
      const loc = boxBlur(gray, cols, rows, 2);
      const feat = Math.max(4, 26 - 14 * Math.min(1.5, amt));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c + 0.5) / cols, y = (r + 0.5) / rows;
          if (Math.hypot((x - fx) / (f.w * 0.58), (y - (fy - f.h * 0.04)) / (f.h * 0.66)) > 1) continue;
          const i = r * cols + c;
          if (gray[i] < loc[i] - feat) bits[i] = 0;
        }
      }

      // ⑥ 배경 칸 정리 (어느 칸이 배경인지도 남김 · 영수증 배경 무늬용)
      const bgBits = new Uint8Array(cols * rows);
      if (k > 0) for (let i = 0; i < bits.length; i++) if (bgw[i] * k > 0.5) { bits[i] = bgWhite ? 1 : 0; bgBits[i] = 1; }
      this.lastBg = k > 0 ? bgBits : null;

      if (s.cleanup) {
        const out = Uint8Array.from(bits);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const i = r * cols + c, v = bits[i];
            let same = 0, n = 0;
            if (r > 0) { n++; if (bits[i - cols] === v) same++; }
            if (r < rows - 1) { n++; if (bits[i + cols] === v) same++; }
            if (c > 0) { n++; if (bits[i - 1] === v) same++; }
            if (c < cols - 1) { n++; if (bits[i + 1] === v) same++; }
            if (n === 4 && same === 0) out[i] = v ? 0 : 1;
          }
        }
        bits = out;
      }
      if (s.invert) for (let i = 0; i < bits.length; i++) bits[i] = bits[i] ? 0 : 1;
      this.debug = { gray, faceMask, th, face: f, person, bgw };
      return bits;
    };
  };

  /* 망점 영수증용 명암 격자: 0(흰) ~ 15(검정). 배경(사람 밖)은 0.
     픽셀 얼굴과 같은 화면 영역을 더 촘촘한 격자로 읽어요. */
  FG.TONE = { cols: 45, rows: 60 };
  FG.toneGrid = function (src, crop, face, s, mask, cols, rows) {
    cols = cols || FG.TONE.cols; rows = rows || FG.TONE.rows;
    const SS = 4, W = cols * SS, H = rows * SS;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save(); if (s.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    try { ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H); } catch (e) { return null; }
    ctx.restore();
    const d = ctx.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let acc = 0;
      for (let y = 0; y < SS; y++) { let p = ((r * SS + y) * W + c * SS) * 4; for (let x = 0; x < SS; x++, p += 4) acc += 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]; }
      gray[r * cols + c] = acc / (SS * SS);
    }
    const amt = s.detail == null ? 0.8 : Number(s.detail);
    if (amt > 0) { const b = boxBlur(gray, cols, rows, 2); for (let i = 0; i < gray.length; i++) gray[i] += amt * 0.8 * (gray[i] - b[i]); }
    const f = face || { x: 0.32, y: 0.24, w: 0.36, h: 0.4 };
    const fx = f.x + f.w / 2, fy = f.y + f.h / 2;
    const vals = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.hypot(((c + 0.5) / cols - fx) / (f.w * 0.42), ((r + 0.5) / rows - fy) / (f.h * 0.5)) < 1) vals.push(gray[r * cols + c]);
    }
    const ref = Float32Array.from(vals.length > 10 ? vals : gray).sort();
    const pct = (q) => ref[Math.max(0, Math.min(ref.length - 1, Math.round(q * (ref.length - 1))))];
    const lo = pct(0.02), hi = pct(0.98), span = Math.max(20, hi - lo);
    let person = null;
    if (mask && mask.el) {
      const mc = document.createElement('canvas'); mc.width = cols; mc.height = rows;
      const mx = mc.getContext('2d', { willReadFrequently: true });
      mx.save(); if (s.mirror) { mx.translate(cols, 0); mx.scale(-1, 1); }
      try { mx.drawImage(mask.el, crop.x * mask.scale, crop.y * mask.scale, crop.w * mask.scale, crop.h * mask.scale, 0, 0, cols, rows); } catch (e) { /* 없음 */ }
      mx.restore();
      const md = mx.getImageData(0, 0, cols, rows).data;
      let aVar = false; for (let i = 3; i < md.length; i += 4) if (md[i] < 250) { aVar = true; break; }
      person = new Float32Array(cols * rows);
      for (let i = 0; i < person.length; i++) person[i] = (aVar ? md[i * 4 + 3] : md[i * 4]) / 255;
    }
    const out = new Uint8Array(cols * rows);
    const bgOn = (s.bgDarken == null ? 0.85 : Number(s.bgDarken)) > 0;
    for (let i = 0; i < out.length; i++) {
      const g = Math.max(0, Math.min(1, (gray[i] - lo) / span));
      let dark = Math.pow(1 - g, 1.15);
      if (person && bgOn) dark *= smoothstep(0.25, 0.65, person[i]);
      out[i] = Math.max(0, Math.min(15, Math.round(dark * 15)));
    }
    return { cols, rows, data: out };
  };
  /* 배경 칸 표시와 명암 격자를 bg 한 칸에 함께 저장: "0101…|t36x48:0f3a…" (DB 구조는 그대로) */
  FG.packBg = function (maskStr, tone) {
    let out = maskStr || '';
    if (tone) out += '|t' + tone.cols + 'x' + tone.rows + ':' + Array.prototype.map.call(tone.data, (v) => v.toString(16)).join('');
    return out || undefined;
  };
  FG.toneOf = function (entry) {
    if (entry.tone && entry.tone.data) return entry.tone;
    const m = typeof entry.bg === 'string' && entry.bg.match(/\|t(\d+)x(\d+):([0-9a-f]+)/);
    if (!m) return null;
    const cols = +m[1], rows = +m[2], hex = m[3];
    if (hex.length !== cols * rows) return null;
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < data.length; i++) data[i] = parseInt(hex[i], 16);
    return { cols, rows, data };
  };

  /* ───────── 그리기 ───────── */
  /* opt: { grid, shape, reveal(보이는 줄 수), colors{on,off,line} } */
  FG.drawPortrait = function (ctx, bits, cols, rows, x, y, w, h, opt) {
    const col = opt.colors;
    const xs = new Array(cols + 1), ys = new Array(rows + 1);
    for (let c = 0; c <= cols; c++) xs[c] = Math.round(x + (w * c) / cols);
    for (let r = 0; r <= rows; r++) ys[r] = Math.round(y + (h * r) / rows);
    const cell = Math.min(w / cols, h / rows);
    const gap = opt.grid ? Math.max(1, Math.round(cell * 0.07)) : 0;
    const reveal = opt.reveal == null ? rows : opt.reveal;
    const dot = opt.shape === 'dot';

    ctx.fillStyle = dot ? col.off : (opt.grid ? col.line : col.off);
    ctx.fillRect(xs[0], ys[0], xs[cols] - xs[0], ys[rows] - ys[0]);

    if (dot) {
      const rad = cell * 0.47;
      if (opt.grid) {
        ctx.fillStyle = col.line;
        ctx.beginPath();
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (r < reveal && bits[r * cols + c]) continue;
          const cx = (xs[c] + xs[c + 1]) / 2, cy = (ys[r] + ys[r + 1]) / 2;
          ctx.moveTo(cx + rad * 0.22, cy); ctx.arc(cx, cy, rad * 0.22, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.fillStyle = col.on;
      ctx.beginPath();
      for (let r = 0; r < Math.min(rows, reveal); r++) for (let c = 0; c < cols; c++) {
        if (!bits[r * cols + c]) continue;
        const cx = (xs[c] + xs[c + 1]) / 2, cy = (ys[r] + ys[r + 1]) / 2;
        ctx.moveTo(cx + rad, cy); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      }
      ctx.fill();
      return;
    }

    const g0 = Math.floor(gap / 2), g1 = gap - g0;
    if (gap) {
      ctx.fillStyle = col.off;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (r < reveal && bits[r * cols + c]) continue;
        ctx.fillRect(xs[c] + g0, ys[r] + g0, xs[c + 1] - xs[c] - gap, ys[r + 1] - ys[r] - gap);
      }
    }
    ctx.fillStyle = col.on;
    for (let r = 0; r < Math.min(rows, reveal); r++) for (let c = 0; c < cols; c++) {
      if (!bits[r * cols + c]) continue;
      ctx.fillRect(xs[c] + g0, ys[r] + g0, xs[c + 1] - xs[c] - gap, ys[r + 1] - ys[r] - gap);
    }
    void g1;
  };

  /* 작은 썸네일 (벽 화면용) */
  FG.tinyCanvas = function (bits, cols, rows, colors) {
    const cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    const on = hex(colors.on), off = hex(colors.off);
    for (let i = 0; i < cols * rows; i++) {
      const p = bits[i] ? on : off;
      img.data[i * 4] = p[0]; img.data[i * 4 + 1] = p[1]; img.data[i * 4 + 2] = p[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

  /* ───────── 날짜 ───────── */
  FG.fmtDate = (ts) => { const d = new Date(ts); return d.getFullYear() + '.' + FG.pad(d.getMonth() + 1, 2) + '.' + FG.pad(d.getDate(), 2); };
  FG.fmtTime = (ts) => { const d = new Date(ts); return FG.pad(d.getHours(), 2) + ':' + FG.pad(d.getMinutes(), 2) + ':' + FG.pad(d.getSeconds(), 2); };

  /* ───────── 폰트 ───────── */
  FG.fontsReady = (function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 40px Pretendard'),
      document.fonts.load('500 20px Pretendard'),
      document.fonts.load('400 20px "JetBrains Mono"'),
      document.fonts.load('700 20px "JetBrains Mono"'),
    ]).catch(() => {});
  })();

  /* ───────── 영수증 ───────── */
  /* 감열 프린터 도트 폭: 80mm 용지 = 576점(72mm), 58mm 용지 = 384점(48mm), 203dpi */
  FG.receiptSpec = (paper) => (Number(paper) === 58 ? { paper: 58, printable: 48, dots: 384 } : { paper: 80, printable: 72, dots: 576 });

  function wrapText(ctx, text, maxW) {
    const out = []; let line = '';
    const words = String(text).split(/(\s+)/);
    words.forEach((w) => {
      const test = line + w;
      if (ctx.measureText(test).width > maxW && line.trim()) { out.push(line.trim()); line = w.trimStart(); }
      else line = test;
    });
    if (line.trim()) out.push(line.trim());
    // 공백 없는 긴 줄(한글 연속)은 글자 단위로 다시 자름
    const fin = [];
    out.forEach((l) => {
      if (ctx.measureText(l).width <= maxW) { fin.push(l); return; }
      let cur = '';
      for (const ch of l) { if (ctx.measureText(cur + ch).width > maxW && cur) { fin.push(cur); cur = ch; } else cur += ch; }
      if (cur) fin.push(cur);
    });
    return fin;
  }

  /* 가로 영수증 (감열지 폭 = 영수증 세로)
     왼쪽: 픽셀 얼굴 · 오른쪽: 보행자 언어 이름 / 2026 한동대학교 디그리 · CAR ESPERANTO / 날짜 · 시간 · 번호 */
  function splitName(name) {
    const words = name.split(' ').filter(Boolean);
    if (words.length < 2) return [name];
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const w = Math.max(a.length, b.length);
      if (!best || w < best.w) best = { w, lines: [a, b] };
    }
    return best.lines;
  }
  FG.nameLines = function (name, width, maxH, maxCell) {
    const one = [name], two = splitName(name);
    const fit = (lines) => {
      const longest = lines.reduce((m, l) => (l.length > m.length ? l : m), '');
      let cell = FG.fitDotCell(longest, width, maxCell);
      const h = (l) => l.length * FG.DOT_ROWS * cell + (l.length - 1) * cell * 2;
      while (cell > 1 && h(lines) > maxH) cell--;
      return { lines, cell, height: h(lines) };
    };
    const A = fit(one), B = fit(two);
    return two.length > 1 && B.cell > A.cell * 1.25 ? B : A;
  };

  /* 배경 칸 찾기: 저장된 배경 마스크가 없으면(예전 기록) 가장자리에서 이어진 흰 칸을 배경으로 봄 */
  FG.bgMaskOf = function (entry) {
    const cols = entry.cols, rows = entry.rows, n = cols * rows;
    const bgm = typeof entry.bg === 'string' ? entry.bg.split('|')[0] : '';
    if (bgm.length === n) return FG.strToBits(bgm);
    const bits = typeof entry.bits === 'string' ? FG.strToBits(entry.bits) : entry.bits;
    const m = new Uint8Array(n), st = [];
    const push = (c, r) => { const i = r * cols + c; if (c < 0 || r < 0 || c >= cols || r >= rows || m[i] || !bits[i]) return; m[i] = 1; st.push(i); };
    for (let c = 0; c < cols; c++) push(c, 0); // 아래 가장자리는 몸통이라 시작점에서 뺌
    for (let r = 0; r < rows; r++) { push(0, r); push(cols - 1, r); }
    while (st.length) { const i = st.pop(), c = i % cols, r = (i / cols) | 0; push(c + 1, r); push(c - 1, r); push(c, r + 1); push(c, r - 1); }
    return m;
  };

  /* 얼굴 배경 무늬: white(그대로) · stripes(가로 줄무늬) · dots(점) */
  FG.drawBgPattern = function (ctx, mask, x, y, cell, cols, rows, mode, ink) {
    if (!mask || mode === 'white') return;
    ctx.fillStyle = ink || '#000';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask[r * cols + c]) continue;
        const cx = x + c * cell, cy = y + r * cell;
        if (mode === 'stripes') {
          // 칸 하나 = 줄 하나 + 틈 하나 (픽셀 격자에 딱 맞춤)
          ctx.fillRect(cx, cy, cell, Math.round(cell / 2));
        } else if (mode === 'dots') {
          // 칸 하나 = 반 칸 네모 점 하나 (줄무늬와 같은 반 칸 격자, 칸 왼쪽 위에 맞춤)
          const d = Math.round(cell / 2);
          ctx.fillRect(cx, cy, d, d);
        }
      }
    }
  };

  function wrapWords(text, maxChars) {
    const out = []; let line = '';
    String(text).split(' ').filter(Boolean).forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (t.length > maxChars && line) { out.push(line); line = w; } else line = t;
    });
    if (line) out.push(line);
    return out;
  }

  FG.renderReceipt = function (entry, s) {
    return FG.renderReceiptTall(entry, s, s.shape === 'dot' ? 'dots' : 'squares');
  };

  /* CAR ESPERANTO 로고 (윤곽 사각형 13개, 원본 좌표 · 오른쪽 위 기준으로 그림) */
  const LOGO = { x0: 206, y0: 213, w: 479, h: 1065, rects: [
    [446, 213, 132, 47], [400, 260, 46, 240], [578, 260, 45, 50], [578, 457, 45, 50], [502, 507, 76, 45],
    [313, 605, 127, 50], [206, 660, 48, 225], [254, 740, 134, 50], [254, 885, 192, 50],
    [497, 940, 135, 48], [452, 988, 45, 290], [632, 1040, 53, 50], [557, 1088, 75, 48]] };
  FG.drawLogo = function (ctx, right, top, height, lw) {
    const sc = height / LOGO.h, left = right - LOGO.w * sc;
    ctx.fillStyle = '#000';
    LOGO.rects.forEach(([x, y, w, h]) => {
      const X = Math.round(left + (x - LOGO.x0) * sc), Y = Math.round(top + (y - LOGO.y0) * sc);
      const W = Math.round(left + (x + w - LOGO.x0) * sc) - X, H = Math.round(top + (y + h - LOGO.y0) * sc) - Y;
      ctx.fillRect(X, Y, W, lw); ctx.fillRect(X, Y + H - lw, W, lw);
      ctx.fillRect(X, Y, lw, H); ctx.fillRect(X + W - lw, Y, lw, H);
    });
  };

  /* 세로 영수증 (2026.10 디자인)
     위: 점선 · 전시명 · 번호 · 오른쪽 위 윤곽 표식 / 가운데 여백 / 인사 · 이름 / 아래: 망점 얼굴 (동그라미 또는 네모) */
  FG.renderReceiptTall = function (entry, s, style) {
    const spec = FG.receiptSpec(s.paper);
    const Wd = spec.dots, k = Wd / 576;
    const R = (v) => Math.round(v * k);
    const m = R(28), cw = Wd - 2 * m;

    // 얼굴 명암: 저장된 격자가 없으면(예전 기록) 픽셀 얼굴로 대신
    let tone = FG.toneOf(entry);
    if (!tone) {
      const cols = entry.cols || s.cols, rows = entry.rows || s.rows;
      const bits = typeof entry.bits === 'string' ? FG.strToBits(entry.bits) : entry.bits;
      const bg = FG.bgMaskOf({ ...entry, cols, rows });
      const data = new Uint8Array(cols * rows);
      for (let i = 0; i < data.length; i++) data[i] = bits[i] ? 0 : (bg && bg[i] ? 0 : 13);
      tone = { cols, rows, data };
    }
    // 디자인 원본(1200 × 2423) 비율 그대로: 모든 위치를 원본 좌표 × q 로 잡음
    const q = Wd / 1200, Q = (v) => Math.round(v * q);
    const Ht = Q(2423);
    const faceTop = Q(1449), faceH = Q(2361) - faceTop;
    // 얼굴 칸: 가로를 꽉 채우고, 세로는 머리 꼭대기부터 상자 높이만큼 (원본처럼 얼굴을 크게)
    const cell = cw / tone.cols;
    const nRows = Math.min(tone.rows, Math.max(1, Math.floor(faceH / cell)));
    let firstInk = 0;
    for (let r = 0; r < tone.rows; r++) { let n = 0; for (let c = 0; c < tone.cols; c++) if (tone.data[r * tone.cols + c] >= 4) n++; if (n >= 3) { firstInk = r; break; } }
    const c0 = 0, c1 = tone.cols, r0 = Math.max(0, Math.min(tone.rows - nRows, firstInk - 1)), r1 = r0 + nRows;

    const lines = [String(s.subtitle || '').split(/\n/)[0], s.title || '', '# ' + FG.pad(entry.no, 2)]
      .map((t) => FG.cleanName(t).trim()).filter(Boolean);
    const hc = Math.max(2, Math.floor(Math.min(3 * k, ...lines.map((t) => (cw * 0.8) / Math.max(1, FG.dotCols(t))))));
    const thanks = FG.cleanName(String(s.thanksEn || '').replace(/[.!]\s*$/, ',')).trim();
    const tc = Math.max(2, Math.floor(Math.min(3 * k, cw / FG.dotCols('THANK YOU FOR TAKING THE TIME'))));
    const tLines = thanks ? wrapWords(thanks, Math.max(8, Math.floor((cw / tc + 1) / 6))) : [];
    const name = FG.cleanName(entry.name || '', 16).trim() || 'GUEST';
    const NL = FG.nameLines(name, cw, Q(160), Math.max(2, Math.floor(Q(160) / 7)));
    const rh = Math.max(2, Q(7));

    const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Ht;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wd, Ht);
    ctx.fillStyle = '#000';

    const step = Math.max(4, Q(10));
    for (let x = m; x + rh <= m + cw; x += step) ctx.fillRect(x, Q(81), rh, rh);          // 맨 위 점선
    const glyph = 'pixel';   // 모든 글자는 카 에스페란토 보행자 픽셀 글꼴 (PX5, 정수 칸)
    const pitch = Q(89);     // 원본의 줄 간격 (윗줄 시작 → 다음 줄 시작)
    lines.forEach((t, i) => FG.drawDotText(ctx, t, m, Q(118) + i * pitch, { cell: hc, color: '#000', shape: glyph }));
    FG.drawLogo(ctx, m + cw, Q(118), Q(232), Math.max(1, Math.round(k)));        // 오른쪽 위 로고
    const tPitch = Math.max(tc * 7 + Q(10), Q(58));
    tLines.forEach((t, i) => FG.drawDotText(ctx, t, m, Q(1050) + i * tPitch, { cell: tc, color: '#000', shape: glyph }));
    let y = Q(1220) + Math.round((Q(160) - NL.height) / 2);
    NL.lines.forEach((t) => { FG.drawDotText(ctx, t, m, y, { cell: NL.cell, color: '#000', shape: glyph }); y += (FG.DOT_ROWS + 2) * NL.cell; });
    y = faceTop + Math.round((faceH - nRows * cell) / 2);

    // 망점 얼굴: 어두울수록 큰 점. 동그라미는 이웃과 붙어 덩어리가 되고, 네모는 칸을 꽉 채움
    const path = new Path2D();
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      const v = tone.data[r * tone.cols + c]; if (v < 2) continue;
      const dk = v / 15, cx = m + (c - c0 + 0.5) * cell, cy = y + (r - r0 + 0.5) * cell;
      if (style === 'squares') {
        const a = dk >= 0.9 ? cell + 1 : cell * Math.sqrt(dk);   // 거의 검정이면 이웃과 틈 없이 붙게
        const x0 = Math.floor(cx - a / 2), y0 = Math.floor(cy - a / 2);
        path.rect(x0, y0, Math.max(1, Math.ceil(cx + a / 2) - x0), Math.max(1, Math.ceil(cy + a / 2) - y0));
      } else {
        const rr = Math.max(0.9, cell * 0.62 * Math.sqrt(dk));
        path.moveTo(cx + rr, cy); path.arc(cx, cy, rr, 0, Math.PI * 2);
      }
    }
    ctx.fill(path);

    const img = ctx.getImageData(0, 0, Wd, Ht);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11 > 140 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  /* 이전 가로 영수증 */
  FG.renderReceiptClassic = function (entry, s) {
    const spec = FG.receiptSpec(s.paper);
    const H = spec.dots;
    const k = H / 576;
    const m = Math.round(30 * k);
    const cols = entry.cols || s.cols, rows = entry.rows || s.rows;
    const bits = typeof entry.bits === 'string' ? FG.strToBits(entry.bits) : entry.bits;

    const cell = Math.floor((H - m * 2) / rows);
    const pw = cell * cols, ph = cell * rows;
    const py = Math.round((H - ph) / 2);
    const x0 = m + pw + Math.round(44 * k);
    const cw = Math.round(540 * k);
    const W = x0 + cw + m;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

    // 얼굴 + 배경 무늬
    FG.drawPortrait(ctx, bits, cols, rows, m, py, pw, ph, {
      grid: !!s.receiptGrid, shape: s.shape,
      colors: { on: '#ffffff', off: '#000000', line: '#000000' },
    });
    FG.drawBgPattern(ctx, FG.bgMaskOf({ ...entry, cols, rows }), m, py, cell, cols, rows, 'white', '#000');

    // 글자는 카 에스페란토 보행자 언어(6 × 8 칸 픽셀 글꼴)
    const shape = 'pixel';
    const dot = (text, x, y, c) => FG.drawDotText(ctx, text, x, y, { cell: c, color: '#000', shape });
    const dotW = (text, c) => FG.dotCols(text) * c;
    const ruleH = Math.max(2, Math.round(3 * k));
    const rule = (yy) => { ctx.fillStyle = '#000'; for (let x = x0; x < x0 + cw; x += Math.round(9 * k)) ctx.fillRect(x, yy, ruleH, ruleH); };
    const G = Math.round(18 * k);       // 점선 위아래 간격 (모든 점선이 같음)
    const small = Math.max(2, Math.round(4 * k));
    const lineGap = small * 4;          // 작은 글자 줄 사이

    // ── 위에서 아래로 흐르는 블록: 이름 · 전시 · 날짜/시간/번호 · 인사
    //    점선 위아래 간격은 모두 같게, 남는 높이는 그 간격에 고르게 나눔
    const name = FG.cleanName(entry.name || '', 16).trim() || 'GUEST';
    const NL = FG.nameLines(name, cw, Math.round(100 * k), Math.round(11 * k));
    const nameH = NL.lines.length * FG.DOT_ROWS * NL.cell + (NL.lines.length - 1) * NL.cell * 2;
    const subs = String(s.subtitle || '').split(/\n/).map((t) => FG.cleanName(t).trim()).filter(Boolean);
    const title = FG.cleanName(s.title || '').trim();
    const sCell = Math.max(2, Math.min(small, ...subs.map((t) => Math.floor(cw / Math.max(1, FG.dotCols(t))))));
    const tCell = Math.max(small, Math.min(Math.round(5 * k), Math.floor(cw / Math.max(1, FG.dotCols(title)))));
    const lg = Math.round(small * 2.6);
    const midH = subs.length * (sCell * 7 + lg) + (title ? tCell * 7 : -lg);
    const infoH = 3 * small * 7 + 2 * lg;
    const enC = Math.max(2, Math.round(3 * k));
    const enLines = wrapWords(FG.cleanName(s.thanksEn || '').trim(), Math.floor((cw / enC + 1) / 6));
    const koPx = Math.round(18 * k);
    const koLine = ''; // 영수증에는 영어 인사만 (한국어 인사는 화면에)
    const hasThanks = !!(koLine || enLines.length);
    const thanksH = (koLine ? koPx + Math.round(9 * k) : 0) + enLines.length * enC * 7 + Math.max(0, enLines.length - 1) * enC * 3;
    const nRules = hasThanks ? 3 : 2;
    const used = nameH + midH + infoH + (hasThanks ? thanksH : 0) + nRules * ruleH;
    const G2 = Math.max(Math.round(10 * k), Math.floor((ph - used) / (nRules * 2))); // 점선 위·아래 간격

    let y = py;
    NL.lines.forEach((line, i) => { if (i) y += NL.cell * 2; dot(line, x0, y, NL.cell); y += FG.DOT_ROWS * NL.cell; });
    y += G2; rule(y); y += ruleH + G2;
    subs.forEach((t) => { dot(t, x0, y, sCell); y += sCell * 7 + lg; });
    if (title) { dot(title, x0, y, tCell); y += tCell * 7; } else y -= lg;
    y += G2; rule(y); y += ruleH + G2;
    [['D', FG.fmtDate(entry.ts)], ['T', FG.fmtTime(entry.ts)], ['NO', FG.pad(entry.no)]].forEach(([lab, val], i) => {
      if (i) y += lg;
      dot(lab, x0, y, small);
      dot(val, x0 + cw - dotW(val, small), y, small);
      y += small * 7;
    });
    if (hasThanks) {
      y += G2; rule(y); y += ruleH + G2;
      if (koLine) {
        ctx.fillStyle = '#000';
        ctx.font = `500 ${koPx}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(koLine, x0, y - Math.round(2 * k), cw);
        y += koPx + Math.round(9 * k);
      }
      enLines.forEach((l, i) => { if (i) y += enC * 3; dot(l, x0, y, enC); y += enC * 7; });
    }

    // 순수 흑백 (감열지에서 회색 디더 방지)
    const img = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11 > 150 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  /* 가로 영수증은 프린터로 보낼 때 90° 돌려 감열지 폭에 맞춤 */
  FG.forPrinter = function (canvas) {
    if (canvas.width <= canvas.height) return canvas;
    const r = document.createElement('canvas');
    r.width = canvas.height; r.height = canvas.width;
    const g = r.getContext('2d');
    g.translate(r.width, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(canvas, 0, 0);
    return r;
  };

  /* 인쇄: 숨긴 iframe에 영수증 이미지를 실제 용지 크기로 놓고 인쇄.
     크롬을 --kiosk-printing 으로 켜면 대화상자 없이 기본 프린터로 바로 나갑니다. */
  /* 엡손 TM 프린터로 바로 인쇄 (ePOS-Print, 인쇄 창 없음 · 아이패드 사파리에서도 됨)
     웹페이지 → 프린터 주소로 이미지(1비트)를 보내고, 다 찍히면 자동으로 잘라요 */
  FG.printEpos = async function (canvas, s) {
    const host = String(s.eposHost || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!host) throw new Error('프린터 주소가 비어 있어요');
    const c = FG.forPrinter(canvas);
    const W = Math.floor(c.width / 8) * 8, H = c.height;
    const d = c.getContext('2d').getImageData(0, 0, W, H).data;
    const bytes = new Uint8Array((W / 8) * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 128) bytes[(y * W + x) >> 3] |= 0x80 >> (x & 7);
    }
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const img = btoa(bin);
    const copies = Math.max(1, Math.min(5, Number(s.copies) || 1));
    let body = '';
    for (let i = 0; i < copies; i++) body += `<image width="${W}" height="${H}" color="color_1" mode="mono">${img}</image><cut type="feed"/>`;
    const xml = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'
      + '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' + body + '</epos-print></s:Body></s:Envelope>';
    const proto = location.protocol === 'https:' ? 'https' : 'http';
    const r = await fetch(`${proto}://${host}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=20000`, {
      method: 'POST', body: xml,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT', SOAPAction: '""' },
    });
    const t = await r.text();
    if (!r.ok || !/success="true"/.test(t)) {
      const code = (t.match(/code="([^"]*)"/) || [])[1];
      throw new Error('프린터 응답: ' + (code || r.status));
    }
    return true;
  };

  FG.printCanvas = function (canvas, s) {
    if (s.printMode === 'epos') return FG.printEpos(canvas, s);
    canvas = FG.forPrinter(canvas);
    return new Promise((resolve) => {
      const spec = FG.receiptSpec(s.paper);
      const hmm = Math.ceil((canvas.height / canvas.width) * spec.printable) + 2;
      let frame = document.getElementById('fg-print-frame');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'fg-print-frame';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(frame);
      }
      const url = canvas.toDataURL('image/png');
      const copies = Math.max(1, Math.min(5, Number(s.copies) || 1));
      let imgs = '';
      for (let i = 0; i < copies; i++) imgs += `<img src="${url}">`;
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
        @page { size: ${spec.paper}mm ${hmm}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        img { display: block; width: ${spec.printable}mm; margin: 0 auto; image-rendering: pixelated; break-after: page; }
        img:last-child { break-after: auto; }
      </style></head><body>${imgs}</body></html>`;
      frame.onload = () => {
        const w = frame.contentWindow;
        const imgsEl = w.document.images;
        let left = imgsEl.length;
        const go = () => { try { w.focus(); w.print(); } catch (e) { console.warn('인쇄 실패', e); } resolve(); };
        if (!left) return go();
        Array.prototype.forEach.call(imgsEl, (im) => {
          if (im.complete) { if (--left === 0) setTimeout(go, 60); }
          else im.onload = im.onerror = () => { if (--left === 0) setTimeout(go, 60); };
        });
      };
    });
  };

  /* 저장 파일 이름: guestbook_0005_JAEEUN.png 처럼 번호 순서대로 정렬되게 */
  FG.fileNameOf = function (entry, kind) {
    const nm = FG.cleanName(entry.name || '', 16).trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'guestbook_' + FG.pad(entry.no) + (nm ? '_' + nm : '') + (kind ? '_' + kind : '') + '.png';
  };

  FG.download = function (blobOrUrl, name) {
    const a = document.createElement('a');
    a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  FG.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* 전체 화면: 첫 클릭/키 입력 때 켭니다 */
  FG.enableFullscreenOnFirstInput = function () {
    const go = () => {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', go, { capture: true });
    window.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') go(); }, { capture: true });
  };

  /* 커서 숨기기 */
  FG.autoHideCursor = function () {
    let t;
    const show = () => { document.documentElement.classList.remove('nocursor'); clearTimeout(t); t = setTimeout(() => document.documentElement.classList.add('nocursor'), 2000); };
    window.addEventListener('pointermove', show);
    show();
  };

  /* 관리 화면으로 나가기: Esc 두 번 */
  FG.escToAdmin = function () {
    let last = 0;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const now = Date.now();
      if (now - last < 900) location.href = 'index.html';
      last = now;
    });
  };
})();
