/* 계산 엔진 — 엑셀 '일정관리 및 통제표'의 수식을 그대로 재현한다.
 *
 * 계층: 프로젝트 → 범위(Scope, 가중치 합 100) → 단계(Stage, 범위 내 가중치 합 100)
 *       → 태스크(Task, 단계 내 가중치 합 100)
 *
 *  태스크  J 계획진척 = 점검일≥계획종료 ? 1 : 점검일<계획시작 ? 0 : 경과영업일/계획영업일
 *          K 실제진척 = 입력값(0~100%)
 *          L 가중치계획 = 가중치 × J / 100,  M 가중치실적 = 가중치 × K / 100,  N 편차 = M − L
 *          O 진행상태 = (K=0 & N=0) ? '' : N<0 ? 지연 : K=100% ? 종료 : 진행
 *  단계    계획율 = ΣL, 실적율 = ΣM,  가중 누적계획 = ΣL × 단계가중치 (범위 기준 %p)
 *  범위    시점 누적계획 = Σ 단계 가중 누적계획 (0~100)
 *  전체    누적계획 = Σ 범위 누적계획 × 범위가중치 / 100
 */
(function (global) {
  'use strict';

  const DAY = 86400000;

  // 'YYYY-MM-DD' → 1970-01-01 기준 일수 (UTC, 시간대 영향 없음)
  function dn(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  }
  function ds(n) {
    if (n == null || isNaN(n)) return '';
    const d = new Date(n * DAY);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function weekday(n) { return ((n % 7) + 11) % 7; } // 0=일 ... 6=토 (1970-01-01 = 목)
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function mondayOf(n) { return n - ((weekday(n) + 6) % 7); }

  // 엑셀 NETWORKDAYS: 시작·종료 포함, 주말·휴일 제외. 종료<시작이면 음수.
  function makeCalendar(holidays) {
    const hol = new Set((holidays || []).map(h => dn(h.date)).filter(v => v != null));
    const cache = new Map();
    function isWork(n) { const w = weekday(n); return w !== 0 && w !== 6 && !hol.has(n); }
    function nwd(a, b) {
      if (a == null || b == null) return null;
      if (b < a) return -nwd(b, a);
      const key = a * 100000 + b;
      let v = cache.get(key);
      if (v !== undefined) return v;
      v = 0;
      for (let i = a; i <= b; i++) if (isWork(i)) v++;
      cache.set(key, v);
      return v;
    }
    return { nwd, isWork, hol };
  }

  function taskNo(si, ti) { return (si + 1) + '.' + (ti + 1); }

  function computeTask(t, check, cal) {
    const ps = dn(t.planStart), pe = dn(t.planEnd), as = dn(t.actStart), ae = dn(t.actEnd);
    const w = +t.weight || 0;
    const planDays = ps != null && pe != null ? cal.nwd(ps, pe) : null;
    let J = 0;
    if (ps != null && pe != null) {
      if (check >= pe) J = 1;
      else if (check < ps) J = 0;
      else J = planDays > 0 ? Math.min(1, cal.nwd(ps, check) / planDays) : 1;
    }
    const K = Math.max(0, Math.min(100, +t.progress || 0)) / 100;
    const L = w * J / 100, M = w * K / 100, N = M - L;
    const eps = 1e-9;
    let status = '';
    if (!(K === 0 && Math.abs(N) < eps)) status = N < -eps ? '지연' : K >= 1 ? '종료' : '진행';
    let onTime = '';
    if (ae != null && pe != null) onTime = ae <= pe ? 'O' : 'X';
    else if (pe != null && check > pe && K < 1) onTime = 'X';
    const actDays = as != null ? cal.nwd(as, ae != null ? ae : Math.max(as, check)) : null;
    return { J, K, L, M, N, status, onTime, planDays, actDays, ps, pe, as, ae };
  }

  /** 프로젝트 전체를 점검일 기준으로 계산. checkOverride로 임의 일자 계산(S-커브용) 가능 */
  function computeProject(p, checkOverride) {
    const cal = makeCalendar(p.holidays);
    const check = checkOverride != null ? checkOverride : (dn(p.checkDay) ?? dn(todayStr()));
    const res = { check, cal, scopes: [], byTask: new Map(), totals: null };
    let totPlan = 0, totAct = 0, wSum = 0;
    const cnt = { planned: 0, prog: 0, done: 0, late: 0, idle: 0, tasks: 0, reviewPlan: 0, reviewDone: 0 };
    let minD = null, maxD = null;

    p.scopes.forEach((sc, sci) => {
      // 선행 태스크 번호 → 태스크 매핑 (범위 내)
      const noMap = new Map();
      sc.stages.forEach((st, si) => st.tasks.forEach((t, ti) => noMap.set(taskNo(si, ti), t)));
      const scr = { scope: sc, stages: [], plan: 0, act: 0, wSum: 0, cnt: { planned: 0, prog: 0, done: 0, late: 0, idle: 0, tasks: 0, reviewPlan: 0, reviewDone: 0 }, minD: null, maxD: null };
      sc.stages.forEach((st, si) => {
        const sw = +st.weight || 0;
        const str = { stage: st, tasks: [], planRate: 0, actRate: 0, wPlan: 0, wAct: 0, tWeight: 0, minPS: null, maxPE: null, minAS: null, maxAE: null,
          cnt: { planned: 0, prog: 0, done: 0, late: 0, idle: 0, tasks: 0 } };
        st.tasks.forEach((t, ti) => {
          const r = computeTask(t, check, cal);
          r.no = taskNo(si, ti);
          // 선행 태스크와의 간격(영업일). 0 = 연속(크리티컬), 음수 = 일정 충돌
          r.gap = '';
          const preds = String(t.pred || '').split(/[,\s]+/).filter(Boolean);
          if (preds.length && r.ps != null) {
            let maxPredEnd = null;
            preds.forEach(no => { const pt = noMap.get(no); const e = pt ? dn(pt.planEnd) : null; if (e != null && (maxPredEnd == null || e > maxPredEnd)) maxPredEnd = e; });
            if (maxPredEnd != null) r.gap = r.ps > maxPredEnd ? cal.nwd(maxPredEnd + 1, r.ps - 1) : -cal.nwd(r.ps, maxPredEnd);
            r.predMissing = preds.some(no => !noMap.has(no));
          }
          res.byTask.set(t.id, r);
          str.tasks.push(r);
          str.planRate += r.L; str.actRate += r.M; str.tWeight += +t.weight || 0;
          str.cnt.tasks++;
          if (r.J > 0) str.cnt.planned++;
          if (r.status === '진행') str.cnt.prog++;
          else if (r.status === '종료') str.cnt.done++;
          else if (r.status === '지연') str.cnt.late++;
          else str.cnt.idle++;
          const mn = (a, b) => a == null ? b : b == null ? a : Math.min(a, b);
          const mx = (a, b) => a == null ? b : b == null ? a : Math.max(a, b);
          str.minPS = mn(str.minPS, r.ps); str.maxPE = mx(str.maxPE, r.pe);
          str.minAS = mn(str.minAS, r.as); str.maxAE = mx(str.maxAE, r.ae);
          minD = mn(minD, mn(r.ps, r.as)); maxD = mx(maxD, mx(r.pe, r.ae));
          scr.minD = mn(scr.minD, r.ps); scr.maxD = mx(scr.maxD, r.pe);
        });
        str.wPlan = str.planRate * sw;
        str.wAct = str.actRate * sw;
        str.ratio = str.wPlan ? str.wAct / str.wPlan : 0;
        str.reviewRate = +st.reviewPlan ? (+st.reviewDone || 0) / +st.reviewPlan : 0;
        scr.stages.push(str);
        scr.plan += str.wPlan; scr.act += str.wAct; scr.wSum += sw;
        ['planned', 'prog', 'done', 'late', 'idle', 'tasks'].forEach(k => scr.cnt[k] += str.cnt[k]);
        scr.cnt.reviewPlan += +st.reviewPlan || 0; scr.cnt.reviewDone += +st.reviewDone || 0;
      });
      scr.ratio = scr.plan ? scr.act / scr.plan : 0;
      scr.planRate = scr.wSum ? scr.plan / scr.wSum : 0;
      scr.actRate = scr.wSum ? scr.act / scr.wSum : 0;
      scr.reviewRate = scr.cnt.reviewPlan ? scr.cnt.reviewDone / scr.cnt.reviewPlan : 0;
      const w = +sc.weight || 0;
      scr.totPlan = scr.plan * w / 100;
      scr.totAct = scr.act * w / 100;
      totPlan += scr.totPlan; totAct += scr.totAct; wSum += w;
      Object.keys(cnt).forEach(k => cnt[k] += scr.cnt[k]);
      res.scopes.push(scr);
    });
    res.totals = { plan: totPlan, act: totAct, dev: totAct - totPlan, ratio: totPlan ? totAct / totPlan : 0, wSum, cnt, minD, maxD };
    return res;
  }

  /** 주 단위 계획 누적 S-커브 (점검일과 무관하게 각 주 금요일 기준으로 재계산) */
  function planCurve(p) {
    const base = computeProject(p);
    const { minD, maxD } = base.totals;
    if (minD == null || maxD == null) return [];
    const pts = [];
    for (let m = mondayOf(minD); m <= maxD + 6; m += 7) {
      const fri = m + 4;
      pts.push({ d: fri, plan: computeProject(p, fri).totals.plan });
    }
    return pts;
  }

  global.Calc = { dn, ds, weekday, todayStr, mondayOf, makeCalendar, computeProject, computeTask, planCurve, taskNo };
})(window);
