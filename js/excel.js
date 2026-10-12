/* 엑셀 가져오기(원본 템플릿 형식) / 내보내기 — SheetJS(vendor/xlsx.full.min.js) 사용 */
(function (global) {
  'use strict';

  const col = (c) => XLSX.utils.decode_col(c);
  function cell(ws, addr) { const c = ws && ws[addr]; return c ? c.v : undefined; }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function num(v) { const n = +v; return isFinite(n) ? n : 0; }
  function serialToStr(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) return Calc.ds(Math.round(v) - 25569); // 1899-12-30 기준 → 1970 기준
    const s = String(v).trim();
    const m = /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/.exec(s);
    return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : '';
  }

  /** 원본 '일정관리및통제결과표' 엑셀 → 프로젝트 객체 */
  function importWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    const p = Store.blankProject();
    const cover = wb.Sheets['표지'];
    if (cover) {
      const t = str(cell(cover, 'B7')); if (t) p.info.title = t;
      p.info.subtitle = str(cell(cover, 'B9')) === '소제목' ? '' : str(cell(cover, 'B9'));
      p.info.projectName = str(cell(cover, 'C13')) || p.info.projectName;
      p.info.period = str(cell(cover, 'C14'));
      p.info.docCode = str(cell(cover, 'C15'));
      p.info.dept = str(cell(cover, 'H17'));
      p.info.version = str(cell(cover, 'H18'));
      p.info.author = str(cell(cover, 'H19'));
      p.info.date = serialToStr(cell(cover, 'H20')) || str(cell(cover, 'H20'));
      p.info.approver = str(cell(cover, 'H21'));
      p.info.company = str(cell(cover, 'A29'));
    }
    const ap = wb.Sheets['문서승인'];
    if (ap) {
      p.approvals = [];
      for (let r = 6; r <= 28; r++) {
        const kind = str(cell(ap, 'A' + r));
        if (!kind) continue;
        p.approvals.push({ kind, org: str(cell(ap, 'B' + r)), name: str(cell(ap, 'C' + r)), date: serialToStr(cell(ap, 'D' + r)), sign: str(cell(ap, 'E' + r)) });
      }
    }
    const rv = wb.Sheets['제개정이력'];
    if (rv) {
      p.revisions = [];
      for (let r = 6; r <= 22; r++) {
        const ver = str(cell(rv, 'A' + r)), content = str(cell(rv, 'C' + r));
        if (!ver && !content) continue;
        p.revisions.push({ ver, date: serialToStr(cell(rv, 'B' + r)), content, author: str(cell(rv, 'D' + r)), reviewer: str(cell(rv, 'E' + r)) });
      }
    }
    const tot = wb.Sheets['진행현황_전체'];
    const scopeMeta = [];
    if (tot) {
      p.checkDay = serialToStr(cell(tot, 'C6')) || p.checkDay;
      for (let i = 0; i < 10; i++) {
        const c = XLSX.utils.encode_col(col('C') + i);
        scopeMeta.push({ name: str(cell(tot, c + '15')), weight: num(cell(tot, c + '16')) });
      }
      const hol = [];
      for (let r = 59; r <= 200; r++) {
        const d = serialToStr(cell(tot, 'C' + r));
        if (d) hol.push({ date: d, name: str(cell(tot, 'D' + r)) });
      }
      if (hol.length) p.holidays = hol;
    }

    const inputSheets = wb.SheetNames.filter(n => /^진행율\s*입력_/.test(n) && !/템플릿/.test(n));
    inputSheets.forEach((name, idx) => {
      const ws = wb.Sheets[name];
      const suffix = name.replace(/^진행율\s*입력_/, '');
      const statusWs = wb.Sheets['진행현황_' + suffix];
      const meta = scopeMeta[idx] || {};
      const sc = Store.blankScope({ name: meta.name || suffix, weight: meta.weight || 0, manager: statusWs ? str(cell(statusWs, 'B6')) : '' });
      if (sc.manager === '책임자') sc.manager = '';
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      let stage = null, stageIdx = -1;
      for (let r = 10; r <= range.e.r + 1; r++) {
        const no = str(cell(ws, 'A' + r));
        if (!no) continue;
        if (/^\d+$/.test(no) && +no > 0) {
          stageIdx++;
          stage = Store.blankStage({ name: str(cell(ws, 'B' + r)) || ('단계' + no), weight: num(cell(ws, 'I' + r)) });
          if (statusWs) {
            const c = XLSX.utils.encode_col(col('B') + stageIdx);
            stage.reviewPlan = num(cell(statusWs, c + '27'));
            stage.reviewDone = num(cell(statusWs, c + '28'));
          }
          sc.stages.push(stage);
          continue;
        }
        if (!stage || !/^\d+\.\d+$/.test(no)) continue;
        const t = Store.blankTask({
          process: str(cell(ws, 'B' + r)), activity: str(cell(ws, 'C' + r)), task: str(cell(ws, 'D' + r)),
          sub1: str(cell(ws, 'E' + r)), sub2: str(cell(ws, 'F' + r)), deliverable: str(cell(ws, 'G' + r)), owner: str(cell(ws, 'H' + r)),
          weight: num(cell(ws, 'I' + r)), progress: Math.round(num(cell(ws, 'K' + r)) * 1000) / 10,
          planStart: serialToStr(cell(ws, 'P' + r)), planEnd: serialToStr(cell(ws, 'Q' + r)), planEffort: str(cell(ws, 'R' + r)),
          actStart: serialToStr(cell(ws, 'S' + r)), actEnd: serialToStr(cell(ws, 'T' + r)), actEffort: str(cell(ws, 'U' + r)),
          pred: str(cell(ws, 'V' + r)),
        });
        const hasText = [t.process, t.activity, t.task, t.sub1, t.sub2, t.deliverable, t.owner].some(Boolean);
        if (hasText || t.planStart || t.planEnd) stage.tasks.push(t);
      }
      // 내용이 없는 단계는 제외
      sc.stages = sc.stages.filter(s => s.tasks.length);
      if (sc.stages.length || sc.weight) p.scopes.push(sc);
    });
    p.info.projectName = p.info.projectName === '사업명 입력' ? '가져온 프로젝트' : p.info.projectName;
    return p;
  }

  const safeSheet = (n, used) => {
    let s = String(n).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
    let k = 1, base = s;
    while (used.has(s)) s = (base.slice(0, 28) + '_' + (++k));
    used.add(s);
    return s;
  };
  const pct = v => Math.round(v * 1000) / 10;
  const r2 = v => Math.round(v * 100) / 100;

  /** 현재 프로젝트 → 원본과 같은 시트 구성의 xlsx (계산 결과를 값으로 기록) */
  function exportWorkbook(p) {
    const R = Calc.computeProject(p);
    const wb = XLSX.utils.book_new();
    const used = new Set();
    const add = (name, aoa, cols) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      if (cols) ws['!cols'] = cols.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, safeSheet(name, used));
    };
    const i = p.info;
    add('표지', [[i.title], [i.subtitle], [], ['사업명', i.projectName], ['사업기간', i.period], ['문서코드', i.docCode], [],
      ['관리부서', i.dept], ['버전', i.version], ['작성자', i.author], ['작성일', i.date], ['승인자', i.approver], [], [i.company]], [14, 50]);
    add('문서승인', [['문서 승인'], [], ['구분', '소속', '이름', '일자', '서명'], ...p.approvals.map(a => [a.kind, a.org, a.name, a.date, a.sign])], [10, 20, 14, 12, 14]);
    add('제개정이력', [['제·개정 이력'], [], ['버전', '작성일자', '변경내용', '작성자', '검토자'], ...p.revisions.map(r => [r.ver, r.date, r.content, r.author, r.reviewer])], [8, 12, 50, 12, 12]);

    const sc = R.scopes;
    const rowOf = (label, f, total) => [label, ...sc.map(f), total === undefined ? '' : total];
    add('진행현황_전체', [
      ['진척점검 보고서 (전체)'], [],
      ['1. 점검마감일자', p.checkDay], [],
      ['2. 전체 진행 현황'], ['시점 누적계획(%)', r2(R.totals.plan)], ['시점 누적실적(%)', r2(R.totals.act)], ['계획대비 실적율(%)', pct(R.totals.ratio)], [],
      ['3. 각 범위별 상세 진행 현황'],
      ['구분', ...sc.map(s => s.scope.name), '합계'],
      rowOf('범위별 가중치', s => +s.scope.weight || 0, R.totals.wSum),
      rowOf('범위별 시점 누적계획', s => r2(s.plan)),
      rowOf('범위별 시점 누적실적', s => r2(s.act)),
      rowOf('시점 누적편차', s => r2(s.act - s.plan)),
      rowOf('시점 누적계획율(%)', s => pct(s.planRate)),
      rowOf('시점 누적실적율(%)', s => pct(s.actRate)),
      rowOf('계획대비 실적율(%)', s => pct(s.ratio)),
      rowOf('계획된 태스크 수', s => s.cnt.planned, R.totals.cnt.planned),
      rowOf('진행중인 태스크 수', s => s.cnt.prog, R.totals.cnt.prog),
      rowOf('종료된 태스크 수', s => s.cnt.done, R.totals.cnt.done),
      rowOf('지연된 태스크 수', s => s.cnt.late, R.totals.cnt.late),
      rowOf('계획된 Review 문서', s => s.cnt.reviewPlan, R.totals.cnt.reviewPlan),
      rowOf('완료된 Review 문서', s => s.cnt.reviewDone, R.totals.cnt.reviewDone),
      rowOf('각 단계 Review율(%)', s => pct(s.reviewRate), pct(R.totals.cnt.reviewPlan ? R.totals.cnt.reviewDone / R.totals.cnt.reviewPlan : 0)),
      rowOf('전체 누적계획', s => r2(s.totPlan), r2(R.totals.plan)),
      rowOf('전체 누적실적', s => r2(s.totAct), r2(R.totals.act)),
      rowOf('전체 누적편차', s => r2(s.totAct - s.totPlan), r2(R.totals.dev)),
      [], ['5. 휴일 리스트'], ['월일', '내용'], ...p.holidays.map(h => [h.date, h.name]),
    ], [24, ...sc.map(() => 14), 10]);

    sc.forEach(s => {
      const st = s.stages;
      const row = (label, f, total) => [label, ...st.map(f), total === undefined ? '' : total];
      add('진행현황_' + s.scope.name, [
        ['진척점검 보고서 (' + s.scope.name + ')'], [], ['1. 관리책임자', s.scope.manager], [],
        ['2. 전체 진행 현황'], ['시점 누적계획', r2(s.plan)], ['시점 누적실적', r2(s.act)], ['계획대비 실적율(%)', pct(s.ratio)], [],
        ['3. 각 단계별 상세 진행 현황'],
        ['구분', ...st.map(x => x.stage.name), '합계'],
        row('단계별 가중치', x => +x.stage.weight || 0, s.wSum),
        row('단계별 시점 누적계획', x => r2(x.wPlan), r2(s.plan)),
        row('단계별 시점 누적실적', x => r2(x.wAct), r2(s.act)),
        row('시점 누적편차', x => r2(x.wAct - x.wPlan), r2(s.act - s.plan)),
        row('시점 누적계획율(%)', x => pct(x.planRate), pct(s.planRate)),
        row('시점 누적실적율(%)', x => pct(x.actRate), pct(s.actRate)),
        row('계획대비 실적율(%)', x => pct(x.ratio), pct(s.ratio)),
        row('계획된 태스크 수', x => x.cnt.planned, s.cnt.planned),
        row('진행중인 태스크 수', x => x.cnt.prog, s.cnt.prog),
        row('종료된 태스크 수', x => x.cnt.done, s.cnt.done),
        row('지연된 태스크 수', x => x.cnt.late, s.cnt.late),
        row('계획된 Review 문서', x => +x.stage.reviewPlan || 0, s.cnt.reviewPlan),
        row('완료된 Review 문서', x => +x.stage.reviewDone || 0, s.cnt.reviewDone),
        row('각 단계 Review율(%)', x => pct(x.reviewRate), pct(s.reviewRate)),
      ], [24, ...st.map(() => 12), 10]);

      const head = ['No', '프로세스', '액티비티', '태스크', '세부 태스크-1', '세부 태스크-2', '결과물', '담당자', '가중치', '계획진척(%)', '실제진척(%)',
        '가중치계획', '가중치실적', '편차', '진행상태', '계획시작일', '계획종료일', '계획공수', '실제시작일', '실제종료일', '실제공수', '선행태스크No',
        '일정준수여부', '선행간격(CP)', '계획작업기간', '실제작업기간', '비고'];
      const aoa = [[s.scope.name], [], head];
      st.forEach((x, si) => {
        aoa.push([String(si + 1), x.stage.name, '', '', '', '', '', '', +x.stage.weight || 0, pct(x.planRate), pct(x.actRate), r2(x.wPlan), r2(x.wAct), r2(x.wAct - x.wPlan), '',
          Calc.ds(x.minPS), Calc.ds(x.maxPE), '', Calc.ds(x.minAS), Calc.ds(x.maxAE)]);
        x.stage.tasks.forEach((t, ti) => {
          const c = x.tasks[ti];
          aoa.push([c.no, t.process, t.activity, t.task, t.sub1, t.sub2, t.deliverable, t.owner, +t.weight || 0, pct(c.J), pct(c.K), r2(c.L), r2(c.M), r2(c.N), c.status,
            t.planStart, t.planEnd, t.planEffort, t.actStart, t.actEnd, t.actEffort, t.pred, c.onTime, c.gap, c.planDays ?? '', c.actDays ?? '', t.note]);
        });
      });
      add('진행율 입력_' + s.scope.name, aoa, [6, 12, 12, 24, 14, 14, 16, 10, 7, 9, 9, 9, 9, 8, 8, 11, 11, 8, 11, 11, 8, 10, 8, 9, 9, 9, 20]);
    });
    const fname = (p.info.projectName || '프로젝트').replace(/[\\/:*?"<>|]/g, '_') + '_일정관리및통제결과표_' + p.checkDay + '.xlsx';
    XLSX.writeFile(wb, fname);
  }

  global.Excel = { importWorkbook, exportWorkbook };
})(window);
