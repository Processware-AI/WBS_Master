/* SVG 차트 — 외부 라이브러리 없이 동작. 마크마다 data-tip 으로 툴팁 제공 */
(function (global) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function legend(series) {
    return '<div class="legend">' + series.map(s =>
      `<span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('') + '</div>';
  }

  // 막대 위쪽 모서리만 둥글게(기준선 쪽은 각지게)
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /** 묶은 세로 막대: categories[], series[{name,color,values[]}], unit */
  function groupedBars(categories, series, opt) {
    opt = Object.assign({ height: 260, unit: '%', max: null }, opt);
    const W = Math.max(560, categories.length * 100 + 60), H = opt.height;
    const m = { l: 44, r: 12, t: 22, b: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const all = series.flatMap(s => s.values);
    const max = opt.max || niceMax(Math.max(1, ...all));
    const y = v => m.t + ih - (v / max) * ih;
    const band = iw / Math.max(1, categories.length);
    const gap = 2, bw = Math.min(28, (band * 0.7 - gap * (series.length - 1)) / series.length);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = y(v);
      g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
      g += `<text class="tick" x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
    }
    categories.forEach((c, ci) => {
      const gx = m.l + band * ci + (band - (bw * series.length + gap * (series.length - 1))) / 2;
      series.forEach((s, si) => {
        const v = s.values[ci] || 0, x = gx + si * (bw + gap), yy = y(Math.max(0, v));
        const tip = `${esc(c)} · ${esc(s.name)}: ${f1(v)}${opt.unit}`;
        g += `<path d="${barPath(x, yy, bw, m.t + ih - yy, 3)}" style="fill:${s.color}" data-tip="${tip}"/>`;
        g += `<rect x="${x - 2}" y="${m.t}" width="${bw + 4}" height="${ih}" fill="transparent" data-tip="${tip}"/>`;
        if (categories.length <= 12 && v > 0) g += `<text class="val" x="${x + bw / 2}" y="${yy - 4}" text-anchor="middle">${f1(v)}</text>`;
      });
      const label = String(c).length > 9 ? String(c).slice(0, 8) + '…' : c;
      g += `<text class="tick" x="${m.l + band * ci + band / 2}" y="${H - m.b + 16}" text-anchor="middle">${esc(label)}</text>`;
    });
    g += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
    return legend(series) + `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;min-width:${Math.min(W, 420)}px" role="img">${g}</svg></div>`;
  }

  /** S-커브: plan[{d,v}] 선, act[{d,v}] 점·선, check 세로선 */
  function sCurve(plan, act, check, opt) {
    opt = Object.assign({ height: 260 }, opt);
    if (!plan.length) return '<div class="empty">계획 일정이 입력된 태스크가 없습니다.</div>';
    const W = 720, H = opt.height, m = { l: 44, r: 16, t: 16, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const d0 = plan[0].d, d1 = plan[plan.length - 1].d;
    const max = niceMax(Math.max(1, ...plan.map(p => p.v), ...act.map(p => p.v)));
    const x = d => m.l + ((d - d0) / Math.max(1, d1 - d0)) * iw;
    const y = v => m.t + ih - (v / max) * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = y(v);
      g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/><text class="tick" x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
    }
    // 월 눈금
    let lastM = '';
    plan.forEach(p => {
      const s = Calc.ds(p.d), mm = s.slice(0, 7);
      if (mm !== lastM) { lastM = mm; g += `<text class="tick" x="${x(p.d)}" y="${H - 12}" text-anchor="middle">${+s.slice(5, 7)}월</text>`; }
    });
    g += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
    if (check >= d0 && check <= d1) g += `<line class="checkline" x1="${x(check)}" x2="${x(check)}" y1="${m.t}" y2="${m.t + ih}"/><text class="tick strong" x="${x(check) + 4}" y="${m.t + 10}">점검일</text>`;
    const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ',' + y(p.v).toFixed(1)).join('');
    g += `<path d="${path(plan)}" style="fill:none;stroke:var(--c-plan);stroke-width:2"/>`;
    const actIn = act.filter(p => p.d >= d0 - 7 && p.d <= d1 + 7);
    if (actIn.length) {
      g += `<path d="${path(actIn)}" style="fill:none;stroke:var(--c-act);stroke-width:2"/>`;
      actIn.forEach(p => g += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4.5" style="fill:var(--c-act);stroke:var(--surface);stroke-width:2"/>`);
    }
    // 호버 영역: 주마다 하나
    const band = iw / Math.max(1, plan.length - 1);
    plan.forEach(p => {
      const a = act.find(q => Math.abs(q.d - p.d) <= 3);
      const tip = `${Calc.ds(p.d)} · 계획 ${f1(p.v)}%` + (a ? ` · 실적 ${f1(a.v)}%` : '');
      g += `<rect x="${x(p.d) - band / 2}" y="${m.t}" width="${band}" height="${ih}" fill="transparent" data-tip="${tip}"/>`;
    });
    return legend([{ name: '누적계획', color: 'var(--c-plan)' }, { name: '누적실적(점검 결과)', color: 'var(--c-act)' }]) +
      `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img">${g}</svg></div>`;
  }

  /** 상태별 태스크 수 가로 누적 막대 (한 줄) */
  function statusBar(cnt) {
    const items = [
      { k: 'done', name: '종료', color: 'var(--st-good)' },
      { k: 'prog', name: '진행', color: 'var(--c-plan)' },
      { k: 'late', name: '지연', color: 'var(--st-crit)' },
      { k: 'idle', name: '미착수', color: 'var(--muted-fill)' },
    ];
    const total = items.reduce((a, i) => a + (cnt[i.k] || 0), 0);
    if (!total) return '<div class="empty">태스크가 없습니다.</div>';
    const seg = items.filter(i => cnt[i.k]).map(i =>
      `<div class="seg" style="flex:${cnt[i.k]};background:${i.color}" data-tip="${i.name} ${cnt[i.k]}건 (${f1(cnt[i.k] / total * 100)}%)"></div>`).join('');
    return `<div class="stackbar">${seg}</div><div class="legend">` + items.map(i =>
      `<span class="lg"><i style="background:${i.color}"></i>${i.name} <b>${cnt[i.k] || 0}</b></span>`).join('') + '</div>';
  }

  // 공용 툴팁
  function installTooltip() {
    const tip = document.createElement('div');
    tip.className = 'tooltip'; document.body.appendChild(tip);
    document.addEventListener('mousemove', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tip.style.display = 'none'; return; }
      tip.textContent = t.getAttribute('data-tip');
      tip.style.display = 'block';
      const r = tip.getBoundingClientRect();
      let lx = e.clientX + 14, ly = e.clientY + 14;
      if (lx + r.width > innerWidth - 8) lx = e.clientX - r.width - 14;
      if (ly + r.height > innerHeight - 8) ly = e.clientY - r.height - 14;
      tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
    });
  }

  global.Charts = { groupedBars, sCurve, statusBar, installTooltip, esc };
})(window);
