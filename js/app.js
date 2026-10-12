/* WBS Master — 화면 구성 및 이벤트 처리 */
(function () {
  'use strict';
  const { S } = Store;
  const esc = Charts.esc;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // ---------- 화면 상태(프로젝트와 별개로 브라우저에 보관) ----------
  const UI = loadUI();
  function loadUI() {
    const d = { cols: { wbs: true, calc: true, effort: false, sched: true, note: false }, collapsed: {}, gScale: 'week', filter: '', status: '', owner: '', theme: '' };
    try { return Object.assign(d, JSON.parse(localStorage.getItem('wbs-master-ui') || '{}')); } catch (e) { return d; }
  }
  function saveUI() { try { localStorage.setItem('wbs-master-ui', JSON.stringify(UI)); } catch (e) { /* 무시 */ } }

  // ---------- 포맷 ----------
  const pc = v => (isFinite(v) ? (v * 100).toFixed(1) : '0.0') + '%';
  const pt = v => (isFinite(v) ? v.toFixed(2) : '0.00');
  const sgn = v => (v > 0.0005 ? '+' : '') + pt(v);
  const dshort = s => s ? s.slice(2).replace(/-/g, '.') : '';
  const statusBadge = s => s === '지연' ? '<span class="badge crit">지연</span>' : s === '종료' ? '<span class="badge good">종료</span>'
    : s === '진행' ? '<span class="badge prog">진행</span>' : '<span class="badge idle">미착수</span>';
  function spiBadge(ratio, plan) {
    if (!plan) return '<span class="badge idle">계획 없음</span>';
    if (ratio >= 0.999) return '<span class="badge good">정상</span>';
    if (ratio >= 0.9) return '<span class="badge warn">주의</span>';
    return '<span class="badge crit">지연</span>';
  }
  const SCOPE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  // ---------- 라우팅 ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    return { page: h[0] || 'dashboard', id: h[1] || '', tab: h[2] || '' };
  }
  window.addEventListener('hashchange', () => { $('#sidenav').classList.remove('open'); render(); $('#main').scrollTop = 0; window.scrollTo(0, 0); });

  // ---------- 렌더링 ----------
  let R = null;
  function render() {
    const p = Store.current();
    R = Calc.computeProject(p);
    const keep = captureFocus();
    renderTop(p);
    renderNav(p);
    const r = route();
    let html = '';
    if (r.page === 'dashboard') html = viewDashboard(p);
    else if (r.page === 'scope') {
      const sc = Store.findScope(p, r.id);
      html = sc ? viewScope(p, sc, r.tab || 'status') : viewDashboard(p);
    } else if (r.page === 'gantt') html = viewGanttAll(p);
    else if (r.page === 'settings') html = viewSettings(p);
    else if (r.page === 'docs') html = viewDocs(p);
    else if (r.page === 'report') html = viewReport(p);
    else if (r.page === 'data') html = viewData(p);
    else html = viewDashboard(p);
    $('#main').innerHTML = html;
    restoreFocus(keep);
  }

  // 다시 그려도 입력 포커스·스크롤 위치 유지
  function captureFocus() {
    const a = document.activeElement;
    const scrolls = $$('[data-scroll]').map(el => [el.dataset.scroll, el.scrollLeft, el.scrollTop]);
    const sel = a && a.dataset ? (a.dataset.b ? `[data-b="${CSS.escape(a.dataset.b)}"]` : a.dataset.ui ? `[data-ui="${CSS.escape(a.dataset.ui)}"]` : null) : null;
    let pos = null; try { pos = a.selectionStart; } catch (e) { /* 날짜 입력 등 */ }
    return { sel, pos, scrolls, y: window.scrollY };
  }
  function restoreFocus(k) {
    k.scrolls.forEach(([key, l, t]) => { const el = $(`[data-scroll="${key}"]`); if (el) { el.scrollLeft = l; el.scrollTop = t; } });
    window.scrollTo(0, k.y);
    if (k.sel) {
      const el = $(k.sel);
      if (el) { el.focus({ preventScroll: true }); try { if (k.pos != null && (el.type === 'text' || el.type === 'search')) el.setSelectionRange(k.pos, k.pos); } catch (e) { /* 일부 입력형식 미지원 */ } }
    }
  }

  function renderTop(p) {
    $('#projSelect').innerHTML = S.data.projects.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.info.projectName || '(이름 없음)')}</option>`).join('');
    const cd = $('#checkDay');
    if (document.activeElement !== cd) cd.value = p.checkDay;
    renderSaveState();
  }
  function renderSaveState() {
    const el = $('#saveState');
    if (S.saveError) { el.className = 'save-state err'; el.textContent = '저장 실패: ' + S.saveError; return; }
    el.className = 'save-state';
    const where = S.mode === 'server' ? '서버' : '브라우저';
    el.textContent = S.lastSaved ? `${where}에 저장됨 ${S.lastSaved.toTimeString().slice(0, 5)}` : `${where} 저장소 사용`;
  }

  function renderNav(p) {
    const r = route();
    const on = (cond) => cond ? 'class="on"' : '';
    let h = `<h6>현황</h6>
      <a href="#/dashboard" ${on(r.page === 'dashboard')}>▤ 전체 진행현황 <span class="pct">${pc(R.totals.act / 100)}</span></a>
      <a href="#/gantt" ${on(r.page === 'gantt')}>▭ 전체 간트차트</a>
      <h6>범위별 (진행현황 · 진행율 입력)</h6>`;
    R.scopes.forEach((s, i) => {
      h += `<a href="#/scope/${s.scope.id}/${r.page === 'scope' && r.tab ? r.tab : 'wbs'}" ${on(r.page === 'scope' && r.id === s.scope.id)}>
        <span class="dot" style="background:${SCOPE_COLORS[i % 8]}"></span>${esc(s.scope.name)}<span class="pct">${pc(s.actRate)}</span></a>`;
    });
    h += `<a href="#/settings" class="muted-link">＋ 범위 추가·관리</a>
      <h6>관리</h6>
      <a href="#/settings" ${on(r.page === 'settings')}>⚙ 범위·가중치·휴일</a>
      <a href="#/docs" ${on(r.page === 'docs')}>✎ 표지·승인·제개정이력</a>
      <a href="#/report" ${on(r.page === 'report')}>⎙ 보고서 인쇄</a>
      <a href="#/data" ${on(r.page === 'data')}>⇅ 가져오기·내보내기</a>`;
    $('#sidenav').innerHTML = h;
  }

  // ---------- 대시보드 (진행현황_전체) ----------
  function weightWarnings(p, scopeOnly) {
    const w = [];
    const ws = p.scopes.reduce((a, s) => a + (+s.weight || 0), 0);
    if (!scopeOnly && p.scopes.length && Math.abs(ws - 100) > 0.001) w.push(`범위별 가중치 합계가 ${ws}입니다 (100이어야 함).`);
    p.scopes.forEach(sc => {
      const s = sc.stages.reduce((a, st) => a + (+st.weight || 0), 0);
      if (sc.stages.length && Math.abs(s - 100) > 0.001) w.push(`[${esc(sc.name)}] 단계별 가중치 합계가 ${s}입니다.`);
      sc.stages.forEach(st => {
        const t = st.tasks.reduce((a, x) => a + (+x.weight || 0), 0);
        if (st.tasks.length && Math.abs(t - 100) > 0.001) w.push(`[${esc(sc.name)} › ${esc(st.name)}] 태스크 가중치 합계가 ${t}입니다.`);
      });
    });
    return w;
  }
  function warnBox(list) {
    if (!list.length) return '';
    const more = list.length > 4 ? ` 외 ${list.length - 4}건` : '';
    return `<div class="alert">⚠ <div>${list.slice(0, 4).join('<br>')}${more}</div></div>`;
  }

  function kpiRow(plan, act, ratio, extra) {
    return `<div class="kpis">
      <div class="kpi"><div class="k">점검마감일자</div><div class="v" style="font-size:21px">${esc(Calc.ds(R.check))}</div><div class="s">${extra || ''}</div></div>
      <div class="kpi"><div class="k">시점 누적계획</div><div class="v">${plan.toFixed(1)}<small>%</small></div><div class="s">점검일까지 계획된 진척</div></div>
      <div class="kpi"><div class="k">시점 누적실적</div><div class="v">${act.toFixed(1)}<small>%</small></div><div class="s">실제 달성한 진척</div></div>
      <div class="kpi"><div class="k">누적편차</div><div class="v ${act - plan < -0.05 ? 'neg' : 'pos'}">${sgn(act - plan)}<small>%p</small></div><div class="s">실적 − 계획</div></div>
      <div class="kpi"><div class="k">계획대비 실적율</div><div class="v">${(ratio * 100).toFixed(1)}<small>%</small></div><div class="s">${spiBadge(ratio, plan)}</div></div>
    </div>`;
  }

  function viewDashboard(p) {
    const T = R.totals;
    const sc = R.scopes;
    const curve = Calc.planCurve(p).map(x => ({ d: x.d, v: x.plan }));
    const actPts = p.snapshots.map(s => ({ d: Calc.dn(s.date), v: s.act })).sort((a, b) => a.d - b.d);
    if (!p.snapshots.find(s => s.date === Calc.ds(R.check))) actPts.push({ d: R.check, v: T.act });
    actPts.sort((a, b) => a.d - b.d);

    const delayed = [], upcoming = [];
    R.scopes.forEach(s => s.stages.forEach(st => st.tasks.forEach((c, i) => {
      const t = st.stage.tasks[i];
      const rec = { s, st, t, c };
      if (c.status === '지연') delayed.push(rec);
      if (c.ps != null && c.ps > R.check && c.ps <= R.check + 14) upcoming.push(rec);
    })));
    delayed.sort((a, b) => (a.c.K - a.c.J) - (b.c.K - b.c.J));
    upcoming.sort((a, b) => a.c.ps - b.c.ps);

    const cols = sc.map(s => `<th class="n">${esc(s.scope.name)}</th>`).join('');
    const row = (label, f, total, cls) => `<tr class="${cls || ''}"><td class="rowlabel">${label}</td>${sc.map(s => `<td class="n">${f(s)}</td>`).join('')}<td class="n"><b>${total ?? ''}</b></td></tr>`;
    const wInputs = sc.map(s => `<td class="n" style="width:110px"><input type="number" min="0" max="100" step="1" data-b="scope|${s.scope.id}|weight" data-t="num" value="${+s.scope.weight || 0}"></td>`).join('');

    const taskList = (list, kind) => list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>범위</th><th>No</th><th>태스크</th><th>담당자</th>
        ${kind === 'late' ? '<th class="n">계획</th><th class="n">실제</th><th class="n">편차</th>' : '<th>계획시작</th><th>계획종료</th>'}</tr></thead><tbody>` +
      list.slice(0, 12).map(x => `<tr><td>${esc(x.s.scope.name)}</td><td>${x.c.no}</td>
        <td><a href="#/scope/${x.s.scope.id}/wbs">${esc(x.t.task || x.t.activity || '(태스크명 없음)')}</a></td><td>${esc(x.t.owner)}</td>
        ${kind === 'late' ? `<td class="n">${pc(x.c.J)}</td><td class="n">${pc(x.c.K)}</td><td class="n neg">${((x.c.K - x.c.J) * 100).toFixed(1)}%p</td>`
          : `<td>${x.t.planStart}</td><td>${x.t.planEnd}</td>`}</tr>`).join('') +
      `</tbody></table></div>${list.length > 12 ? `<div class="empty">외 ${list.length - 12}건</div>` : ''}` : `<div class="empty">${kind === 'late' ? '지연된 태스크가 없습니다.' : '향후 2주 내 시작 예정 태스크가 없습니다.'}</div>`;

    const snapRows = p.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date)).map(s =>
      `<tr><td>${s.date}</td><td class="n">${s.plan.toFixed(2)}%</td><td class="n">${s.act.toFixed(2)}%</td><td class="n ${s.act - s.plan < 0 ? 'neg' : 'pos'}">${sgn(s.act - s.plan)}</td>
       <td class="n">${s.plan ? (s.act / s.plan * 100).toFixed(1) : '0.0'}%</td><td class="c"><button class="icon-btn del" data-act="delSnap" data-id="${s.date}" title="삭제">✕</button></td></tr>`).join('');

    return `
      <div class="page-head"><div><h1>진척점검 보고서 (전체)</h1><div class="sub">${esc(p.info.projectName)} · ${esc(p.info.period || '')}</div></div>
        <div class="actions"><button class="btn primary" data-act="snapshot" title="현재 점검일의 계획·실적을 실적 추이에 기록">✓ 점검 결과 저장</button>
        <button class="btn" data-act="exportExcel">엑셀 내보내기</button></div></div>
      ${warnBox(weightWarnings(p))}
      ${kpiRow(T.plan, T.act, T.ratio, `태스크 ${T.cnt.tasks}건 · 지연 <b class="neg">${T.cnt.late}</b>건`)}
      <div class="grid g3">
        <div class="card"><h3>누적 진척 추이 (S-커브) <span class="hint">계획은 주 단위 자동 계산 · 실적은 ‘점검 결과 저장’ 기록</span></h3>${Charts.sCurve(curve, actPts, R.check)}</div>
        <div class="card"><h3>태스크 진행상태</h3>${Charts.statusBar(T.cnt)}
          <table class="tbl" style="margin-top:6px"><tbody>
            <tr><td>계획된 태스크 수 <span class="hint">(점검일까지 시작 예정)</span></td><td class="n">${T.cnt.planned}</td></tr>
            <tr><td>계획된 Review 문서</td><td class="n">${T.cnt.reviewPlan}</td></tr>
            <tr><td>완료된 Review 문서</td><td class="n">${T.cnt.reviewDone}</td></tr>
            <tr><td>Review율</td><td class="n">${pc(T.cnt.reviewPlan ? T.cnt.reviewDone / T.cnt.reviewPlan : 0)}</td></tr>
          </tbody></table></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>범위별 상세 진행 현황 <span class="hint">가중치는 표에서 바로 수정할 수 있습니다</span></h3>
        ${sc.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="rowlabel">구분</th>${cols}<th class="n">합계</th></tr></thead><tbody>
          <tr><td class="rowlabel">범위별 가중치</td>${wInputs}<td class="n"><b class="${Math.abs(T.wSum - 100) > 0.001 ? 'neg' : ''}">${T.wSum}</b></td></tr>
          ${row('범위별 시점 누적계획', s => pt(s.plan))}
          ${row('범위별 시점 누적실적', s => pt(s.act))}
          ${row('시점 누적편차', s => `<span class="${s.act - s.plan < -0.0005 ? 'neg' : ''}">${sgn(s.act - s.plan)}</span>`)}
          ${row('시점 누적계획율', s => pc(s.planRate))}
          ${row('시점 누적실적율', s => pc(s.actRate))}
          ${row('계획대비 실적율', s => pc(s.ratio) + ' ' + spiBadge(s.ratio, s.plan), pc(T.ratio))}
          ${row('계획된 태스크 수', s => s.cnt.planned, T.cnt.planned)}
          ${row('진행중인 태스크 수', s => s.cnt.prog, T.cnt.prog)}
          ${row('종료된 태스크 수', s => s.cnt.done, T.cnt.done)}
          ${row('지연된 태스크 수', s => s.cnt.late ? `<b class="neg">${s.cnt.late}</b>` : 0, T.cnt.late)}
          ${row('계획된 Review 문서', s => s.cnt.reviewPlan, T.cnt.reviewPlan)}
          ${row('완료된 Review 문서', s => s.cnt.reviewDone, T.cnt.reviewDone)}
          ${row('각 단계 Review율', s => pc(s.reviewRate), pc(T.cnt.reviewPlan ? T.cnt.reviewDone / T.cnt.reviewPlan : 0))}
          ${row('전체 누적계획', s => pt(s.totPlan), pt(T.plan), 'total')}
          ${row('전체 누적실적', s => pt(s.totAct), pt(T.act), 'total')}
          ${row('전체 누적편차', s => sgn(s.totAct - s.totPlan), sgn(T.dev), 'total')}
        </tbody></table></div>` : '<div class="empty">범위가 없습니다. <a href="#/settings">범위를 추가</a>하세요.</div>'}
      </div>
      <div class="card" style="margin-top:16px"><h3>범위별 상세 진행 현황 그래프 <span class="hint">시점 누적계획율 vs 누적실적율 (%)</span></h3>
        ${Charts.groupedBars(sc.map(s => s.scope.name), [
          { name: '시점 누적계획율', color: 'var(--c-plan)', values: sc.map(s => s.planRate * 100) },
          { name: '시점 누적실적율', color: 'var(--c-act)', values: sc.map(s => s.actRate * 100) }], { max: 100 })}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>지연 태스크 <span class="hint">계획 대비 실적이 부족한 순</span></h3>${taskList(delayed, 'late')}</div>
        <div class="card"><h3>2주 내 시작 예정</h3>${taskList(upcoming, 'up')}</div>
      </div>
      <div class="card" style="margin-top:16px"><h3>점검 결과 기록 <span class="hint">‘점검 결과 저장’을 누를 때마다 추가됩니다(같은 날짜는 덮어씀)</span></h3>
        ${snapRows ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>점검일</th><th class="n">누적계획</th><th class="n">누적실적</th><th class="n">편차</th><th class="n">계획대비 실적율</th><th></th></tr></thead><tbody>${snapRows}</tbody></table></div>`
          : '<div class="empty">아직 기록이 없습니다.</div>'}</div>`;
  }

  // ---------- 범위 화면 ----------
  function viewScope(p, sc, tab) {
    const s = R.scopes.find(x => x.scope === sc);
    const tabs = `<div class="tabs">
      <a href="#/scope/${sc.id}/status" class="${tab === 'status' ? 'on' : ''}">진행현황</a>
      <a href="#/scope/${sc.id}/wbs" class="${tab === 'wbs' ? 'on' : ''}">진행율 입력 (WBS)</a>
      <a href="#/scope/${sc.id}/gantt" class="${tab === 'gantt' ? 'on' : ''}">간트차트</a></div>`;
    const head = `<div class="page-head"><div><h1>${esc(sc.name)}</h1><div class="sub">관리책임자 ${esc(sc.manager || '-')} · 범위 가중치 ${+sc.weight || 0} · 시점 누적실적 ${pt(s.act)} / 계획 ${pt(s.plan)} ${spiBadge(s.ratio, s.plan)}</div></div>
      <div class="actions">${tab === 'wbs' ? '<button class="btn primary" data-act="addStage" data-id="' + sc.id + '">＋ 단계 추가</button>' : ''}</div></div>`;
    let body = '';
    if (tab === 'status') body = viewScopeStatus(p, sc, s);
    else if (tab === 'gantt') body = ganttToolbar() + renderGantt(p, [s], false);
    else body = viewWBS(p, sc, s);
    return head + tabs + body;
  }

  function viewScopeStatus(p, sc, s) {
    const st = s.stages;
    const cols = st.map(x => `<th class="n">${esc(x.stage.name)}</th>`).join('');
    const row = (label, f, total, cls) => `<tr class="${cls || ''}"><td class="rowlabel">${label}</td>${st.map(x => `<td class="n">${f(x)}</td>`).join('')}<td class="n"><b>${total ?? ''}</b></td></tr>`;
    const inp = (x, field) => `<input type="number" min="0" step="1" data-b="stage|${x.stage.id}|${field}" data-t="num" value="${+x.stage[field] || 0}">`;
    return `
      <div class="card" style="margin-bottom:16px"><div class="form">
        <label>범위명</label><input data-b="scope|${sc.id}|name" value="${esc(sc.name)}">
        <label>관리책임자</label><input data-b="scope|${sc.id}|manager" value="${esc(sc.manager)}"></div></div>
      ${warnBox(weightWarnings({ scopes: [sc] }, true))}
      ${kpiRow(s.plan, s.act, s.ratio, `태스크 ${s.cnt.tasks}건 · 지연 <b class="neg">${s.cnt.late}</b>건`)}
      <div class="card"><h3>각 단계별 상세 진행 현황 <span class="hint">가중치·Review 문서 수는 표에서 입력</span></h3>
        ${st.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="rowlabel">구분</th>${cols}<th class="n">합계</th></tr></thead><tbody>
          <tr><td class="rowlabel">단계별 가중치</td>${st.map(x => `<td class="n" style="width:100px">${inp(x, 'weight')}</td>`).join('')}<td class="n"><b class="${Math.abs(s.wSum - 100) > 0.001 ? 'neg' : ''}">${s.wSum}</b></td></tr>
          ${row('단계별 시점 누적계획', x => pt(x.wPlan), pt(s.plan))}
          ${row('단계별 시점 누적실적', x => pt(x.wAct), pt(s.act))}
          ${row('시점 누적편차', x => `<span class="${x.wAct - x.wPlan < -0.0005 ? 'neg' : ''}">${sgn(x.wAct - x.wPlan)}</span>`, sgn(s.act - s.plan))}
          ${row('시점 누적계획율', x => pc(x.planRate), pc(s.planRate))}
          ${row('시점 누적실적율', x => pc(x.actRate), pc(s.actRate))}
          ${row('계획대비 실적율', x => pc(x.ratio), pc(s.ratio))}
          ${row('계획된 태스크 수', x => x.cnt.planned, s.cnt.planned)}
          ${row('진행중인 태스크 수', x => x.cnt.prog, s.cnt.prog)}
          ${row('종료된 태스크 수', x => x.cnt.done, s.cnt.done)}
          ${row('지연된 태스크 수', x => x.cnt.late ? `<b class="neg">${x.cnt.late}</b>` : 0, s.cnt.late)}
          <tr><td class="rowlabel">계획된 Review 문서</td>${st.map(x => `<td class="n">${inp(x, 'reviewPlan')}</td>`).join('')}<td class="n"><b>${s.cnt.reviewPlan}</b></td></tr>
          <tr><td class="rowlabel">완료된 Review 문서</td>${st.map(x => `<td class="n">${inp(x, 'reviewDone')}</td>`).join('')}<td class="n"><b>${s.cnt.reviewDone}</b></td></tr>
          ${row('각 단계 Review율', x => pc(x.reviewRate), pc(s.reviewRate))}
          <tr><td class="rowlabel">계획 기간</td>${st.map(x => `<td class="n">${dshort(Calc.ds(x.minPS))}~${dshort(Calc.ds(x.maxPE))}</td>`).join('')}<td></td></tr>
        </tbody></table></div>` : `<div class="empty">단계가 없습니다. <a href="#/scope/${sc.id}/wbs">진행율 입력</a>에서 단계를 추가하세요.</div>`}
      </div>
      <div class="card" style="margin-top:16px"><h3>각 단계별 상세 진행 현황 그래프 <span class="hint">단계별 시점 누적계획율 vs 누적실적율 (%)</span></h3>
        ${Charts.groupedBars(st.map(x => x.stage.name), [
          { name: '시점 누적계획율', color: 'var(--c-plan)', values: st.map(x => x.planRate * 100) },
          { name: '시점 누적실적율', color: 'var(--c-act)', values: st.map(x => x.actRate * 100) }], { max: 100 })}
      </div>`;
  }

  // ---------- WBS 입력 (진행율 입력 시트) ----------
  const COLS = [
    { k: 'task', l: '태스크', w: 220, sticky: 1 },
    { k: 'process', l: '프로세스', w: 100, g: 'wbs' },
    { k: 'activity', l: '액티비티', w: 110, g: 'wbs' },
    { k: 'sub1', l: '세부<br>태스크-1', w: 120, g: 'wbs' },
    { k: 'sub2', l: '세부<br>태스크-2', w: 120, g: 'wbs' },
    { k: 'deliverable', l: '결과물', w: 130, g: 'wbs' },
    { k: 'owner', l: '담당자', w: 80 },
    { k: 'weight', l: '가중치', w: 62, t: 'num' },
    { k: '_J', l: '계획<br>진척', w: 64, calc: 1 },
    { k: 'progress', l: '실제<br>진척(%)', w: 74, t: 'num' },
    { k: '_L', l: '가중치<br>계획', w: 64, calc: 1, g: 'calc' },
    { k: '_M', l: '가중치<br>실적', w: 64, calc: 1, g: 'calc' },
    { k: '_N', l: '편차', w: 64, calc: 1, g: 'calc' },
    { k: '_O', l: '진행<br>상태', w: 70, calc: 1 },
    { k: 'planStart', l: '계획<br>시작일', w: 124, t: 'date' },
    { k: 'planEnd', l: '계획<br>종료일', w: 124, t: 'date' },
    { k: 'planEffort', l: '계획<br>공수(MD)', w: 70, t: 'num', g: 'effort' },
    { k: 'actStart', l: '실제<br>시작일', w: 124, t: 'date' },
    { k: 'actEnd', l: '실제<br>종료일', w: 124, t: 'date' },
    { k: 'actEffort', l: '실제<br>공수(MD)', w: 70, t: 'num', g: 'effort' },
    { k: 'pred', l: '선행<br>태스크No', w: 74, g: 'sched' },
    { k: '_W', l: '일정<br>준수', w: 50, calc: 1, g: 'sched' },
    { k: '_X', l: 'CP<br>(간격)', w: 58, calc: 1, g: 'sched' },
    { k: '_Y', l: '계획<br>작업기간', w: 64, calc: 1, g: 'sched' },
    { k: '_Z', l: '실제<br>작업기간', w: 64, calc: 1, g: 'sched' },
    { k: 'note', l: '비고', w: 180, g: 'note' },
  ];
  const visibleCols = () => COLS.filter(c => !c.g || UI.cols[c.g]);

  function matchesFilter(t, c) {
    if (UI.status && (c.status || '미착수') !== UI.status) return false;
    if (UI.owner && t.owner !== UI.owner) return false;
    if (UI.filter) {
      const q = UI.filter.toLowerCase();
      const hay = [t.task, t.process, t.activity, t.sub1, t.sub2, t.deliverable, t.owner, t.note].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function wbsToolbar(p, sc) {
    const owners = [...new Set(sc.stages.flatMap(st => st.tasks.map(t => t.owner)).filter(Boolean))].sort();
    const chk = (g, l) => `<label><input type="checkbox" data-ui="col:${g}" ${UI.cols[g] ? 'checked' : ''}>${l}</label>`;
    return `<div class="toolbar">
      <input type="search" placeholder="태스크·결과물·담당자 검색" data-ui="filter" value="${esc(UI.filter)}" style="width:220px">
      <select data-ui="status"><option value="">전체 상태</option>${['진행', '지연', '종료', '미착수'].map(s => `<option ${UI.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select data-ui="owner"><option value="">전체 담당자</option>${owners.map(o => `<option ${UI.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
      <div class="grp">${chk('wbs', 'WBS 상세')}${chk('calc', '가중 계산')}${chk('effort', '공수')}${chk('sched', '일정분석')}${chk('note', '비고')}</div>
      <button class="btn sm ghost" data-act="collapseAll" data-id="${sc.id}">단계 접기</button>
      <button class="btn sm ghost" data-act="expandAll" data-id="${sc.id}">단계 펼치기</button>
    </div>`;
  }

  function viewWBS(p, sc, s) {
    const cols = visibleCols();
    const filtering = UI.filter || UI.status || UI.owner;
    let h = wbsToolbar(p, sc);
    h += warnBox(weightWarnings({ scopes: [sc] }, true));
    h += `<div class="tbl-wrap wbs-wrap" data-scroll="wbs"><table class="tbl wbs"><thead><tr>
      <th class="stk0" style="width:46px">No</th>
      ${cols.map(c => `<th class="${c.sticky ? 'stk1' : ''}" style="min-width:${c.w}px;width:${c.w}px">${c.l}</th>`).join('')}
      <th style="width:96px">관리</th></tr></thead><tbody>`;
    if (!sc.stages.length) h += `<tr><td colspan="${cols.length + 2}"><div class="empty">단계가 없습니다. 오른쪽 위 ‘＋ 단계 추가’를 누르세요.</div></td></tr>`;
    s.stages.forEach((x, si) => {
      const st = x.stage;
      const collapsed = !!UI.collapsed[st.id];
      const tSum = st.tasks.reduce((a, t) => a + (+t.weight || 0), 0);
      h += `<tr class="stage"><td class="no stk0"><button class="icon-btn collapse-btn" data-act="toggleStage" data-id="${st.id}" title="접기/펼치기">${collapsed ? '▸' : '▾'}</button>${si + 1}</td>`;
      cols.forEach(c => {
        const sk = c.sticky ? 'stk1' : '';
        if (c.k === 'task') h += `<td class="${sk}"><input data-b="stage|${st.id}|name" value="${esc(st.name)}" placeholder="단계명"></td>`;
        else if (c.k === 'owner') h += `<td class="calc" title="태스크 가중치 합계">${st.tasks.length && Math.abs(tSum - 100) > 0.001 ? `<span class="warn-chip">Σ${tSum}</span>` : `Σ${tSum}`}</td>`;
        else if (c.k === 'weight') h += `<td><input type="number" min="0" step="1" data-b="stage|${st.id}|weight" data-t="num" value="${+st.weight || 0}" title="단계 가중치"></td>`;
        else if (c.k === '_J') h += `<td class="calc" title="단계 시점 누적계획율">${pc(x.planRate)}</td>`;
        else if (c.k === 'progress') h += `<td class="calc" title="단계 시점 누적실적율">${pc(x.actRate)}</td>`;
        else if (c.k === '_L') h += `<td class="calc" title="단계 가중 누적계획">${pt(x.wPlan)}</td>`;
        else if (c.k === '_M') h += `<td class="calc" title="단계 가중 누적실적">${pt(x.wAct)}</td>`;
        else if (c.k === '_N') h += `<td class="calc ${x.wAct - x.wPlan < -0.0005 ? 'neg' : ''}">${sgn(x.wAct - x.wPlan)}</td>`;
        else if (c.k === 'planStart') h += `<td class="calc">${Calc.ds(x.minPS)}</td>`;
        else if (c.k === 'planEnd') h += `<td class="calc">${Calc.ds(x.maxPE)}</td>`;
        else if (c.k === 'actStart') h += `<td class="calc">${Calc.ds(x.minAS)}</td>`;
        else if (c.k === 'actEnd') h += `<td class="calc">${x.maxAE != null && x.cnt.done === x.cnt.tasks ? Calc.ds(x.maxAE) : ''}</td>`;
        else if (c.k === '_Y') h += `<td class="calc">${x.minPS != null ? R.cal.nwd(x.minPS, x.maxPE) : ''}</td>`;
        else h += `<td class="calc"></td>`;
      });
      h += `<td><div class="rowtools">
        <button class="icon-btn" data-act="addTask" data-id="${st.id}" title="태스크 추가">＋</button>
        <button class="icon-btn" data-act="stageUp" data-id="${st.id}" title="위로">↑</button>
        <button class="icon-btn" data-act="stageDown" data-id="${st.id}" title="아래로">↓</button>
        <button class="icon-btn del" data-act="delStage" data-id="${st.id}" title="단계 삭제">✕</button></div></td></tr>`;
      if (collapsed) return;
      x.tasks.forEach((c, ti) => {
        const t = st.tasks[ti];
        if (filtering && !matchesFilter(t, c)) return;
        h += `<tr class="task st-${c.status || 'idle'}"><td class="no stk0">${c.no}</td>`;
        cols.forEach(col => {
          const sk = col.sticky ? 'stk1' : '';
          const b = `task|${t.id}|${col.k}`;
          if (!col.calc) {
            if (col.t === 'date') {
              const bad = (col.k === 'planEnd' && t.planStart && t.planEnd && t.planEnd < t.planStart) || (col.k === 'actEnd' && t.actStart && t.actEnd && t.actEnd < t.actStart);
              h += `<td><input type="date" data-b="${b}" value="${esc(t[col.k])}" class="${bad ? 'bad' : ''}"></td>`;
            } else if (col.k === 'progress') {
              h += `<td class="prog-cell"><input type="number" min="0" max="100" step="5" data-b="${b}" data-t="num" value="${+t.progress || 0}"><span class="bar" style="width:calc(${Math.min(100, +t.progress || 0)}% - 6px)"></span></td>`;
            } else if (col.t === 'num') {
              h += `<td class="${sk}"><input type="number" min="0" step="${col.k === 'weight' ? 1 : 0.5}" data-b="${b}" data-t="num" value="${t[col.k] === '' ? '' : +t[col.k] || 0}"></td>`;
            } else {
              const bad = col.k === 'pred' && c.predMissing;
              h += `<td class="${sk}"><input data-b="${b}" value="${esc(t[col.k])}" ${col.k === 'task' ? 'placeholder="태스크명"' : ''} ${col.k === 'pred' ? 'placeholder="예: 1.2"' : ''} class="${bad ? 'bad' : ''}" ${bad ? 'title="해당 번호의 태스크가 없습니다"' : ''}></td>`;
            }
          } else {
            let v = '';
            if (col.k === '_J') v = pc(c.J);
            else if (col.k === '_L') v = pt(c.L);
            else if (col.k === '_M') v = pt(c.M);
            else if (col.k === '_N') v = `<span class="${c.N < -1e-9 ? 'neg' : ''}">${sgn(c.N)}</span>`;
            else if (col.k === '_O') v = c.status || c.K > 0 || c.J > 0 ? statusBadge(c.status) : '';
            else if (col.k === '_W') v = c.onTime === 'X' ? '<b class="neg">X</b>' : c.onTime === 'O' ? '<b class="pos">O</b>' : '';
            else if (col.k === '_X') v = c.gap === '' ? '' : c.gap < 0 ? `<b class="neg" title="선행 태스크 종료 전에 시작">${c.gap}</b>` : c.gap === 0 ? '<b title="선행 태스크 종료 직후 시작(연속)">0</b>' : c.gap;
            else if (col.k === '_Y') v = c.planDays ?? '';
            else if (col.k === '_Z') v = c.actDays ?? '';
            h += `<td class="calc" style="${col.k === '_O' || col.k === '_W' ? 'text-align:center' : ''}">${v}</td>`;
          }
        });
        h += `<td><div class="rowtools">
          <button class="icon-btn" data-act="insTask" data-id="${t.id}" title="아래에 태스크 삽입">＋</button>
          <button class="icon-btn" data-act="taskUp" data-id="${t.id}" title="위로">↑</button>
          <button class="icon-btn" data-act="taskDown" data-id="${t.id}" title="아래로">↓</button>
          <button class="icon-btn" data-act="dupTask" data-id="${t.id}" title="복제">⧉</button>
          <button class="icon-btn del" data-act="delTask" data-id="${t.id}" title="삭제">✕</button></div></td></tr>`;
      });
    });
    h += `</tbody></table></div>
      <div class="sub" style="margin-top:8px;color:var(--muted);font-size:12px">
        계획진척 = 점검일 기준 경과 영업일 ÷ 계획 영업일(주말·휴일 제외). 가중치계획 = 가중치×계획진척/100, 편차 = 가중치실적 − 가중치계획.
        진행상태: 편차&lt;0 → 지연, 실제진척 100% → 종료. CP(간격) = 선행 태스크 종료 후 시작까지 영업일(0 = 연속, 음수 = 충돌). Enter 키로 아래 행 이동.</div>`;
    return h;
  }

  // ---------- 간트차트 ----------
  function ganttToolbar() {
    const b = (k, l) => `<button class="seg-btn ${UI.gScale === k ? 'on' : ''}" data-act="gScale" data-id="${k}">${l}</button>`;
    return `<div class="toolbar"><div class="grp">${b('day', '일')}${b('week', '주')}${b('month', '월')}</div>
      <div class="legend" style="margin:0 0 0 8px">
        <span class="lg"><i style="background:var(--c-plan)"></i>계획(채움 = 실제진척)</span>
        <span class="lg"><i style="background:var(--c-act)"></i>실제 기간</span>
        <span class="lg"><i style="background:var(--st-crit)"></i>지연 · 점검일</span>
        <span class="lg"><i style="background:var(--st-good)"></i>종료</span></div></div>`;
  }

  function renderGantt(p, scopeResults, showScopes) {
    const ppd = UI.gScale === 'day' ? 26 : UI.gScale === 'month' ? 2.2 : 6;
    let min = null, max = null;
    scopeResults.forEach(s => s.stages.forEach(st => st.tasks.forEach(c => {
      [c.ps, c.as].forEach(v => { if (v != null && (min == null || v < min)) min = v; });
      [c.pe, c.ae].forEach(v => { if (v != null && (max == null || v > max)) max = v; });
    })));
    if (min == null) return '<div class="card"><div class="empty">계획 일정이 입력된 태스크가 없습니다.</div></div>';
    min = Math.min(min, R.check); max = Math.max(max, R.check);
    const d0 = Calc.mondayOf(min) - (UI.gScale === 'month' ? 14 : 7), d1 = Calc.mondayOf(max) + 13;
    const days = d1 - d0 + 1, W = Math.ceil(days * ppd), LW = innerWidth < 760 ? 170 : 300;
    const X = d => (d - d0) * ppd;

    // 머리글: 월 / 주(또는 일)
    let mRow = '', sRow = '';
    for (let d = d0; d <= d1; d++) {
      const s = Calc.ds(d);
      if (d === d0 || s.endsWith('-01')) {
        let e = d; while (e < d1 && !Calc.ds(e + 1).endsWith('-01')) e++;
        mRow += `<div class="g-cell" style="left:${X(d)}px;width:${(e - d + 1) * ppd}px">${s.slice(0, 4)}.${s.slice(5, 7)}</div>`;
      }
    }
    const projStart = Calc.mondayOf(min);
    if (UI.gScale === 'day') {
      for (let d = d0; d <= d1; d++) sRow += `<div class="g-cell" style="left:${X(d)}px;width:${ppd}px;padding-left:0;text-align:center;${R.cal.isWork(d) ? '' : 'color:var(--crit-ink)'}">${+Calc.ds(d).slice(8)}</div>`;
    } else if (UI.gScale === 'week') {
      for (let d = d0; d <= d1; d += 7) {
        const wn = Math.floor((d - projStart) / 7) + 1;
        sRow += `<div class="g-cell" style="left:${X(d)}px;width:${7 * ppd}px;font-size:10px" data-tip="${wn}W · ${Calc.ds(d)} ~ ${Calc.ds(d + 4)}">${wn > 0 ? wn + 'W' : ''}</div>`;
      }
    }
    // 배경: 주말·휴일 음영과 격자
    let bg = '';
    for (let d = d0; d <= d1; d++) {
      const wd = Calc.weekday(d);
      if (UI.gScale === 'day' && (wd === 0 || wd === 6)) bg += `<div class="g-off" style="left:${X(d)}px;width:${ppd}px"></div>`;
      if (UI.gScale !== 'month' && R.cal.hol.has(d) && wd !== 0 && wd !== 6) bg += `<div class="g-hol" style="left:${X(d)}px;width:${ppd}px" data-tip="휴일 ${Calc.ds(d)} ${esc((p.holidays.find(h => h.date === Calc.ds(d)) || {}).name || '')}"></div>`;
      if (UI.gScale === 'month' ? Calc.ds(d).endsWith('-01') : wd === 1) bg += `<div class="g-grid" style="left:${X(d)}px"></div>`;
    }

    const rows = [];
    const left = (no, name, pcTxt, extra) => `<div class="g-left" style="width:${LW}px"><span class="no">${no}</span><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="pc">${pcTxt || ''}</span>${extra || ''}</div>`;
    scopeResults.forEach((s, i) => {
      if (showScopes) {
        const sMin = Math.min(...s.stages.filter(x => x.minPS != null).map(x => x.minPS)), sMax = Math.max(...s.stages.filter(x => x.maxPE != null).map(x => x.maxPE));
        rows.push(`<div class="g-row scope">${left('', s.scope.name, pc(s.actRate))}<div class="g-track" style="width:${W}px">${isFinite(sMin) ? summaryBar(sMin, sMax, s.actRate, X, ppd, `${s.scope.name}\n계획 ${Calc.ds(sMin)} ~ ${Calc.ds(sMax)}\n누적계획율 ${pc(s.planRate)} · 누적실적율 ${pc(s.actRate)}`) : ''}</div></div>`);
      }
      s.stages.forEach((x, si) => {
        const st = x.stage, col = !!UI.collapsed[st.id];
        rows.push(`<div class="g-row stage">${left(`<button class="icon-btn" data-act="toggleStage" data-id="${st.id}">${col ? '▸' : '▾'}</button>`, `${si + 1}. ${st.name}`, pc(x.actRate))}<div class="g-track" style="width:${W}px">${x.minPS != null ? summaryBar(x.minPS, x.maxPE, x.actRate, X, ppd, `${st.name}\n계획 ${Calc.ds(x.minPS)} ~ ${Calc.ds(x.maxPE)}\n계획율 ${pc(x.planRate)} · 실적율 ${pc(x.actRate)}`) : ''}</div></div>`);
        if (col) return;
        x.tasks.forEach((c, ti) => {
          const t = st.tasks[ti];
          const name = t.task || t.activity || '(태스크명 없음)';
          const tip = `${c.no} ${name}${t.owner ? ' · ' + t.owner : ''}\n계획 ${t.planStart || '-'} ~ ${t.planEnd || '-'} (${c.planDays ?? '-'}일)\n실적 ${t.actStart || '-'} ~ ${t.actEnd || (t.actStart ? '진행 중' : '-')}\n계획진척 ${pc(c.J)} · 실제진척 ${pc(c.K)} · ${c.status || '미착수'}`;
          let bars = '';
          if (c.ps != null && c.pe != null) {
            const cls = c.status === '지연' ? 'late' : c.status === '종료' ? 'fin' : '';
            bars += `<div class="g-plan ${cls}" style="left:${X(c.ps)}px;width:${Math.max(3, (c.pe - c.ps + 1) * ppd)}px" data-tip="${esc(tip)}"><div class="done" style="width:${c.K * 100}%"></div></div>`;
          }
          if (c.as != null) {
            const ae = c.ae != null ? c.ae : Math.max(c.as, R.check);
            bars += `<div class="g-act" style="left:${X(c.as)}px;width:${Math.max(3, (ae - c.as + 1) * ppd)}px;${c.ae == null ? 'opacity:.55' : ''}" data-tip="${esc(tip)}"></div>`;
          }
          rows.push(`<div class="g-row">${left(c.no, name, pc(c.K), `<span>${c.status === '지연' ? '<span class="badge crit" style="padding:0 6px">지연</span>' : ''}</span>`)}<div class="g-track" style="width:${W}px">${bars}</div></div>`);
        });
      });
    });
    const checkX = X(R.check) + ppd / 2;
    return `<div class="gantt" data-scroll="gantt"><div class="gantt-inner" style="width:${LW + W}px">
      <div class="g-head"><div class="g-row">${left('', '', '')}<div class="g-track" style="width:${W}px">${mRow}</div></div>
        <div class="g-row">${left('No', '태스크', '실적')}<div class="g-track" style="width:${W}px">${sRow}</div></div></div>
      <div style="position:relative">
        <div style="position:absolute;left:${LW}px;top:0;bottom:0;width:${W}px;pointer-events:auto">${bg}</div>
        <div class="g-check" style="left:${LW + checkX}px"><span>점검일 ${dshort(Calc.ds(R.check))}</span></div>
        <div style="position:relative">${rows.join('')}</div>
      </div></div></div>`;
  }
  function summaryBar(a, b, rate, X, ppd, tip) {
    return `<div class="g-sum" style="left:${X(a)}px;width:${Math.max(3, (b - a + 1) * ppd)}px" data-tip="${esc(tip)}"><div class="done" style="width:${Math.min(100, rate * 100)}%"></div></div>`;
  }

  function viewGanttAll(p) {
    return `<div class="page-head"><div><h1>전체 간트차트</h1><div class="sub">${esc(p.info.projectName)} · 범위 ${R.scopes.length}개 · 태스크 ${R.totals.cnt.tasks}개</div></div></div>
      ${ganttToolbar()}${renderGantt(p, R.scopes, true)}`;
  }

  // ---------- 설정: 범위 · 휴일 ----------
  function viewSettings(p) {
    const scRows = R.scopes.map((s, i) => `<tr>
      <td><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${SCOPE_COLORS[i % 8]}"></span></td>
      <td><input data-b="scope|${s.scope.id}|name" value="${esc(s.scope.name)}"></td>
      <td><input data-b="scope|${s.scope.id}|manager" value="${esc(s.scope.manager)}" placeholder="관리책임자"></td>
      <td class="n" style="width:90px"><input type="number" min="0" max="100" data-b="scope|${s.scope.id}|weight" data-t="num" value="${+s.scope.weight || 0}"></td>
      <td class="n">${s.stages.length}</td><td class="n">${s.cnt.tasks}</td>
      <td><a class="btn sm" href="#/scope/${s.scope.id}/wbs">WBS 입력</a></td>
      <td><button class="icon-btn" data-act="scopeUp" data-id="${s.scope.id}">↑</button><button class="icon-btn" data-act="scopeDown" data-id="${s.scope.id}">↓</button>
        <button class="icon-btn" data-act="dupScope" data-id="${s.scope.id}" title="복제">⧉</button>
        <button class="icon-btn del" data-act="delScope" data-id="${s.scope.id}" title="삭제">✕</button></td></tr>`).join('');
    const hol = p.holidays.map((h, i) => ({ h, i })).sort((a, b) => a.h.date.localeCompare(b.h.date));
    const holRows = hol.map(({ h, i }) => {
      const wd = Calc.dn(h.date) != null ? '일월화수목금토'[Calc.weekday(Calc.dn(h.date))] : '';
      return `<tr><td style="width:150px"><input type="date" data-b="hol|${i}|date" value="${esc(h.date)}"></td><td class="c" style="width:40px">${wd}</td>
        <td><input data-b="hol|${i}|name" value="${esc(h.name)}"></td><td style="width:40px"><button class="icon-btn del" data-act="delHol" data-id="${i}">✕</button></td></tr>`;
    }).join('');
    return `<div class="page-head"><div><h1>범위 · 가중치 · 휴일</h1><div class="sub">범위 가중치 합계는 100이어야 합니다 (현재 ${R.totals.wSum})</div></div></div>
      ${warnBox(weightWarnings(p))}
      <div class="card"><h3>범위 관리 <span class="hint">엑셀의 01~10 범위에 해당 · 개수 제한 없음</span></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>범위명</th><th>관리책임자</th><th class="n">가중치</th><th class="n">단계</th><th class="n">태스크</th><th></th><th>관리</th></tr></thead>
        <tbody>${scRows || '<tr><td colspan="8"><div class="empty">범위가 없습니다.</div></td></tr>'}</tbody>
        <tbody><tr class="total"><td></td><td>합계</td><td></td><td class="n ${Math.abs(R.totals.wSum - 100) > 0.001 ? 'neg' : ''}">${R.totals.wSum}</td><td></td><td class="n">${R.totals.cnt.tasks}</td><td></td><td></td></tr></tbody></table></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="addScope">＋ 범위 추가</button>
          <button class="btn" data-act="evenScopes">가중치 균등 배분</button></div></div>
      <div class="card" style="margin-top:16px"><h3>휴일 리스트 <span class="hint">주 5일 근무제 기준, 평일에 해당하는 휴일 · 계획진척과 작업기간 계산에서 제외</span></h3>
        <div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>월일</th><th class="c">요일</th><th>내용</th><th></th></tr></thead><tbody>${holRows}</tbody></table></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="addHol">＋ 휴일 추가</button>
          <button class="btn" data-act="loadHol2026">2026년 공휴일 추가</button>
          <button class="btn danger" data-act="clearHol">모두 삭제</button></div></div>`;
  }

  // ---------- 문서: 표지 · 승인 · 제개정이력 ----------
  function viewDocs(p) {
    const i = p.info;
    const f = (k, l, ph) => `<label>${l}</label><input data-b="info||${k}" value="${esc(i[k])}" placeholder="${ph || ''}">`;
    const appr = p.approvals.map((a, n) => `<tr>
      <td style="width:90px"><select data-b="appr|${n}|kind">${['승인', '검토', '작성'].map(k => `<option ${a.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
      <td><input data-b="appr|${n}|org" value="${esc(a.org)}"></td><td><input data-b="appr|${n}|name" value="${esc(a.name)}"></td>
      <td style="width:150px"><input type="date" data-b="appr|${n}|date" value="${esc(a.date)}"></td><td><input data-b="appr|${n}|sign" value="${esc(a.sign)}"></td>
      <td style="width:40px"><button class="icon-btn del" data-act="delAppr" data-id="${n}">✕</button></td></tr>`).join('');
    const rev = p.revisions.map((r, n) => `<tr>
      <td style="width:80px"><input data-b="rev|${n}|ver" value="${esc(r.ver)}"></td><td style="width:150px"><input type="date" data-b="rev|${n}|date" value="${esc(r.date)}"></td>
      <td><input data-b="rev|${n}|content" value="${esc(r.content)}"></td><td style="width:120px"><input data-b="rev|${n}|author" value="${esc(r.author)}"></td>
      <td style="width:120px"><input data-b="rev|${n}|reviewer" value="${esc(r.reviewer)}"></td><td style="width:40px"><button class="icon-btn del" data-act="delRev" data-id="${n}">✕</button></td></tr>`).join('');
    return `<div class="page-head"><div><h1>표지 · 문서승인 · 제개정이력</h1><div class="sub">보고서 인쇄와 엑셀 내보내기에 사용됩니다</div></div>
        <div class="actions"><a class="btn" href="#/report">⎙ 보고서 미리보기</a></div></div>
      <div class="card"><h3>표지</h3><div class="form">
        ${f('title', '문서 제목')}${f('subtitle', '소제목')}${f('projectName', '사업명')}${f('period', '사업기간', '2026.01.01 ~ 2026.12.31')}
        ${f('docCode', '문서코드', '프로젝트코드-범위코드-단계코드-XXX_문서명')}${f('dept', '관리부서')}${f('version', '버전')}${f('author', '작성자', '작성자명 및 직함')}
        <label>작성일</label><input type="date" data-b="info||date" value="${esc(i.date)}">${f('approver', '승인자', '승인자명 및 직함')}
        ${f('company', '하단 문구', '㈜회사의 승인없이 본 문서의 복사, 배포, 사용을 금지합니다.')}
        <label>주관기관 로고</label><div class="logo-box">${i.logo ? `<img src="${i.logo}" alt="로고">` : ''}<button class="btn sm" data-act="pickLogo">이미지 선택</button>${i.logo ? '<button class="btn sm danger" data-act="clearLogo">삭제</button>' : ''}</div>
      </div></div>
      <div class="card" style="margin-top:16px"><h3>문서 승인</h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>구분</th><th>소속</th><th>이름</th><th>일자</th><th>서명</th><th></th></tr></thead><tbody>${appr}</tbody></table></div>
        <button class="btn" style="margin-top:10px" data-act="addAppr">＋ 행 추가</button></div>
      <div class="card" style="margin-top:16px"><h3>제·개정 이력 <span class="hint">변경내용: 변경이 발생되는 위치와 변경 내용을 자세히 기록</span></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>버전</th><th>작성일자</th><th>변경내용</th><th>작성자</th><th>검토자</th><th></th></tr></thead><tbody>${rev}</tbody></table></div>
        <button class="btn" style="margin-top:10px" data-act="addRev">＋ 이력 추가</button></div>`;
  }

  // ---------- 보고서(인쇄용) ----------
  function viewReport(p) {
    const i = p.info, T = R.totals;
    const rh = `<div class="rhead"><span>${esc(i.projectName)}</span><span>${esc(i.title)}</span></div>`;
    const tableRows = (items, defs) => defs.map(([label, f, tot]) => `<tr><th style="text-align:left">${label}</th>${items.map(x => `<td class="n">${f(x)}</td>`).join('')}<td class="n"><b>${tot ?? ''}</b></td></tr>`).join('');
    let h = `<div class="page-head"><div><h1>보고서 미리보기</h1><div class="sub">인쇄 시 A4 가로 · 페이지 단위로 출력됩니다</div></div>
      <div class="actions"><button class="btn primary" data-act="print">⎙ 인쇄 / PDF 저장</button></div></div><div class="report">`;
    h += `<div class="rpage"><div class="cover">
      <div>${i.logo ? `<img src="${i.logo}" style="max-height:60px">` : ''}</div>
      <div class="t">${esc(i.title)}</div><div class="st">${esc(i.subtitle)}</div>
      <dl><dt>사 업 명</dt><dd>${esc(i.projectName)}</dd><dt>사업기간</dt><dd>${esc(i.period)}</dd><dt>문서코드</dt><dd>${esc(i.docCode)}</dd></dl>
      <dl class="r"><dt>관리부서</dt><dd>${esc(i.dept)}</dd><dt>버 전</dt><dd>${esc(i.version)}</dd><dt>작 성 자</dt><dd>${esc(i.author)}</dd><dt>작 성 일</dt><dd>${esc(i.date)}</dd><dt>승 인 자</dt><dd>${esc(i.approver)}</dd></dl>
      <div class="foot">${esc(i.company)}</div></div></div>`;
    h += `<div class="rpage">${rh}<h2>문 서 승 인</h2><table><tr><th>구분</th><th>소속</th><th>이름</th><th>일자</th><th>서명</th></tr>
      ${p.approvals.map(a => `<tr style="height:44px"><td style="text-align:center">${esc(a.kind)}</td><td>${esc(a.org)}</td><td>${esc(a.name)}</td><td>${esc(a.date)}</td><td>${esc(a.sign)}</td></tr>`).join('')}</table>
      <h2 style="margin-top:40px">제·개정 이력</h2><table><tr><th>버전</th><th>작성일자</th><th>변경내용</th><th>작성자</th><th>검토자</th></tr>
      ${p.revisions.map(r => `<tr><td>${esc(r.ver)}</td><td>${esc(r.date)}</td><td>${esc(r.content)}</td><td>${esc(r.author)}</td><td>${esc(r.reviewer)}</td></tr>`).join('')}</table></div>`;
    const sc = R.scopes;
    h += `<div class="rpage">${rh}<h2>진척점검 보고서 (전체)</h2>
      <h4>1. 점검마감일자 : ${Calc.ds(R.check)}</h4>
      <h4>2. 전체 진행 현황</h4><table style="width:420px"><tr><th>시점 누적계획</th><td class="n">${pt(T.plan)}%</td></tr><tr><th>시점 누적실적</th><td class="n">${pt(T.act)}%</td></tr><tr><th>계획대비 실적율</th><td class="n">${pc(T.ratio)}</td></tr></table>
      <h4>3. 각 범위별 상세 진행 현황</h4><table><tr><th>구분</th>${sc.map(s => `<th>${esc(s.scope.name)}</th>`).join('')}<th>합계</th></tr>
      ${tableRows(sc, [['범위별 가중치', s => +s.scope.weight || 0, T.wSum], ['범위별 시점 누적계획', s => pt(s.plan)], ['범위별 시점 누적실적', s => pt(s.act)],
        ['시점 누적편차', s => sgn(s.act - s.plan)], ['시점 누적계획율', s => pc(s.planRate)], ['시점 누적실적율', s => pc(s.actRate)], ['계획대비 실적율', s => pc(s.ratio), pc(T.ratio)],
        ['계획된 태스크 수', s => s.cnt.planned, T.cnt.planned], ['진행중인 태스크 수', s => s.cnt.prog, T.cnt.prog], ['종료된 태스크 수', s => s.cnt.done, T.cnt.done], ['지연된 태스크 수', s => s.cnt.late, T.cnt.late],
        ['계획된 Review 문서', s => s.cnt.reviewPlan, T.cnt.reviewPlan], ['완료된 Review 문서', s => s.cnt.reviewDone, T.cnt.reviewDone],
        ['전체 누적계획', s => pt(s.totPlan), pt(T.plan)], ['전체 누적실적', s => pt(s.totAct), pt(T.act)], ['전체 누적편차', s => sgn(s.totAct - s.totPlan), sgn(T.dev)]])}</table>
      <h4>4. 각 범위별 상세 진행 현황 그래프</h4>${Charts.groupedBars(sc.map(s => s.scope.name), [
        { name: '시점 누적계획율', color: '#2a78d6', values: sc.map(s => s.planRate * 100) }, { name: '시점 누적실적율', color: '#eb6834', values: sc.map(s => s.actRate * 100) }], { max: 100, height: 220 })}</div>`;
    sc.forEach(s => {
      const st = s.stages;
      h += `<div class="rpage">${rh}<h2>진척점검 보고서 (${esc(s.scope.name)})</h2>
        <h4>1. 관리책임자 : ${esc(s.scope.manager)}</h4>
        <h4>2. 전체 진행 현황</h4><table style="width:420px"><tr><th>시점 누적계획</th><td class="n">${pt(s.plan)}</td></tr><tr><th>시점 누적실적</th><td class="n">${pt(s.act)}</td></tr><tr><th>계획대비 실적율</th><td class="n">${pc(s.ratio)}</td></tr></table>
        <h4>3. 각 단계별 상세 진행 현황</h4><table><tr><th>구분</th>${st.map(x => `<th>${esc(x.stage.name)}</th>`).join('')}<th>합계</th></tr>
        ${tableRows(st, [['단계별 가중치', x => +x.stage.weight || 0, s.wSum], ['단계별 시점 누적계획', x => pt(x.wPlan), pt(s.plan)], ['단계별 시점 누적실적', x => pt(x.wAct), pt(s.act)],
          ['시점 누적편차', x => sgn(x.wAct - x.wPlan), sgn(s.act - s.plan)], ['시점 누적계획율', x => pc(x.planRate), pc(s.planRate)], ['시점 누적실적율', x => pc(x.actRate), pc(s.actRate)],
          ['계획대비 실적율', x => pc(x.ratio), pc(s.ratio)], ['계획된 태스크 수', x => x.cnt.planned, s.cnt.planned], ['진행중인 태스크 수', x => x.cnt.prog, s.cnt.prog],
          ['종료된 태스크 수', x => x.cnt.done, s.cnt.done], ['지연된 태스크 수', x => x.cnt.late, s.cnt.late], ['계획된 Review 문서', x => +x.stage.reviewPlan || 0, s.cnt.reviewPlan],
          ['완료된 Review 문서', x => +x.stage.reviewDone || 0, s.cnt.reviewDone], ['각 단계 Review율', x => pc(x.reviewRate), pc(s.reviewRate)]])}</table>
        <h4>4. 태스크 진행 현황</h4><table><tr><th>No</th><th>태스크</th><th>결과물</th><th>담당자</th><th>가중치</th><th>계획진척</th><th>실제진척</th><th>상태</th><th>계획기간</th><th>실제기간</th></tr>
        ${st.map((x, si) => `<tr><th>${si + 1}</th><th colspan="3" style="text-align:left">${esc(x.stage.name)}</th><th>${+x.stage.weight || 0}</th><th>${pc(x.planRate)}</th><th>${pc(x.actRate)}</th><th></th><th>${dshort(Calc.ds(x.minPS))}~${dshort(Calc.ds(x.maxPE))}</th><th></th></tr>` +
          x.tasks.map((c, ti) => { const t = x.stage.tasks[ti]; return `<tr><td>${c.no}</td><td>${esc(t.task)}</td><td>${esc(t.deliverable)}</td><td>${esc(t.owner)}</td><td class="n">${+t.weight || 0}</td><td class="n">${pc(c.J)}</td><td class="n">${pc(c.K)}</td><td style="text-align:center;${c.status === '지연' ? 'color:#b42323;font-weight:700' : ''}">${c.status}</td><td>${dshort(t.planStart)}~${dshort(t.planEnd)}</td><td>${dshort(t.actStart)}${t.actStart ? '~' : ''}${dshort(t.actEnd)}</td></tr>`; }).join('')).join('')}</table></div>`;
    });
    return h + '</div>';
  }

  // ---------- 데이터 관리 ----------
  function viewData(p) {
    const projRows = S.data.projects.map(x => `<tr><td>${x.id === p.id ? '<span class="badge prog">현재</span>' : ''}</td><td>${esc(x.info.projectName)}</td><td>${x.scopes.length}</td>
      <td>${x.scopes.reduce((a, s) => a + s.stages.reduce((b, st) => b + st.tasks.length, 0), 0)}</td><td>${esc(x.checkDay)}</td>
      <td>${x.id !== p.id ? `<button class="btn sm" data-act="openProj" data-id="${x.id}">열기</button>` : ''}
        <button class="btn sm" data-act="dupProj" data-id="${x.id}">복제</button>
        <button class="btn sm danger" data-act="delProj" data-id="${x.id}" ${S.data.projects.length < 2 ? 'disabled' : ''}>삭제</button></td></tr>`).join('');
    return `<div class="page-head"><div><h1>가져오기 · 내보내기</h1><div class="sub">저장 위치: ${S.mode === 'server' ? '서버 (data/wbs-data.json — 팀원과 공유)' : '이 브라우저(localStorage) — 공유하려면 server.py로 실행하세요'}</div></div></div>
      <div class="grid g2">
        <div class="card"><h3>엑셀</h3>
          <p class="sub">원본 <b>일정관리및통제결과표 템플릿(.xlsx)</b>을 그대로 가져올 수 있습니다. 표지·문서승인·제개정이력·진행현황·진행율 입력 시트와 휴일 리스트를 읽어 새 프로젝트로 만듭니다.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="importExcel">엑셀 가져오기</button><button class="btn" data-act="exportExcel">현재 프로젝트 엑셀로 내보내기</button></div></div>
        <div class="card"><h3>백업 (JSON)</h3>
          <p class="sub">전체 데이터(모든 프로젝트)를 파일로 백업하거나 복원합니다. 프로젝트 1개만 담긴 파일은 새 프로젝트로 추가됩니다.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="exportJson">전체 백업 받기</button><button class="btn" data-act="exportJsonOne">현재 프로젝트만 받기</button><button class="btn" data-act="importJson">백업 파일 열기</button></div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>프로젝트</h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>사업명</th><th>범위</th><th>태스크</th><th>점검일</th><th></th></tr></thead><tbody>${projRows}</tbody></table></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="newProj">＋ 빈 프로젝트</button><button class="btn" data-act="newSample">＋ 샘플 프로젝트</button></div></div>`;
  }

  // ---------- 입력 바인딩 ----------
  function applyBind(el) {
    const [kind, id, field] = el.dataset.b.split('|');
    let v = el.value;
    if (el.dataset.t === 'num') v = v === '' ? (field.endsWith('Effort') ? '' : 0) : +v;
    if (field === 'progress') v = Math.max(0, Math.min(100, v));
    if (field === 'weight' && v < 0) v = 0;
    Store.update((p) => {
      if (kind === 'task') { const f = Store.findTask(p, id); if (f) f.t[field] = v; }
      else if (kind === 'stage') { const f = Store.findStage(p, id); if (f) f.st[field] = v; }
      else if (kind === 'scope') { const s = Store.findScope(p, id); if (s) s[field] = v; }
      else if (kind === 'info') p.info[field] = v;
      else if (kind === 'hol') p.holidays[+id][field] = v;
      else if (kind === 'appr') p.approvals[+id][field] = v;
      else if (kind === 'rev') p.revisions[+id][field] = v;
    });
  }

  let renderPending = false;
  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => { renderPending = false; render(); }, 0);
  }
  Store.S.listeners.push(kind => { if (kind === 'saved') renderSaveState(); else scheduleRender(); });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.b) return applyBind(el);
    if (el.id === 'checkDay') { if (el.value) Store.update(p => { p.checkDay = el.value; }); return; }
    if (el.id === 'projSelect') { S.data.currentId = el.value; Store.persist(); S.undoStack = []; S.redoStack = []; location.hash = '#/dashboard'; render(); return; }
    if (el.dataset.ui) {
      const k = el.dataset.ui;
      if (k.startsWith('col:')) UI.cols[k.slice(4)] = el.checked;
      else if (k === 'status' || k === 'owner') UI[k] = el.value;
      saveUI(); render();
    }
    if (el.id === 'fileExcel' && el.files[0]) importExcelFile(el.files[0]);
    if (el.id === 'fileJson' && el.files[0]) importJsonFile(el.files[0]);
    if (el.id === 'fileLogo' && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => Store.update(p => { p.info.logo = fr.result; });
      fr.readAsDataURL(el.files[0]);
    }
    if (el.type === 'file') el.value = '';
  });
  document.addEventListener('input', e => {
    if (e.target.dataset.ui === 'filter') { UI.filter = e.target.value; saveUI(); scheduleRender(); }
  });

  // Enter: 같은 열의 다음 행으로 이동 (엑셀처럼)
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (e.key === 'Enter' && el.dataset && el.dataset.b && el.tagName === 'INPUT') {
      e.preventDefault();
      const field = el.dataset.b.split('|')[2];
      const all = $$('input[data-b]').filter(x => x.dataset.b.split('|')[2] === field);
      const idx = all.indexOf(el);
      const next = all[idx + (e.shiftKey ? -1 : 1)];
      if (next) next.focus(); else el.blur();
      return;
    }
    const inField = /INPUT|TEXTAREA|SELECT/.test(el.tagName);
    if ((e.ctrlKey || e.metaKey) && !inField) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); Store.undo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); Store.redo(); }
    }
  });

  // ---------- 버튼 동작 ----------
  const ACT = {
    undo: () => Store.undo(),
    redo: () => Store.redo(),
    navToggle: () => $('#sidenav').classList.toggle('open'),
    theme: () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      UI.theme = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = UI.theme; saveUI();
    },
    checkToday: () => Store.update(p => { p.checkDay = Calc.todayStr(); }),
    print: () => window.print(),
    snapshot: () => Store.update(p => {
      const d = Calc.ds(R.check);
      p.snapshots = p.snapshots.filter(s => s.date !== d);
      p.snapshots.push({ date: d, plan: R.totals.plan, act: R.totals.act, scopes: R.scopes.map(s => ({ id: s.scope.id, plan: s.plan, act: s.act })) });
      p.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    }),
    delSnap: id => Store.update(p => { p.snapshots = p.snapshots.filter(s => s.date !== id); }),

    addScope: () => {
      let newId;
      Store.update(p => {
        const n = String(p.scopes.length + 1).padStart(2, '0');
        const sc = Store.blankScope({ name: n + '.범위명', stages: [Store.blankStage({ name: '단계1', weight: 100, tasks: [Store.blankTask({ weight: 100 })] })] });
        newId = sc.id; p.scopes.push(sc);
      });
      location.hash = '#/scope/' + newId + '/wbs';
    },
    delScope: id => { const sc = Store.findScope(Store.current(), id); if (sc && confirm(`범위 '${sc.name}'와 하위 단계·태스크를 모두 삭제할까요?`)) Store.update(p => { p.scopes = p.scopes.filter(s => s.id !== id); }); },
    dupScope: id => Store.update(p => { const i = p.scopes.findIndex(s => s.id === id); const c = Store.cloneDeepNewIds(p.scopes[i]); c.name += ' (복사)'; p.scopes.splice(i + 1, 0, c); }),
    scopeUp: id => Store.update(p => Store.moveIn(p.scopes, p.scopes.findIndex(s => s.id === id), -1)),
    scopeDown: id => Store.update(p => Store.moveIn(p.scopes, p.scopes.findIndex(s => s.id === id), 1)),
    evenScopes: () => Store.update(p => { const n = p.scopes.length; if (!n) return; const b = Math.floor(100 / n); p.scopes.forEach((s, i) => s.weight = b + (i < 100 - b * n ? 1 : 0)); }),

    addStage: id => Store.update(p => { const sc = Store.findScope(p, id); sc.stages.push(Store.blankStage({ name: '단계' + (sc.stages.length + 1), tasks: [Store.blankTask({ weight: 100 })] })); }),
    delStage: id => { const f = Store.findStage(Store.current(), id); if (f && (!f.st.tasks.length || confirm(`단계 '${f.st.name}'와 태스크 ${f.st.tasks.length}개를 삭제할까요?`))) Store.update(p => { const g = Store.findStage(p, id); g.sc.stages = g.sc.stages.filter(s => s.id !== id); }); },
    stageUp: id => Store.update(p => { const f = Store.findStage(p, id); Store.moveIn(f.sc.stages, f.sc.stages.indexOf(f.st), -1); }),
    stageDown: id => Store.update(p => { const f = Store.findStage(p, id); Store.moveIn(f.sc.stages, f.sc.stages.indexOf(f.st), 1); }),
    toggleStage: id => { UI.collapsed[id] = !UI.collapsed[id]; saveUI(); render(); },
    collapseAll: id => { Store.findScope(Store.current(), id).stages.forEach(s => UI.collapsed[s.id] = true); saveUI(); render(); },
    expandAll: id => { Store.findScope(Store.current(), id).stages.forEach(s => delete UI.collapsed[s.id]); saveUI(); render(); },

    addTask: id => { delete UI.collapsed[id]; Store.update(p => { const f = Store.findStage(p, id); const last = f.st.tasks[f.st.tasks.length - 1]; f.st.tasks.push(Store.blankTask({ process: last ? last.process : '', activity: last ? last.activity : '' })); }); },
    insTask: id => Store.update(p => { const f = Store.findTask(p, id); f.st.tasks.splice(f.i + 1, 0, Store.blankTask({ process: f.t.process, activity: f.t.activity, planStart: f.t.planEnd ? Calc.ds(Calc.dn(f.t.planEnd) + 1) : '' })); }),
    dupTask: id => Store.update(p => { const f = Store.findTask(p, id); const c = Store.cloneDeepNewIds(f.t); c.progress = 0; c.actStart = c.actEnd = ''; f.st.tasks.splice(f.i + 1, 0, c); }),
    delTask: id => Store.update(p => { const f = Store.findTask(p, id); f.st.tasks.splice(f.i, 1); }),
    taskUp: id => Store.update(p => { const f = Store.findTask(p, id); Store.moveIn(f.st.tasks, f.i, -1); }),
    taskDown: id => Store.update(p => { const f = Store.findTask(p, id); Store.moveIn(f.st.tasks, f.i, 1); }),
    gScale: k => { UI.gScale = k; saveUI(); render(); },

    addHol: () => Store.update(p => { p.holidays.push({ date: Calc.todayStr(), name: '휴일' }); }),
    delHol: i => Store.update(p => { p.holidays.splice(+i, 1); }),
    clearHol: () => { if (confirm('휴일을 모두 삭제할까요?')) Store.update(p => { p.holidays = []; }); },
    loadHol2026: () => Store.update(p => { const have = new Set(p.holidays.map(h => h.date)); Store.HOLIDAYS_2026.forEach(h => { if (!have.has(h.date)) p.holidays.push({ ...h }); }); p.holidays.sort((a, b) => a.date.localeCompare(b.date)); }),
    addAppr: () => Store.update(p => { p.approvals.push({ kind: '검토', org: '', name: '', date: '', sign: '' }); }),
    delAppr: i => Store.update(p => { p.approvals.splice(+i, 1); }),
    addRev: () => Store.update(p => { const last = p.revisions[p.revisions.length - 1]; const v = last ? (Math.round((parseFloat(last.ver) || 1) * 10 + 1) / 10).toFixed(1) : '1.0'; p.revisions.push({ ver: v, date: Calc.todayStr(), content: '', author: '', reviewer: '' }); }),
    delRev: i => Store.update(p => { p.revisions.splice(+i, 1); }),
    pickLogo: () => $('#fileLogo').click(),
    clearLogo: () => Store.update(p => { p.info.logo = ''; }),

    importExcel: () => $('#fileExcel').click(),
    exportExcel: () => { try { Excel.exportWorkbook(Store.current()); } catch (e) { alert('엑셀 내보내기 실패: ' + e.message); } },
    importJson: () => $('#fileJson').click(),
    exportJson: () => download('wbs-master-backup-' + Calc.todayStr() + '.json', JSON.stringify(S.data, null, 1)),
    exportJsonOne: () => { const p = Store.current(); download((p.info.projectName || 'project') + '.json', JSON.stringify(p, null, 1)); },
    newProj: () => addProject(Store.blankProject({ scopes: [Store.blankScope({ name: '01.범위명', weight: 100, stages: [Store.blankStage({ name: '단계1', weight: 100, tasks: [Store.blankTask({ weight: 100 })] })] })] })),
    newSample: () => addProject(Store.sampleProject()),
    openProj: id => { S.data.currentId = id; Store.persist(); S.undoStack = []; S.redoStack = []; location.hash = '#/dashboard'; render(); },
    dupProj: id => { const src = S.data.projects.find(x => x.id === id); const c = Store.cloneDeepNewIds(src); c.info.projectName += ' (복사)'; addProject(c); },
    delProj: id => {
      const x = S.data.projects.find(q => q.id === id);
      if (S.data.projects.length < 2 || !confirm(`프로젝트 '${x.info.projectName}'를 삭제할까요?`)) return;
      Store.update((p, d) => { d.projects = d.projects.filter(q => q.id !== id); if (d.currentId === id) d.currentId = d.projects[0].id; });
    },
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = ACT[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b.dataset.id); }
  });

  function addProject(p) {
    Store.migrate(p);
    Store.update((cur, d) => { d.projects.push(p); d.currentId = p.id; });
    location.hash = '#/dashboard';
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name.replace(/[\\/:*?"<>|]/g, '_');
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importExcelFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const p = Excel.importWorkbook(new Uint8Array(fr.result));
        const n = p.scopes.reduce((a, s) => a + s.stages.reduce((b, st) => b + st.tasks.length, 0), 0);
        addProject(p);
        alert(`가져오기 완료: 범위 ${p.scopes.length}개, 태스크 ${n}개`);
      } catch (e) { console.error(e); alert('엑셀을 읽지 못했습니다: ' + e.message); }
    };
    fr.readAsArrayBuffer(file);
  }
  function importJsonFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const j = JSON.parse(fr.result);
        if (j && Array.isArray(j.projects)) {
          if (!confirm(`백업의 프로젝트 ${j.projects.length}개로 현재 데이터를 모두 바꿀까요?`)) return;
          j.projects.forEach(Store.migrate);
          Store.update((p, d) => { d.projects = j.projects; d.currentId = j.currentId && j.projects.find(x => x.id === j.currentId) ? j.currentId : j.projects[0].id; });
          location.hash = '#/dashboard';
        } else if (j && Array.isArray(j.scopes)) {
          if (S.data.projects.find(x => x.id === j.id)) j.id = Store.newId('p');
          addProject(j);
        } else throw new Error('알 수 없는 형식');
      } catch (e) { alert('파일을 읽지 못했습니다: ' + e.message); }
    };
    fr.readAsText(file);
  }

  // ---------- 시작 ----------
  (async function init() {
    if (UI.theme) document.documentElement.dataset.theme = UI.theme;
    Charts.installTooltip();
    await Store.load();
    if (!location.hash) location.hash = '#/dashboard';
    render();
  })();
})();
