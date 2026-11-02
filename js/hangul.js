/* 한글 두벌식 조합 (화면 키보드용)
   FG.Hangul(): { text(), composing(), key(jamoOrChar), back(), commit(), clear() } */
(function () {
  'use strict';
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const V2 = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
  const C2 = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
  const split = (m, x) => { for (const k in m) if (m[k] === x) return [k[0], k[1]]; return null; };
  const isV = (j) => JUNG.includes(j);
  const isC = (j) => CHO.includes(j) || JONG.includes(j);

  FG.HANGUL_KEYS = { Q: 'ㅂ', W: 'ㅈ', E: 'ㄷ', R: 'ㄱ', T: 'ㅅ', Y: 'ㅛ', U: 'ㅕ', I: 'ㅑ', O: 'ㅐ', P: 'ㅔ', A: 'ㅁ', S: 'ㄴ', D: 'ㅇ', F: 'ㄹ', G: 'ㅎ', H: 'ㅗ', J: 'ㅓ', K: 'ㅏ', L: 'ㅣ', Z: 'ㅋ', X: 'ㅌ', C: 'ㅊ', V: 'ㅍ', B: 'ㅠ', N: 'ㅜ', M: 'ㅡ' };
  FG.HANGUL_SHIFT = { 'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ' };

  FG.Hangul = function (max) {
    let done = '';
    let cur = null; // { cho, jung, jong }
    const LIMIT = max || 400;
    const show = (c) => {
      if (!c) return '';
      if (c.cho && c.jung) return String.fromCharCode(0xac00 + (CHO.indexOf(c.cho) * 21 + JUNG.indexOf(c.jung)) * 28 + JONG.indexOf(c.jong || ''));
      return c.cho || c.jung || '';
    };
    const commit = () => { if (cur) { done += show(cur); cur = null; } };
    const room = () => (done + show(cur)).length < LIMIT;
    return {
      text: () => done + show(cur),
      done: () => done,
      composing: () => show(cur),
      commit,
      clear() { done = ''; cur = null; },
      key(j) {
        if (isV(j)) {
          if (!cur) { if (!room()) return; cur = { jung: j }; return; }
          if (cur.cho && !cur.jung) { cur.jung = j; return; }
          if (cur.jung && !cur.jong) {
            const v = V2[cur.jung + j];
            if (v) { cur.jung = v; return; }
            commit(); if (!room()) return; cur = { jung: j }; return;
          }
          if (cur.jong) {
            const s = split(C2, cur.jong);
            let moved;
            if (s) { cur.jong = s[0]; moved = s[1]; } else { moved = cur.jong; cur.jong = ''; }
            commit(); cur = { cho: moved, jung: j }; return;
          }
          commit(); if (!room()) return; cur = { jung: j }; return;
        }
        if (isC(j)) {
          if (cur && cur.cho && cur.jung && !cur.jong && JONG.includes(j)) { cur.jong = j; return; }
          if (cur && cur.jong) { const c = C2[cur.jong + j]; if (c) { cur.jong = c; return; } }
          commit(); if (!room()) return; cur = CHO.includes(j) ? { cho: j } : { cho: j }; return;
        }
        // 그 밖의 글자 (영문 · 숫자 · 띄어쓰기 · 문장부호)
        commit(); if (!room()) return; done += j;
      },
      back() {
        if (cur) {
          if (cur.jong) { const s = split(C2, cur.jong); cur.jong = s ? s[0] : ''; return; }
          if (cur.jung) { const s = split(V2, cur.jung); if (s) { cur.jung = s[0]; return; } cur.jung = ''; if (!cur.cho) cur = null; return; }
          cur = null; return;
        }
        done = Array.from(done).slice(0, -1).join('');
      },
    };
  };
})();
