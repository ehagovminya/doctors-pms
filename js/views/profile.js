import { ctx, route, setTitle, loadDoctors, loadRecords, loadDepts, resultFor, hospName, chart, go, invalidate } from '../core.js';
import { store, can } from '../store.js';
import { CATEGORY_LABELS } from '../defaults.js';
import { esc, $, $$, icons, avatar, money, num, pctf, pct100, monthLabel, statusChip, classChip, toast, confirmBox, dash } from '../ui.js';
import { doctorForm } from './doctors.js';
import { openRecordEditor, approveRecords, returnRecords, submitRecords } from './data.js';

export const tile = (lbl, val, hl = false, ic = '') => `<div class="ind ${hl ? 'hl' : ''}"><div class="ic">${ic || '•'}</div><div><div class="lbl">${lbl}</div><div class="val">${val}</div></div></div>`;
export const group = (code, title, tiles, cols = 3) => `<div class="ind-group"><h4><span class="code">${code}</span>${title}</h4><div class="grid g${cols}">${tiles.join('')}</div></div>`;

export function financialHTML(res, S) {
  const F = res.financial, O = F.ops;
  const cat = S.categories[res.category];
  return `
  ${group('F1', 'العيادات الخارجية', [
    tile(`إجمالي إنتاجية العيادات <br><small>الحالات × سعر الكشف (${num(F.price, 0)} جنيه)</small>`, money(F.clinicGross)),
    tile(`صافي إنتاجية العيادات <br><small>بعد خصم ${cat.cost}% تكاليف (${CATEGORY_LABELS[res.category]})</small>`, money(F.clinicNet)),
    tile(`صافي إنتاجية الطبيب بالعيادة <br><small>${cat.docShare}% من الصافي</small>`, money(F.clinicDoctorNet), true),
  ])}
  ${group('F2', 'المعمل', [tile('إنتاجية المعمل (قيمة الفحوصات المحولة)', money(F.labValue)), tile(`نسبة الطبيب من المعمل ${S.services.lab}%`, money(F.labShare), true)], 2)}
  ${group('F3', 'الأشعة', [tile('إنتاجية الأشعة (قيمة الفحوصات المحولة)', money(F.radValue)), tile(`نسبة الطبيب من الأشعة ${S.services.rad}%`, money(F.radShare), true)], 2)}
  ${group('F4', 'الصيدلية', [tile('إنتاجية الصيدلية (قيمة الأدوية المصروفة)', money(F.pharmValue)), tile(`نسبة الطبيب من الصيدلية ${S.services.pharm}%`, money(F.pharmShare), true)], 2)}
  ${group('F5', 'الأقسام الداخلية', [
    tile('إجمالي إنتاجية الداخلي' + (F.ip.name ? ` (${esc(F.ip.name)})` : ''), money(F.ip.gross)),
    tile(`صافي إنتاجية الداخلي (الأطقم) ${100 - S.depts.inpatient.doctorsPool}%`, money(F.ip.netAll - F.ip.netDoctors)),
    tile(`صافي إنتاجية الداخلي (الأطباء) ${S.depts.inpatient.doctorsPool}%`, money(F.ip.netDoctors)),
    tile(`صافي إنتاجية الطبيب بالداخلي <br><small>× نسبة المشاركة ${pctf(F.ip.participation)}</small>`, money(F.ip.doctor), true),
  ], 4)}
  ${group('F6', 'العناية المركزة', [
    tile('إجمالي إنتاجية العناية', money(F.icu.gross)), tile('صافي إنتاجية العناية (الأطباء)', money(F.icu.netDoctors)),
    tile(`صافي إنتاجية الطبيب بالعناية <br><small>× نسبة المشاركة ${pctf(F.icu.participation)}</small>`, money(F.icu.doctor), true),
  ])}
  ${group('F7', 'العمليات الجراحية', [
    tile('صافي إنتاجية العمليات الكبرى', money(O.majorNet)), tile('دور الطبيب — كبرى', esc(O.majorRole)), tile('صافي نصيب الطبيب — كبرى', money(O.majorDoc), true),
    tile('صافي إنتاجية العمليات الصغرى/المتوسطة', money(O.minorNet)), tile('دور الطبيب — صغرى', esc(O.minorRole)), tile('صافي نصيب الطبيب — صغرى', money(O.minorDoc), true),
    tile('صافي إنتاجية العمليات البسيطة', money(O.simpleNet)), tile('دور الطبيب — بسيطة', esc(O.simpleRole)), tile('صافي نصيب الطبيب — بسيطة', money(O.simpleDoc), true),
  ])}
  <div class="grid g2" style="margin-top:10px">${tile('إجمالي صافي إنتاجية الطبيب بالعمليات (كبرى + صغرى + بسيطة)', money(O.doctor), true)}${tile('إجمالي قيمة العمليات المشارك فيها', money(O.gross))}</div>
  ${group('F8', 'الطوارئ', [
    tile('إجمالي إنتاجية الطوارئ', money(F.er.gross)), tile('صافي الطوارئ (كل الأطقم)', money(F.er.netAll)), tile('صافي الطوارئ (الأطباء)', money(F.er.netDoctors)),
    tile(`صافي إنتاجية الطبيب بالطوارئ <br><small>× نسبة المشاركة ${pctf(F.er.participation)}</small>`, money(F.er.doctor), true),
  ], 4)}
  ${group('F9', 'الغسيل الكلوي', [tile('إجمالي إنتاجية الكلى (الجلسات × سعر الجلسة)', money(F.kidneyGross)), tile(`صافي إنتاجية الطبيب بالكلى ${S.kidney.doctorPct}%`, money(F.kidneyDoctor), true)], 2)}
  ${group('F10', 'الملخص المالي', [
    tile('إجمالي نسبة الطبيب من الخدمات (معمل + أشعة + صيدلية)' + (F.servicesManual ? ' — يدوي' : ''), money(F.servicesShare)),
    tile('إجمالي الإنتاجية (كل الخدمات)', money(F.totalGross)),
    tile('إجمالي صافي إنتاجية الطبيب', money(F.totalNet), true),
    tile('إجمالي الاستحقاق (أساسي + بدلات + حوافز)', money(F.grossEnt)),
    tile('صافي الاستحقاق (بعد الضرائب والتأمينات)', money(F.netEnt)),
    tile(`معدل الإنتاجية <br><small>صافي الإنتاجية ÷ ${S.entitlementBasis === 'net' ? 'صافي' : 'إجمالي'} الاستحقاق</small>`, F.entitlement ? num(F.rate) : '-', true),
  ])}
  <div class="row" style="margin-top:14px"><b>تصنيف الإنتاجية:</b> ${classChip(F.classification)} <span class="hint">${esc(S.classes.find(c => c.code === F.classification)?.ar || '')} — ${esc(S.classes.find(c => c.code === F.classification)?.en || '')}</span></div>`;
}

export function operationalHTML(res) {
  const O = res.operational;
  return `
  ${group('O1', 'تشغيل العيادات', [tile('عدد شفتات الطبيب بالعيادات (6 ساعات)', dash(O.clinicShifts, num)), tile('عدد الحالات بالعيادة', dash(O.clinicCases, num))], 2)}
  ${group('O2', 'تشغيل المعمل', [tile('الحالات المحولة (Ordered)', dash(O.labOrdered, num)), tile('الحالات المنفذة', dash(O.labPerformed, num)), tile('نسبة الالتزام', O.labOrdered ? pctf(O.labCompliance) : '-')])}
  ${group('O3', 'تشغيل الأشعة', [tile('الحالات المحولة (Ordered)', dash(O.radOrdered, num)), tile('الحالات المنفذة', dash(O.radPerformed, num)), tile('نسبة الالتزام', O.radOrdered ? pctf(O.radCompliance) : '-')])}
  ${group('O3.5', 'تشغيل الصيدلية', [tile('الحالات المحولة للصيدلية (الروشتات)', dash(O.pharmCases, num))], 2)}
  ${group('O4', 'تشغيل الداخلي / العناية / الطوارئ', [
    tile('إجمالي شفتات القسم بالداخلي', dash(O.ipTotalShifts, num)), tile('شفتات الطبيب بالداخلي', dash(O.ipShifts, num)), tile('نسبة مشاركة الطبيب بالداخلي', O.ipShifts ? pctf(O.ipParticipation) : '-', true),
    tile('إجمالي شفتات العناية', dash(O.icuTotalShifts, num)), tile('شفتات الطبيب بالعناية', dash(O.icuShifts, num)), tile('نسبة المشاركة بالعناية', O.icuShifts ? pctf(O.icuParticipation) : '-', true),
    tile('إجمالي شفتات الطوارئ', dash(O.erTotalShifts, num)), tile('شفتات الطبيب بالطوارئ', dash(O.erShifts, num)), tile('نسبة المشاركة بالطوارئ', O.erShifts ? pctf(O.erParticipation) : '-', true),
  ])}
  ${group('O5', 'تفاصيل العمليات', [tile('عدد العمليات', dash(O.orCount, num)), tile('نسبة مساهمة الجراح (Surgeon Contribution)', O.orCount ? pctf(O.surgeonContribution) : '-'), tile('نسبة التحويل من العيادة للداخلي (OP → IP)', O.clinicCases ? pctf(O.opToIp) : '-')])}
  ${group('O6', 'الغسيل الكلوي', [tile('جلسات الغسيل الكلوي تحت إشرافه', dash(O.kidneySessions, num))], 2)}
  ${group('FTE', 'ساعات العمل', [tile('إجمالي الساعات التشغيلية', num(O.workedHours, 1) + ' ساعة'), tile('FTE (الساعات ÷ 168)', num(O.fte))], 2)}`;
}

export function clinicalHTML(res) {
  const C = res.clinical;
  return `
  <div class="grid g4">
    ${tile('معدل إعادة الدخول (خلال 30 يوم)', pct100(C.readmissionRate))}
    ${tile('معدل المضاعفات', pct100(C.complicationRate))}
    ${tile('معدل عدوى الموقع الجراحي (SSI)', pct100(C.ssiRate))}
    ${tile('مؤشر القيمة', C.valueIndex === null ? '-' : num(C.valueIndex, 1), true)}
  </div>
  <div class="alert info" style="margin-top:12px">مؤشر القيمة = 100 − [(إعادة الدخول × 0.4) + (المضاعفات × 0.4) + (SSI × 0.2)] — التقييم: <b>${esc(C.valueBand || '—')}</b> (≥90 ممتاز، 80–89 جيد جداً، 70–79 مقبول، أقل من 70 يحتاج تحسين)</div>`;
}

export function dpcMiniHTML(res) {
  const D = res.dpc;
  if (D.type === 'er') return `<div class="grid g4">${tile('ساعات العمل', num(D.hours, 1) + ' h')}${tile('ساعات الجدول', num(D.sched, 1) + ' h')}${tile('عدد المرضى', num(D.patients, 0))}${tile('الالتزام بالجدول', pctf(D.compliance))}${tile('P.R (مريض/ساعة)', num(D.pr))}${tile('المعيار STR', num(D.bm))}${tile('Doc P.R percentage', pctf(D.average), true)}</div>`;
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th></th><th>ساعات العمل</th><th>ساعات الجدول</th><th>الحالات</th><th>P.R</th><th>B.M</th><th>Total PR</th></tr></thead><tbody>
    <tr><td><b>OPD</b></td><td>${num(D.opd.hours, 1)}</td><td>${num(D.opd.sched, 1)}</td><td>${num(D.opd.patients, 0)} <span class="hint">(Ideal ${num(D.opd.ideal, 0)})</span></td><td>${num(D.opd.pr)}</td><td>${num(D.opd.bm)}</td><td><b>${pctf(D.opd.percent)}</b></td></tr>
    <tr><td><b>IPD + ER</b></td><td>${num(D.ipd.hours, 1)}</td><td>${num(D.ipd.sched, 1)}</td><td>${num(D.ipd.patients, 0)}</td><td>${num(D.ipd.pr)}</td><td>${num(D.ipd.bm)}</td><td><b>${pctf(D.ipd.percent)}</b></td></tr>
    <tr><td><b>OR</b></td><td>${num(D.or.hours, 1)}</td><td>${num(D.or.sched, 1)}</td><td>${num(D.or.count, 0)} عملية</td><td>${D.or.active ? num(D.or.pr) : '-'}</td><td>${D.or.active ? num(D.or.bm) : '-'}</td><td><b>${D.or.active ? pctf(D.or.percent) : '-'}</b></td></tr>
    <tr style="background:#f6fafd"><td><b>الإجمالي</b></td><td colspan="3"></td><td><b>${num(D.totalPR)}</b></td><td><b>${num(D.totalBM)}</b></td><td><b style="color:var(--teal)">${pctf(D.average)}</b></td></tr>
  </tbody></table></div>`;
}

route('doctor', async (view, id) => {
  await loadDoctors();
  const doctor = ctx.doctors[id] || await store.get('doctors', id);
  if (!doctor) { view.innerHTML = '<div class="card empty">الطبيب غير موجود أو ليس لديك صلاحية عرضه</div>'; setTitle('ملف الطبيب'); return; }
  const S = ctx.settings;
  const isDoc = ctx.user.role === 'doctor';
  setTitle(isDoc ? 'ملفي وإنتاجيتي' : 'لوحة تحكم الطبيب', `${esc(doctor.name)} — ${esc(doctor.specialty)}`);

  const [recs, depts] = await Promise.all([
    isDoc ? loadRecords() : store.list('records', [['doctorId', '==', doctor.id], ...(can.seeAllHospitals(ctx.user) ? [] : [['hospitalId', '==', ctx.user.hospitalId]])]),
    loadDepts([['hospitalId', '==', doctor.hospitalId]]).catch(() => []),
  ]);
  recs.sort((a, b) => b.month.localeCompare(a.month));
  let month = ctx.cache['docMonth_' + id] || (recs.find(r => r.month === ctx.month) ? ctx.month : recs[0]?.month);
  const tab = ctx.cache.docTab || 'fin';

  const draw = () => {
    const rec = recs.find(r => r.month === month);
    const res = rec ? resultFor(doctor, rec, depts) : null;
    const canEdit = can.editData(ctx.user) && (!rec || rec.status !== 'approved' || ctx.user.role === 'process_manager');
    view.innerHTML = `
    <div class="row no-print" style="margin-bottom:12px">${!isDoc ? `<button class="btn sm" onclick="history.back()">${icons.back} رجوع</button>` : ''}<span class="spacer"></span>
      <select class="i" id="mSel" style="width:auto">${recs.map(r => `<option value="${r.month}" ${r.month === month ? 'selected' : ''}>${monthLabel(r.month)}${isDoc ? '' : ' — ' + ({ draft: 'مسودة', submitted: 'بانتظار الاعتماد', approved: 'معتمد' }[r.status] || '')}</option>`).join('')}${!recs.length ? '<option>لا توجد بيانات</option>' : ''}</select>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:10px"><h2 style="margin:0">معلومات الطبيب</h2><span class="spacer"></span>
        ${rec ? `<a class="btn sm" href="#/card/${doctor.id}/${month}">${icons.card} كارت إنتاجية الطبيب (DPC)</a><a class="btn sm primary" href="#/report/${doctor.id}/${month}">${icons.print} إصدار تقرير الأداء الرسمي</a>` : ''}
        ${can.editData(ctx.user) ? `<button class="btn sm" id="editDoc">${icons.edit} تعديل بيانات الطبيب</button>` : ''}
      </div>
      <div class="profile-head">${avatar(doctor, 'lg')}
        <div class="info">
          <div><span>الاسم</span><b>${esc(doctor.name)}</b></div>
          <div><span>الرقم القومي</span><b class="num">${esc(doctor.nationalId)}</b></div>
          <div><span>التخصص</span><b>${esc(doctor.specialty)}</b></div>
          <div><span>تصنيف التخصص</span><b>${CATEGORY_LABELS[res?.category || 'nonsurgical']}</b></div>
          <div><span>الدرجة العلمية</span><b>${esc(doctor.degree || '—')}</b></div>
          <div><span>نوع التوظيف</span><b>${esc(doctor.employmentType || '—')}</b></div>
          <div><span>المستشفى</span><b>${esc(hospName(doctor.hospitalId))}</b></div>
          <div><span>تاريخ التعيين</span><b>${esc(doctor.hireDate || '—')}</b></div>
          <div><span>كود الطبيب</span><b>${esc(doctor.code || '—')}</b></div>
        </div>
      </div>
    </div>
    ${!rec ? `<div class="card empty" style="margin-top:16px">لا توجد بيانات شهرية لهذا الطبيب${isDoc ? ' معتمدة بعد' : ''}.<br><br>${can.editData(ctx.user) ? `<button class="btn primary" id="newRec">${icons.plus} إدخال بيانات شهر</button>` : ''}</div>` : `
    <div class="card" style="margin-top:16px">
      <div class="row">
        <div><span class="hint">الشهر</span><br><b>${monthLabel(month)}</b></div>
        <div style="margin-inline-start:18px"><span class="hint">الحالة</span><br>${statusChip(rec.status)}</div>
        <div style="margin-inline-start:18px"><span class="hint">صافي الإنتاجية</span><br><b>${money(res.financial.totalNet)}</b></div>
        <div style="margin-inline-start:18px"><span class="hint">معدل الإنتاجية</span><br><b class="num">${res.financial.entitlement ? num(res.financial.rate) : '-'}</b> ${classChip(res.financial.classification)}</div>
        <div style="margin-inline-start:18px"><span class="hint">إنتاجية DPC</span><br><b>${pctf(res.dpc.average)}</b></div>
        <div style="margin-inline-start:18px"><span class="hint">مؤشر القيمة</span><br><b>${res.clinical.valueIndex === null ? '-' : num(res.clinical.valueIndex, 1)}</b></div>
        <span class="spacer"></span>
        ${canEdit ? `<button class="btn sm" id="editRec">${icons.edit} تعديل بيانات الشهر</button><button class="btn sm" id="newRec">${icons.plus} شهر جديد</button>` : ''}
        ${can.editData(ctx.user) && rec.status === 'draft' ? `<button class="btn sm teal" id="submitRec">إرسال للاعتماد</button>` : ''}
        ${can.approve(ctx.user) && rec.status !== 'approved' ? `<button class="btn sm teal" id="approveRec">${icons.check} اعتماد</button>` : ''}
        ${can.approve(ctx.user) && rec.status !== 'draft' ? `<button class="btn sm danger" id="returnRec">إرجاع للمسودة</button>` : ''}
      </div>
      ${!isDoc && res.warnings.length ? `<div style="margin-top:10px">${res.warnings.map(w => `<div class="alert warn">⚠ ${esc(w)}</div>`).join('')}</div>` : ''}
      ${rec.status === 'approved' && rec.approvedBy ? `<div class="hint" style="margin-top:6px">اعتمد بواسطة ${esc(rec.approvedByName || '')} — ${esc((rec.approvedAt || '').slice(0, 10))}. القيم المعروضة مجمدة وقت الاعتماد.</div>` : ''}
      <div class="tabs">${[['fin', 'المؤشرات المالية'], ['op', 'المؤشرات التشغيلية'], ['cl', 'المؤشرات السريرية'], ['dpc', 'كارت DPC'], ['trend', 'الاتجاه الشهري']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="tabBody"></div>
    </div>`}`;

    $('#mSel')?.addEventListener('change', e => { month = e.target.value; ctx.cache['docMonth_' + id] = month; draw(); });
    $('#editDoc')?.addEventListener('click', () => doctorForm(doctor, () => { Object.assign(doctor, ctx.doctors[doctor.id]); draw(); }));
    const reload = () => { invalidate(); ctx.cache['docMonth_' + id] = month; go('#/doctor/' + id); };
    $('#editRec')?.addEventListener('click', () => openRecordEditor(doctor, rec.month, rec, depts, reload));
    $('#newRec')?.addEventListener('click', () => openRecordEditor(doctor, null, null, depts, (m) => { month = m; ctx.cache['docMonth_' + id] = m; invalidate(); go('#/doctor/' + id); }));
    $('#submitRec')?.addEventListener('click', async () => { await submitRecords([rec]); reload(); });
    $('#approveRec')?.addEventListener('click', async () => {
      if (res.warnings.length && !await confirmBox(`يوجد ${res.warnings.length} ملاحظة على هذا السجل. هل تريد الاعتماد رغم ذلك؟`, 'اعتماد')) return;
      await approveRecords([{ rec, doctor, depts }]); reload();
    });
    $('#returnRec')?.addEventListener('click', async () => { await returnRecords([rec]); reload(); });

    if (!rec) return;
    const body = $('#tabBody');
    const show = (k) => {
      ctx.cache.docTab = k;
      $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
      if (k === 'fin') body.innerHTML = financialHTML(res, S);
      if (k === 'op') body.innerHTML = operationalHTML(res);
      if (k === 'cl') body.innerHTML = clinicalHTML(res);
      if (k === 'dpc') body.innerHTML = dpcMiniHTML(res) + `<div class="row" style="margin-top:12px"><a class="btn primary" href="#/card/${doctor.id}/${month}">${icons.card} عرض الكارت كامل وطباعته</a></div>`;
      if (k === 'trend') {
        body.innerHTML = `<div style="height:300px"><canvas id="cDocTrend"></canvas></div>`;
        const ms = [...recs].sort((a, b) => a.month.localeCompare(b.month));
        const rs = ms.map(r => resultFor(doctor, r, depts));
        chart(document.getElementById('cDocTrend'), {
          type: 'line',
          data: {
            labels: ms.map(r => monthLabel(r.month)), datasets: [
              { label: 'إنتاجية DPC %', data: rs.map(r => Math.round(r.dpc.average * 100)), borderColor: '#17a2a0', tension: .3, yAxisID: 'y' },
              { label: 'معدل الإنتاجية (صافي ÷ استحقاق)', data: rs.map(r => +r.financial.rate.toFixed(2)), borderColor: '#0d2b4e', tension: .3, yAxisID: 'y1' },
            ],
          },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, position: 'right', ticks: { callback: v => v + '%' } }, y1: { beginAtZero: true, position: 'left', grid: { drawOnChartArea: false } } } },
        });
      }
    };
    $$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.tab));
    show(tab);
  };
  draw();
});

void toast;
