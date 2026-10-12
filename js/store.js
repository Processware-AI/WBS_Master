/* 상태 저장소 — 여러 프로젝트, 자동 저장(서버 또는 브라우저), 실행 취소 */
(function (global) {
  'use strict';

  const LS_KEY = 'wbs-master-v1';
  let uid = Date.now() % 1e6;
  const newId = (p) => (p || 'id') + '_' + (uid++).toString(36) + Math.random().toString(36).slice(2, 6);

  const HOLIDAYS_2026 = [
    ['2026-01-01', '신정'], ['2026-02-16', '설날'], ['2026-02-17', '설날'], ['2026-02-18', '설날'],
    ['2026-03-02', '삼일절(대체공휴일)'], ['2026-05-01', '근로자의날'], ['2026-05-05', '어린이날'],
    ['2026-05-25', '부처님오신날(대체공휴일)'], ['2026-06-03', '전국동시지방선거'],
    ['2026-08-17', '광복절(대체공휴일)'], ['2026-09-24', '추석'], ['2026-09-25', '추석'],
    ['2026-10-05', '개천절(대체공휴일)'], ['2026-10-09', '한글날'], ['2026-12-25', '크리스마스'],
  ].map(([date, name]) => ({ date, name }));

  function blankTask(o) {
    return Object.assign({ id: newId('t'), process: '', activity: '', task: '', sub1: '', sub2: '', deliverable: '', owner: '',
      weight: 0, progress: 0, planStart: '', planEnd: '', planEffort: '', actStart: '', actEnd: '', actEffort: '', pred: '', note: '' }, o || {});
  }
  function blankStage(o) {
    return Object.assign({ id: newId('s'), name: '새 단계', weight: 0, reviewPlan: 0, reviewDone: 0, tasks: [] }, o || {});
  }
  function blankScope(o) {
    return Object.assign({ id: newId('c'), name: '새 범위', manager: '', weight: 0, stages: [] }, o || {});
  }
  function blankProject(o) {
    return Object.assign({
      id: newId('p'),
      info: { title: '일정관리 및 통제표 (2026년)', subtitle: '', projectName: '새 프로젝트', period: '', docCode: '', dept: '', version: 'Ver.1.0', author: '', date: Calc.todayStr(), approver: '', logo: '', company: '' },
      checkDay: Calc.todayStr(),
      holidays: HOLIDAYS_2026.map(h => ({ ...h })),
      approvals: [
        { kind: '승인', org: '', name: '', date: '', sign: '' }, { kind: '승인', org: '', name: '', date: '', sign: '' },
        { kind: '검토', org: '', name: '', date: '', sign: '' }, { kind: '검토', org: '', name: '', date: '', sign: '' },
        { kind: '작성', org: '', name: '', date: '', sign: '' },
      ],
      revisions: [{ ver: '1.0', date: Calc.todayStr(), content: '최초작성', author: '', reviewer: '' }],
      snapshots: [],
      scopes: [],
    }, o || {});
  }

  // 샘플: 2026년 하반기 정보시스템 구축 사업
  function sampleProject() {
    const p = blankProject();
    p.info.projectName = '차세대 업무시스템 구축 사업';
    p.info.subtitle = '주간 진척 점검';
    p.info.period = '2026.07.01 ~ 2026.12.31';
    p.info.docCode = 'NGS-PM-PLN-001_일정관리및통제표';
    p.info.dept = 'PMO';
    p.info.author = '홍길동 PM';
    p.info.approver = '김철수 상무';
    p.checkDay = '2026-10-09';
    const T = (process, activity, task, deliverable, owner, weight, progress, ps, pe, as, ae, pred) =>
      blankTask({ process, activity, task, deliverable, owner, weight, progress, planStart: ps, planEnd: pe, actStart: as || '', actEnd: ae || '', pred: pred || '',
        planEffort: '', actEffort: '' });
    const s1 = blankScope({ name: '01.업무시스템', manager: '이영희 책임', weight: 50, stages: [
      blankStage({ name: '분석', weight: 20, reviewPlan: 3, reviewDone: 3, tasks: [
        T('분석', '요구사항', '요구사항 수집', '요구사항정의서', '이영희', 40, 100, '2026-07-01', '2026-07-17', '2026-07-01', '2026-07-17'),
        T('분석', '요구사항', '현행업무 분석', '현행분석서', '박민수', 30, 100, '2026-07-06', '2026-07-24', '2026-07-06', '2026-07-28', '1.1'),
        T('분석', '요구사항', '요구사항 추적표 작성', '요구사항추적표', '이영희', 30, 100, '2026-07-27', '2026-07-31', '2026-07-29', '2026-08-04', '1.2'),
      ] }),
      blankStage({ name: '설계', weight: 25, reviewPlan: 4, reviewDone: 3, tasks: [
        T('설계', '아키텍처', '아키텍처 설계', '아키텍처정의서', '최수진', 30, 100, '2026-08-03', '2026-08-21', '2026-08-05', '2026-08-24', '1.3'),
        T('설계', '화면', 'UI/UX 설계', '화면설계서', '정다은', 35, 100, '2026-08-10', '2026-09-04', '2026-08-10', '2026-09-04'),
        T('설계', '데이터', '데이터베이스 설계', 'ERD, 테이블정의서', '박민수', 35, 90, '2026-08-17', '2026-09-11', '2026-08-18', ''),
      ] }),
      blankStage({ name: '구현', weight: 35, reviewPlan: 2, reviewDone: 0, tasks: [
        T('구현', '개발', '공통 프레임워크 개발', '소스코드', '최수진', 25, 80, '2026-09-07', '2026-10-02', '2026-09-07', '', '2.1'),
        T('구현', '개발', '업무 기능 개발', '소스코드', '정다은', 50, 35, '2026-09-14', '2026-11-13', '2026-09-16', '', '2.2'),
        T('구현', '개발', '배치/인터페이스 개발', '소스코드', '박민수', 25, 10, '2026-10-05', '2026-11-20', '2026-10-07', '', '2.3'),
      ] }),
      blankStage({ name: '시험', weight: 20, reviewPlan: 2, reviewDone: 0, tasks: [
        T('시험', '테스트', '단위/통합 테스트', '테스트결과서', '이영희', 60, 0, '2026-11-16', '2026-12-11', '', '', '3.2'),
        T('시험', '이행', '데이터 이행 및 오픈', '이행결과서', '박민수', 40, 0, '2026-12-14', '2026-12-31', '', '', '4.1'),
      ] }),
    ] });
    const s2 = blankScope({ name: '02.인프라', manager: '강동원 책임', weight: 30, stages: [
      blankStage({ name: '설계', weight: 30, reviewPlan: 1, reviewDone: 1, tasks: [
        T('인프라', '설계', 'HW/SW 구성 설계', '인프라구성도', '강동원', 100, 100, '2026-07-13', '2026-08-07', '2026-07-13', '2026-08-07'),
      ] }),
      blankStage({ name: '구축', weight: 50, reviewPlan: 1, reviewDone: 0, tasks: [
        T('인프라', '구축', '장비 도입 및 설치', '설치확인서', '강동원', 50, 100, '2026-08-17', '2026-09-18', '2026-08-17', '2026-09-25', '1.1'),
        T('인프라', '구축', '개발/운영 환경 구성', '환경구성서', '윤서연', 50, 60, '2026-09-21', '2026-10-16', '2026-09-28', '', '2.1'),
      ] }),
      blankStage({ name: '안정화', weight: 20, tasks: [
        T('인프라', '안정화', '성능/보안 점검', '점검결과서', '윤서연', 100, 0, '2026-11-23', '2026-12-18', '', '', '2.2'),
      ] }),
    ] });
    const s3 = blankScope({ name: '03.사업관리', manager: '홍길동 PM', weight: 20, stages: [
      blankStage({ name: '착수', weight: 20, reviewPlan: 2, reviewDone: 2, tasks: [
        T('관리', '착수', '사업수행계획 수립', '사업수행계획서', '홍길동', 100, 100, '2026-07-01', '2026-07-10', '2026-07-01', '2026-07-10'),
      ] }),
      blankStage({ name: '수행관리', weight: 60, tasks: [
        T('관리', '보고', '주간/월간 보고', '주간보고서', '홍길동', 60, 55, '2026-07-13', '2026-12-25', '2026-07-13', ''),
        T('관리', '품질', '단계별 품질 점검', '품질점검결과서', '김하늘', 40, 50, '2026-08-03', '2026-12-18', '2026-08-03', ''),
      ] }),
      blankStage({ name: '종료', weight: 20, tasks: [
        T('관리', '종료', '사업 완료 보고', '완료보고서', '홍길동', 100, 0, '2026-12-21', '2026-12-31', '', ''),
      ] }),
    ] });
    p.scopes = [s1, s2, s3];
    p.snapshots = [];
    // 과거 점검 결과(실적 추이)를 샘플로 채워 넣기: 실적 = 계획의 일정 비율로 가정
    [['2026-07-31', 1.0], ['2026-08-28', 0.97], ['2026-09-25', 0.93]].forEach(([d, f]) => {
      const r = Calc.computeProject(p, Calc.dn(d));
      p.snapshots.push({ date: d, plan: r.totals.plan, act: r.totals.plan * f, scopes: r.scopes.map(s => ({ id: s.scope.id, plan: s.plan, act: s.plan * f })) });
    });
    return p;
  }

  // ---------- 영속화 ----------
  const S = {
    data: null,         // { projects: [], currentId }
    mode: 'local',      // 'server' | 'local'
    listeners: [],
    undoStack: [], redoStack: [],
    saveTimer: null, lastSaved: null, saveError: null,
  };

  async function load() {
    try {
      const r = await fetch('api/state', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        S.mode = 'server';
        S.data = j && j.projects ? j : null;
      }
    } catch (e) { /* file:// 등 서버가 없으면 브라우저 저장소 사용 */ }
    if (S.mode === 'local') {
      try { S.data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { S.data = null; }
    }
    if (!S.data || !Array.isArray(S.data.projects) || !S.data.projects.length) {
      const sp = sampleProject();
      S.data = { projects: [sp], currentId: sp.id };
      persist();
    }
    S.data.projects.forEach(migrate);
    if (!S.data.projects.find(p => p.id === S.data.currentId)) S.data.currentId = S.data.projects[0].id;
  }

  function migrate(p) {
    const b = blankProject();
    Object.keys(b).forEach(k => { if (p[k] === undefined) p[k] = b[k]; });
    p.info = Object.assign({}, b.info, p.info);
    p.scopes.forEach(sc => sc.stages.forEach(st => {
      if (st.reviewPlan === undefined) st.reviewPlan = 0;
      if (st.reviewDone === undefined) st.reviewDone = 0;
      st.tasks = st.tasks.map(t => blankTask(t));
    }));
  }

  function persist() {
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(async () => {
      const body = JSON.stringify(S.data);
      try {
        if (S.mode === 'server') {
          const r = await fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
          if (!r.ok) throw new Error('HTTP ' + r.status);
        } else {
          localStorage.setItem(LS_KEY, body);
        }
        S.lastSaved = new Date(); S.saveError = null;
      } catch (e) {
        S.saveError = e.message || String(e);
      }
      emit('saved');
    }, 400);
  }

  function emit(kind) { S.listeners.forEach(fn => fn(kind)); }

  function current() { return S.data.projects.find(p => p.id === S.data.currentId); }

  /** 모든 변경은 update()를 통해: 실행 취소 기록 + 저장 + 다시 그리기 */
  function update(fn, opts) {
    const before = JSON.stringify(S.data);
    fn(current(), S.data);
    const after = JSON.stringify(S.data);
    if (before === after) return;
    if (!opts || !opts.noUndo) {
      S.undoStack.push(before);
      if (S.undoStack.length > 80) S.undoStack.shift();
      S.redoStack = [];
    }
    persist();
    emit('change');
  }
  function undo() {
    if (!S.undoStack.length) return;
    S.redoStack.push(JSON.stringify(S.data));
    S.data = JSON.parse(S.undoStack.pop());
    persist(); emit('change');
  }
  function redo() {
    if (!S.redoStack.length) return;
    S.undoStack.push(JSON.stringify(S.data));
    S.data = JSON.parse(S.redoStack.pop());
    persist(); emit('change');
  }

  // 트리 탐색 도우미
  function findScope(p, id) { return p.scopes.find(s => s.id === id); }
  function findStage(p, id) { for (const sc of p.scopes) { const st = sc.stages.find(s => s.id === id); if (st) return { sc, st }; } return null; }
  function findTask(p, id) {
    for (const sc of p.scopes) for (const st of sc.stages) { const i = st.tasks.findIndex(t => t.id === id); if (i >= 0) return { sc, st, t: st.tasks[i], i }; }
    return null;
  }
  function moveIn(arr, idx, delta) {
    const j = idx + delta;
    if (j < 0 || j >= arr.length) return;
    const [x] = arr.splice(idx, 1); arr.splice(j, 0, x);
  }
  function cloneDeepNewIds(obj) {
    const c = JSON.parse(JSON.stringify(obj));
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object') {
        if (o.id) o.id = newId(o.id.split('_')[0]);
        Object.values(o).forEach(walk);
      }
    })(c);
    return c;
  }

  global.Store = { S, load, current, update, undo, redo, persist, emit, newId, blankTask, blankStage, blankScope, blankProject, sampleProject,
    findScope, findStage, findTask, moveIn, cloneDeepNewIds, migrate, HOLIDAYS_2026 };
})(window);
