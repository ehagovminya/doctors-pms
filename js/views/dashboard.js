import { ctx, route, setTitle, topFilters, monthData, chart, hospName, loadRecords, loadDepts, resultFor, loadDoctors } from '../core.js';
import { can } from '../store.js';
import { CATEGORY_LABELS } from '../defaults.js';
import { esc, icons, money, num, pctf, monthLabel, classChip, avatar } from '../ui.js';

const kpi = (ic, lbl, val, sub = '') => `<div class="kpi"><div class="ic">${ic}</div><div><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sum = (a) => a.reduce((x, y) => x + y, 0);

route('dashboard', async (view) => {
  setTitle('لوحة التحكم', `${ctx.settings.orgName} — ${ctx.settings.branchName}`);
  await topFilters();
  const { rows } = await monthData();
  const S = ctx.settings;

  if (!rows.length) {
    view.innerHTML = `<div class="card empty">لا توجد بيانات لشهر ${monthLabel(ctx.month)}${ctx.hospitalId ? ' في ' + esc(hospName(ctx.hospitalId)) : ''}.<br><br>${can.editData(ctx.user) ? '<a class="btn primary" href="#/upload">رفع بيانات الشهر</a>' : ''}</div>`;
    return;
  }

  const F = rows.map(r => r.res.financial);
  const totalGross = sum(F.map(f => f.totalGross));
  const totalNet = sum(F.map(f => f.totalNet));
  const totalEnt = sum(F.map(f => f.entitlement));
  const withEnt = rows.filter(r => r.res.financial.entitlement);
  const dpcAvg = avg(rows.map(r => r.res.dpc.average));
  const vals = rows.map(r => r.res.clinical.valueIndex).filter(v => v !== null);
  const counts = { draft: 0, submitted: 0, approved: 0 };
  rows.forEach(r => counts[r.rec.status || 'draft']++);
  const cls = Object.fromEntries(S.classes.map(c => [c.code, 0]));
  withEnt.forEach(r => { if (r.res.financial.classification) cls[r.res.financial.classification]++; });
  const warnCount = rows.filter(r => r.res.warnings.length).length;

  view.innerHTML = `
  <div class="grid g4">
    ${kpi(icons.doc, 'عدد الأطباء بالشهر', num(rows.length, 0), `${counts.approved} معتمد · ${counts.submitted} بانتظار الاعتماد · ${counts.draft} مسودة`)}
    ${kpi(icons.money, 'إجمالي الإنتاجية', money(totalGross), 'مجموع إنتاجيات الخدمات')}
    ${kpi(icons.chart, 'صافي إنتاجية الأطباء', money(totalNet), `مقابل استحقاق ${money(totalEnt)}`)}
    ${kpi(icons.check, 'معدل الإنتاجية الإجمالي', num(totalEnt ? totalNet / totalEnt : 0), 'صافي الإنتاجية ÷ الاستحقاق')}
    ${kpi(icons.card, 'متوسط إنتاجية DPC', pctf(dpcAvg), 'متوسط Average Doc P.R')}
    ${kpi(icons.heart, 'متوسط مؤشر القيمة', vals.length ? num(avg(vals), 1) : '-', 'النتائج السريرية والجودة')}
    ${kpi(icons.alert, 'سجلات بها ملاحظات', num(warnCount, 0), 'تحتاج مراجعة قبل الاعتماد')}
    ${kpi(icons.hosp, 'المستشفيات', num(new Set(rows.map(r => r.rec.hospitalId)).size, 0), ctx.hospitalId ? esc(hospName(ctx.hospitalId)) : 'كل المستشفيات')}
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>توزيع الأطباء حسب تصنيف الإنتاجية</h2><div style="height:260px"><canvas id="cCls"></canvas></div>
      <div class="row" style="margin-top:8px">${S.classes.map(c => `<span class="hint">${classChip(c.code)} ${esc(c.ar)}</span>`).join(' ')}</div></div>
    <div class="card"><h2>متوسط إنتاجية DPC حسب التخصص</h2><div style="height:290px"><canvas id="cSpec"></canvas></div></div>
  </div>

  <div class="card" style="margin-top:16px"><h2>الاتجاه الشهري — صافي الإنتاجية مقابل الاستحقاق</h2><div style="height:280px"><canvas id="cTrend"></canvas></div></div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>الأعلى إنتاجية (معدل الإنتاجية)</h2>${topList([...withEnt].sort((a, b) => b.res.financial.rate - a.res.financial.rate).slice(0, 6))}</div>
    <div class="card"><h2>الأقل إنتاجية — تحتاج خطة تحسين</h2>${topList([...withEnt].sort((a, b) => a.res.financial.rate - b.res.financial.rate).slice(0, 6))}</div>
  </div>

  ${can.seeAllHospitals(ctx.user) && !ctx.hospitalId ? `<div class="card" style="margin-top:16px"><h2>مقارنة المستشفيات</h2>${hospTable(rows)}</div>` : ''}
  `;

  chart(document.getElementById('cCls'), {
    type: 'bar',
    data: { labels: S.classes.map(c => c.code), datasets: [{ data: S.classes.map(c => cls[c.code]), backgroundColor: S.classes.map(c => c.color), borderRadius: 8 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  const bySpec = {};
  rows.forEach(r => { (bySpec[r.doctor.specialty] ||= []).push(r.res.dpc.average); });
  const specs = Object.entries(bySpec).map(([k, v]) => [k, avg(v)]).sort((a, b) => b[1] - a[1]);
  chart(document.getElementById('cSpec'), {
    type: 'bar',
    data: { labels: specs.map(s => s[0]), datasets: [{ data: specs.map(s => Math.round(s[1] * 100)), backgroundColor: '#5cc7d6', borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.raw + '%' } } }, scales: { x: { beginAtZero: true, ticks: { callback: v => v + '%' } } } },
  });

  // الاتجاه الشهري
  await loadDoctors();
  const [allRecs, allDepts] = await Promise.all([loadRecords(), loadDepts()]);
  const byMonth = {};
  allRecs.filter(r => !ctx.hospitalId || r.hospitalId === ctx.hospitalId).forEach(r => {
    const d = ctx.doctors[r.doctorId]; if (!d) return;
    const res = resultFor(d, r, allDepts);
    const m = (byMonth[r.month] ||= { net: 0, ent: 0, gross: 0 });
    m.net += res.financial.totalNet; m.ent += res.financial.entitlement; m.gross += res.financial.totalGross;
  });
  const ms = Object.keys(byMonth).sort().slice(-12);
  chart(document.getElementById('cTrend'), {
    type: 'line',
    data: {
      labels: ms.map(monthLabel), datasets: [
        { label: 'صافي إنتاجية الأطباء', data: ms.map(m => Math.round(byMonth[m].net)), borderColor: '#17a2a0', backgroundColor: 'rgba(23,162,160,.12)', fill: true, tension: .3 },
        { label: 'إجمالي الاستحقاق', data: ms.map(m => Math.round(byMonth[m].ent)), borderColor: '#0d2b4e', tension: .3 },
      ],
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
  });
});

function topList(list) {
  if (!list.length) return '<div class="empty">لا يوجد</div>';
  return `<table class="t"><tbody>${list.map(r => `<tr style="cursor:pointer" onclick="location.hash='#/doctor/${r.doctor.id}'">
    <td style="width:50px">${avatar(r.doctor).replace('class="avatar ', 'style="width:38px;height:38px;font-size:13px;margin:0;border-width:2px" class="avatar ')}</td>
    <td><b>${esc(r.doctor.name)}</b><div class="hint">${esc(r.doctor.specialty)} — ${esc(hospName(r.doctor.hospitalId))}</div></td>
    <td class="num">${num(r.res.financial.rate)}</td><td>${classChip(r.res.financial.classification)}</td></tr>`).join('')}</tbody></table>`;
}

function hospTable(rows) {
  const by = {};
  rows.forEach(r => {
    const h = (by[r.rec.hospitalId] ||= { n: 0, gross: 0, net: 0, ent: 0, dpc: [] });
    h.n++; h.gross += r.res.financial.totalGross; h.net += r.res.financial.totalNet; h.ent += r.res.financial.entitlement; h.dpc.push(r.res.dpc.average);
  });
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>المستشفى</th><th>الأطباء</th><th>إجمالي الإنتاجية</th><th>صافي إنتاجية الأطباء</th><th>الاستحقاق</th><th>معدل الإنتاجية</th><th>متوسط DPC</th></tr></thead><tbody>
  ${Object.entries(by).map(([id, h]) => `<tr><td><b>${esc(hospName(id))}</b></td><td>${h.n}</td><td>${money(h.gross)}</td><td>${money(h.net)}</td><td>${money(h.ent)}</td><td class="num">${num(h.ent ? h.net / h.ent : 0)}</td><td>${pctf(avg(h.dpc))}</td></tr>`).join('')}
  </tbody></table></div>`;
}

void CATEGORY_LABELS;
