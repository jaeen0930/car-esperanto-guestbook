/* 게스트북 · 카 에스페란토 보행자 언어(도트 그래머 보행자 단)로 이름 쓰기
   글자 하나 = 6 × 8 바탕 칸, 그 안에 5 × 7 픽셀 글꼴(PX5).
   PX5는 도트 그래머 변환기(car-esperanto-dot-grammar.html)의 글꼴과 같습니다. */
(function () {
  'use strict';
  const PX5 ={
A:[" ### ","#   #","#   #","#####","#   #","#   #","#   #"], B:["#### ","#   #","#   #","#### ","#   #","#   #","#### "], C:[" ### ","#   #","#    ","#    ","#    ","#   #"," ### "],
D:["#### ","#   #","#   #","#   #","#   #","#   #","#### "], E:["#####","#    ","#    ","#### ","#    ","#    ","#####"], F:["#####","#    ","#    ","#### ","#    ","#    ","#    "],
G:[" ### ","#   #","#    ","# ###","#   #","#   #"," ####"], H:["#   #","#   #","#   #","#####","#   #","#   #","#   #"], I:["#####","  #  ","  #  ","  #  ","  #  ","  #  ","#####"],
J:["  ###","   # ","   # ","   # ","   # ","#  # "," ##  "], K:["#   #","#  # ","# #  ","##   ","# #  ","#  # ","#   #"], L:["#    ","#    ","#    ","#    ","#    ","#    ","#####"],
M:["#   #","## ##","# # #","# # #","#   #","#   #","#   #"], N:["#   #","##  #","# # #","#  ##","#   #","#   #","#   #"], O:[" ### ","#   #","#   #","#   #","#   #","#   #"," ### "],
P:["#### ","#   #","#   #","#### ","#    ","#    ","#    "], Q:[" ### ","#   #","#   #","#   #","# # #","#  # "," ## #"], R:["#### ","#   #","#   #","#### ","# #  ","#  # ","#   #"],
S:[" ####","#    ","#    "," ### ","    #","    #","#### "], T:["#####","  #  ","  #  ","  #  ","  #  ","  #  ","  #  "], U:["#   #","#   #","#   #","#   #","#   #","#   #"," ### "],
V:["#   #","#   #","#   #","#   #","#   #"," # # ","  #  "], W:["#   #","#   #","#   #","# # #","# # #","# # #"," # # "], X:["#   #","#   #"," # # ","  #  "," # # ","#   #","#   #"],
Y:["#   #","#   #"," # # ","  #  ","  #  ","  #  ","  #  "], Z:["#####","    #","   # ","  #  "," #   ","#    ","#####"],
"0":[" ### ","#   #","#  ##","# # #","##  #","#   #"," ### "], "1":["  #  "," ##  ","  #  ","  #  ","  #  ","  #  "," ### "], "2":[" ### ","#   #","    #","   # ","  #  "," #   ","#####"],
"3":["#####","   # ","  #  ","   # ","    #","#   #"," ### "], "4":["   # ","  ## "," # # ","#  # ","#####","   # ","   # "], "5":["#####","#    ","#### ","    #","    #","#   #"," ### "],
"6":["  ## "," #   ","#    ","#### ","#   #","#   #"," ### "], "7":["#####","    #","   # ","  #  "," #   "," #   "," #   "], "8":[" ### ","#   #","#   #"," ### ","#   #","#   #"," ### "],
"9":[" ### ","#   #","#   #"," ####","    #","   # "," ##  "], "&":[" ##  ","#  # ","# #  "," #   ","# # #","#  # "," ## #"],
".":["     ","     ","     ","     ","     ","     ","  #  "], ",":["     ","     ","     ","     ","     ","  #  "," #   "], "-":["     ","     ","     ","#####","     ","     ","     "],
"?":[" ### ","#   #","    #","   # ","  #  ","     ","  #  "], "!":["  #  ","  #  ","  #  ","  #  ","  #  ","     ","  #  "], "/":["    #","    #","   # ","  #  "," #   ","#    ","#    "],
    /* 게스트북에서 시간 표기용으로 더한 글자 (변환기에는 없음) */
    ":":["     ","  #  ","  #  ","     ","  #  ","  #  ","     "],
    "#":[" # # "," # # ","#####"," # # ","#####"," # # "," # # "]};

  const GW = 6, GH = 8;
  FG.DOT_CHARS = Object.keys(PX5).join('') + ' ';

  /* 입력을 보행자 언어가 가진 글자만 남겨 정리 (대문자 A–Z, 0–9, . , - ? ! / & 띄어쓰기) */
  FG.cleanName = function (s, max) {
    const up = String(s || '').toUpperCase().replace(/\s+/g, ' ');
    let out = '';
    for (const ch of up) if (PX5[ch] || ch === ' ') out += ch;
    out = out.replace(/^ +/, '');
    return max ? out.slice(0, max) : out;
  };

  /* 글자 수 → 칸 수 (마지막 글자 뒤 빈 칸 하나는 뺌) */
  FG.dotCols = (text) => Math.max(0, String(text).length * GW - 1);
  FG.DOT_ROWS = GH - 1; // 7 (아래 빈 줄 뺌)

  /* 이름 그리기
     opt: { cell: 칸 크기 px, color, shape: 'oko' | 'circle' | 'rhomb', ghost: 바탕 칸 색(없으면 생략) } */
  FG.drawDotText = function (ctx, text, x, y, opt) {
    const cs = opt.cell;
    const shape = opt.shape || 'oko';
    const chars = Array.from(String(text));
    const lit = new Path2D(), ghost = new Path2D();
    if (shape === 'pixel') {
      // 칸 경계를 정수 픽셀에 맞추고(줄마다 굵기가 들쭉날쭉하지 않게), 작은 글자는 꽉 찬 네모, 큰 글자는 가는 틈
      const gx = (i) => Math.round(x + i * cs), gy = (j) => Math.round(y + j * cs);
      const gap = cs >= 8 ? Math.max(1, Math.round(cs * 0.08)) : 0;
      chars.forEach((ch, n) => {
        const px = PX5[ch];
        for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW; i++) {
          if (n === chars.length - 1 && i === GW - 1) continue;
          const on = px && i < 5 && px[j][i] === '#';
          if (!on && !opt.ghost) continue;
          const c = n * GW + i, X0 = gx(c), Y0 = gy(j), X1 = gx(c + 1), Y1 = gy(j + 1);
          (on ? lit : ghost).rect(X0, Y0, Math.max(1, X1 - X0 - gap), Math.max(1, Y1 - Y0 - gap));
        }
      });
      if (opt.ghost) { ctx.fillStyle = opt.ghost; ctx.fill(ghost); }
      ctx.fillStyle = opt.color; ctx.fill(lit);
      return;
    }
    const add = (p, cx, cy, k) => {
      if (shape === 'circle') { const r = cs * 0.46 * k; p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2); }
      else if (shape === 'rhomb') { const a = cs * 0.5 * k; p.moveTo(cx, cy - a); p.lineTo(cx + a, cy); p.lineTo(cx, cy + a); p.lineTo(cx - a, cy); p.closePath(); }
      else if (shape === 'solid') { p.rect(Math.round(cx - cs / 2), Math.round(cy - cs / 2), Math.round(cs), Math.round(cs)); }
      else { const h = cs * 0.45 * k; p.rect(Math.round(cx - h), Math.round(cy - h), Math.round(h * 2), Math.round(h * 2)); }
    };
    chars.forEach((ch, n) => {
      const px = PX5[ch];
      for (let j = 0; j < GH - 1; j++) {
        for (let i = 0; i < GW; i++) {
          if (n === chars.length - 1 && i === GW - 1) continue;
          const on = px && i < 5 && px[j][i] === '#';
          const cx = x + (n * GW + i + 0.5) * cs, cy = y + (j + 0.5) * cs;
          if (on) add(lit, cx, cy, 1);
          else if (opt.ghost) add(ghost, cx, cy, shape === 'oko' ? 0.9 : 0.85);
        }
      }
    });
    if (opt.ghost) { ctx.fillStyle = opt.ghost; ctx.fill(ghost); }
    ctx.fillStyle = opt.color;
    ctx.fill(lit);
  };

  /* 글자 윤곽만 가는 선으로 (세로 영수증 오른쪽 위 표식) */
  FG.drawDotOutline = function (ctx, ch, x, y, cell, lw, color) {
    const px = PX5[ch]; if (!px) return;
    const on = (i, j) => j >= 0 && j < 7 && i >= 0 && i < 5 && px[j][i] === '#';
    ctx.fillStyle = color;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
      if (!on(i, j)) continue;
      const X = Math.round(x + i * cell), Y = Math.round(y + j * cell);
      if (!on(i, j - 1)) ctx.fillRect(X, Y, cell, lw);
      if (!on(i, j + 1)) ctx.fillRect(X, Y + cell - lw, cell, lw);
      if (!on(i - 1, j)) ctx.fillRect(X, Y, lw, cell);
      if (!on(i + 1, j)) ctx.fillRect(X + cell - lw, Y, lw, cell);
    }
  };

  /* 주어진 폭에 맞는 칸 크기 */
  FG.fitDotCell = (text, width, maxCell) => Math.max(1, Math.min(maxCell || 99, Math.floor(width / Math.max(1, FG.dotCols(text)))));
})();
