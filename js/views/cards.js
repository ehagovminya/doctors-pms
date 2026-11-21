import { ctx, route, setTitle, loadDoctors, loadRecords, loadDepts, resultFor, hospName } from '../core.js';
import { store, can } from '../store.js';
import { esc, icons, emblem, num, pctf, money, monthLabel, monthLabelEn, pct100 } from '../ui.js';

function pie(p, dark = '#0b4f8a', light = '#28b3e6') {
  // p = نسبة الإنجاز (0..1). الشريحة الداكنة = المتبقي، الفاتحة = المحقق
  const val = Math.max(0, Math.min(1, p || 0));
  const lbl = Number.isFinite(p) ? Math.round(p * 100) + '%' : '-';
  const grad = `<defs><radialGradient id="pg${Math.round(val * 1000)}"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>`;
  if (p <= 0 || p >= 1) {
    return `<svg viewBox="-1 -1 2 2" class="pie">${grad}<circle r="1" fill="${p >= 1 ? light : '#0b2f5a'}"/><text x="0" y=".08" text-anchor="middle" font-size=".2" fill="#fff" font-weight="700">${lbl}</text></svg>`;
  }
  const a = val * Math.PI * 2;
  const x = Math.sin(a), y = -Math.cos(a);
  const large = val > .5 ? 1 : 0;
  const mid = a / 2, rest = a + (Math.PI * 2 - a) / 2;
  return `<svg viewBox="-1 -1 2 2" class="pie">${grad}
    <circle r="1" fill="#0b2f5a"/>
    <path d="M0 0 L0 -1 A1 1 0 ${large} 1 ${x} ${y} Z" fill="${light}"/>
    <text x="${Math.sin(mid) * .55}" y="${-Math.cos(mid) * .55 + .06}" text-anchor="middle" font-size=".17" fill="#fff" font-weight="700">${lbl}</text>
    <text x="${Math.sin(rest) * .55}" y="${-Math.cos(rest) * .55 + .06}" text-anchor="middle" font-size=".15" fill="#fff" font-weight="700">${Math.round((1 - val) * 100)}%</text></svg>`;
}

export function dpcCardHTML(doctor, res, month) {
  const S = ctx.settings, D = res.dpc;
  const salaryGood = res.financial.entitlement && res.financial.rate >= 1;
  const head = `
    <svg class="bg-lines" viewBox="0 0 1000 700" preserveAspectRatio="none"><polyline fill="none" stroke="#9fb8cf" stroke-width="2" points="520,520 600,430 660,470 720,360 790,400 860,250 930,300 1000,180"/><polyline fill="none" stroke="#c7d6e4" stroke-width="40" points="560,700 650,560 760,600 880,430 1000,470"/></svg>
    <div class="photo">${doctor.photo ? `<img src="${esc(doctor.photo)}">` : esc((doctor.name || '').split(' ').slice(0, 2).map(w => w[0]).join(''))}</div>
    <div class="title"><span class="t1">Doctor Productivity Card</span><span class="t2">(D.P.C)</span></div>
    <div class="org"><div><b>${esc(S.orgName).replace('الهيئة العامة ', 'الهيئة العامة<br>')}</b><small>${esc(S.branchName)} — ${monthLabelEn(month)}</small></div><div class="logo">${emblem(S.logo)}</div></div>
    <div class="who"><b>Doctor Name :</b> <span>Dr/ ${esc(doctor.nameEn || doctor.name)}</span><br><b>Speciality :</b> <span>${esc(doctor.specialtyEn || doctor.specialty)}</span></div>`;
  const bottom = (avgLabel) => `
    <div class="bottom">
      <div><b>Total P.R =</b> ${num(D.totalPR)}</div><div><b>B.m =</b> ${num(D.totalBM)}</div>
      <div><b>Contract Validation</b> &nbsp;<span class="red">${D.contractMonths ?? '-'}</span>&nbsp; <b>Month</b></div>
      <div style="grid-column:span 2"><b>${avgLabel}</b> &nbsp; <span class="avg" style="color:${D.average < 0.5 ? '#e02020' : 'var(--navy-2)'}">${pctf(D.average)}</span></div>
      <div><b>Salary</b> <span class="sal ${salaryGood ? 'good' : ''}">${D.salary ? num(D.salary, 0) : '-'}</span> <b>LE</b></div>
    </div>`;
  if (D.type === 'er') {
    return `<div class="dpc er">${head}
      <div class="boxes"><div class="box">
        <div class="l"><span>Total W.H ${num(D.hours, 1)} h</span><span>Schedule ${num(D.sched, 1)} h</span></div>
        <div class="l"><span>No of patients ${num(D.patients, 0)} Pt</span><span>Compliance to schedule ${pctf(D.compliance)}</span></div>
        ${pie(D.percent)}
        <div class="l" style="margin-top:.5cqw"><span>PR = ${num(D.pr)}</span><span>STR PR = ${num(D.bm)}</span></div>
      </div></div>${bottom('Doc P.R percentage')}</div>`;
  }
  const box = (t, top, p, pr, bm, tot) => `<div class="box"><h5>${t}</h5>${top}${pie(p)}<div class="foot"><span>P.R: ${pr}</span><span>B.M: ${bm}</span></div><div class="tot">Total PR: ${tot}</div></div>`;
  return `<div class="dpc">${head}
    <div class="boxes">
      ${box('OPD', `<div class="l"><span>W.H. : ${num(D.opd.hours, 1)} h</span><span>schedule: ${num(D.opd.sched, 1)} h</span></div><div class="l"><span>No of patients : ${num(D.opd.patients, 0)}</span><span>Ideal : ${num(D.opd.ideal, 0)}</span></div>`, D.opd.percent, num(D.opd.pr), num(D.opd.bm), pctf(D.opd.percent))}
      ${box('IPD+ER', `<div class="l"><span>W.H.: ${num(D.ipd.hours, 2)} h</span><span>schedule: ${num(D.ipd.sched, 2)} h</span></div><div class="l"><span>No of patients &amp; consultations: ${num(D.ipd.patients, 0)}</span></div>`, D.ipd.percent, num(D.ipd.pr), num(D.ipd.bm), pctf(D.ipd.percent))}
      ${box('OR', `<div class="l"><span>No of surgeries: ${D.or.active ? num(D.or.count, 0) : ''}</span></div><div class="l"><span>W.H: ${D.or.active ? num(D.or.hours, 2) : ''}</span><span>Schedule : ${D.or.active ? num(D.or.sched, 2) : ''}</span></div>`, D.or.active ? D.or.percent : 0, D.or.active ? num(D.or.pr) : '', D.or.active ? num(D.or.bm) : '', D.or.active ? pctf(D.or.percent) : '%')}
    </div>${bottom('Average Doc P.R')}</div>`;
}

async function loadOne(id, month) {
  await loadDoctors();
  const doctor = ctx.doctors[id] || await store.get('doctors', id);
  if (!doctor) return {};
  let rec;
  if (ctx.user.role === 'doctor') rec = (await loadRecords()).find(r => r.month === month);
  else rec = await store.get('records', `${id}_${month}`);
  if (!rec) return { doctor };
  const depts = ctx.user.role === 'doctor' ? [] : await loadDepts([['hospitalId', '==', doctor.hospitalId], ['month', '==', month]]);
  return { doctor, rec, res: resultFor(doctor, rec, depts) };
}

route('card', async (view, id, month) => {
  const { doctor, rec, res } = await loadOne(id, month);
  setTitle('كارت إنتاجية الطبيب (DPC)', doctor ? `${esc(doctor.name)} — ${monthLabel(month)}` : '');
  if (!res) { view.innerHTML = '<div class="card empty">لا توجد بيانات لهذا الشهر</div>'; return; }
  view.innerHTML = `<div class="row no-print" style="margin-bottom:12px"><a class="btn sm" href="#/doctor/${id}">${icons.back} رجوع لملف الطبيب</a><span class="spacer"></span>
    ${rec.status !== 'approved' ? '<span class="chip submitted">نسخة غير معتمدة</span>' : ''}
    <button class="btn primary" onclick="window.print()">${icons.print} طباعة / حفظ PDF</button></div>
    ${dpcCardHTML(doctor, res, month)}
    <p class="hint no-print" style="text-align:center">لكتابة الاسم والتخصص بالإنجليزي على الكارت: من ملف الطبيب ← تعديل بيانات الطبيب ← حقلَي الاسم والتخصص بالإنجليزية.</p>`;
});

route('report', async (view, id, month) => {
  const { doctor, rec, res } = await loadOne(id, month);
  setTitle('تقرير الأداء الرسمي', doctor ? `${esc(doctor.name)} — ${monthLabel(month)}` : '');
  if (!res) { view.innerHTML = '<div class="card empty">لا توجد بيانات لهذا الشهر</div>'; return; }
  const S = ctx.settings, F = res.financial, O = res.operational, C = res.clinical, A = res.additional, OP = F.ops;
  const kv = (k, v) => `<div class="kv"><span>${k}:</span><span>${v}</span></div>`;
  const egp = (v) => v ? `${num(v, 0)} EGP` : '-';
  const p = (v, base = true) => base ? pctf(v) : '-';
  view.innerHTML = `
  <div class="row no-print" style="margin-bottom:12px"><a class="btn sm" href="#/doctor/${id}">${icons.back} رجوع لملف الطبيب</a><span class="spacer"></span>
    <label class="row hint"><input type="checkbox" id="withCard" checked> إرفاق كارت DPC في صفحة ثانية</label>
    <button class="btn primary" onclick="window.print()">${icons.print} طباعة / حفظ PDF</button></div>
  ${rec.status !== 'approved' ? '<div class="alert warn no-print">هذا التقرير من بيانات غير معتمدة بعد — سيظهر عليه "مسودة".</div>' : ''}
  <div class="report">
    <div class="hdr">${emblem(S.logo)}<h1>Official Performance Report</h1><p>Performance Report for ${monthLabelEn(month)} — ${esc(S.orgName)} · ${esc(S.branchName)}${rec.status !== 'approved' ? ' — <b style="color:#d93025">DRAFT / مسودة</b>' : ''}</p></div>
    <div class="sec s1"><h2>1. DOCTOR INFORMATION</h2><div class="docinfo"><div>
      ${kv('Full Name', esc(doctor.name))}${kv('National ID', esc(doctor.nationalId))}${kv('Hospital', esc(hospName(doctor.hospitalId)))}
      ${kv('Specialty', esc(doctor.specialty))}${kv('Academic Degree', esc(doctor.degree || '-'))}${kv('Employment Type', esc(doctor.employmentType || '-'))}${kv('Hire Date', esc(doctor.hireDate || '-'))}
    </div><div class="pic">${doctor.photo ? `<img src="${esc(doctor.photo)}">` : ''}</div></div></div>
    <div class="cols">
      <div>
        <div class="sec s2"><h2>2. FINANCIAL INDICATORS (F1-F10)</h2>
          <div class="grp">F1 - Outpatient Clinics</div>${kv('Gross Clinic Productivity', egp(F.clinicGross))}${kv('Net Clinic Productivity', egp(F.clinicNet))}${kv('Doctor Net Clinic Productivity', egp(F.clinicDoctorNet))}
          <div class="grp">F2 - Laboratory</div>${kv('Lab Productivity', egp(F.labValue))}${kv(`Doctor Lab Share (${S.services.lab}%)`, egp(F.labShare))}
          <div class="grp">F3 - Radiology</div>${kv('Radiology Productivity', egp(F.radValue))}${kv(`Doctor Radiology Share (${S.services.rad}%)`, egp(F.radShare))}
          <div class="grp">F4 - Pharmacy</div>${kv('Pharmacy Productivity', egp(F.pharmValue))}${kv(`Doctor Pharmacy Share (${S.services.pharm}%)`, egp(F.pharmShare))}
          <div class="grp">F5 - Inpatient Departments</div>${kv('Total Inpatient Productivity', egp(F.ip.gross))}${kv('Net Productivity (All Staff)', egp(F.ip.netAll))}${kv('Net Productivity (All Doctors)', egp(F.ip.netDoctors))}${kv('Doctor Net Inpatient Productivity', egp(F.ip.doctor))}
          <div class="grp">F6 - Intensive Care Unit (ICU)</div>${kv('Total ICU Productivity', egp(F.icu.gross))}${kv('Net ICU Productivity (Doctors)', egp(F.icu.netDoctors))}${kv('Doctor Net ICU Productivity', egp(F.icu.doctor))}
          <div class="grp">F7 - Surgical Operations</div>${kv('Total Surgeries Count', O.orCount || '-')}${kv('Major Ops Net Productivity', egp(OP.majorNet))}${kv('Major Ops Doctor Role', esc(OP.majorRole))}${kv('Major Ops Doctor Net Productivity', egp(OP.majorDoc))}
          ${kv('Minor Ops Net Productivity', egp(OP.minorNet))}${kv('Minor Ops Doctor Role', esc(OP.minorRole))}${kv('Minor Ops Doctor Net Productivity', egp(OP.minorDoc))}
          ${kv('Simple Ops Net Productivity', egp(OP.simpleNet))}${kv('Simple Ops Doctor Role', esc(OP.simpleRole))}${kv('Simple Ops Doctor Net Productivity', egp(OP.simpleDoc))}${kv('Total Doctor Ops Net Productivity', egp(OP.doctor))}
          <div class="grp">F8 - Emergency Department</div>${kv('Total ED Productivity', egp(F.er.gross))}${kv('Net ED Productivity (All Staff)', egp(F.er.netAll))}${kv('Net ED Productivity (All Doctors)', egp(F.er.netDoctors))}${kv('Doctor Net ED Productivity', egp(F.er.doctor))}
          <div class="grp">F9 - Dialysis/Nephrology</div>${kv('Total Kidney Productivity', egp(F.kidneyGross))}${kv('Doctor Net Kidney Productivity', egp(F.kidneyDoctor))}
          <div class="grp">F10 - Financial Summary</div>${kv('Services Doctor Share' + (F.servicesManual ? ' (Manual)' : ''), egp(F.servicesShare))}${kv('Doctor Total Net Productivity', egp(F.totalNet))}${kv('Doctor Gross Entitlement', egp(F.grossEnt))}${kv('Doctor Net Entitlement', egp(F.netEnt))}${kv('Productivity Rate Entitlement', F.entitlement ? num(F.rate) : '-')}${kv('Productivity Classification', `<b>${F.classification || '-'}</b>`)}
        </div>
      </div>
      <div>
        <div class="sec s3"><h2>3. OPERATIONAL INDICATORS (O1-O6)</h2>
          <div class="grp">O1 - Outpatient Clinics Operations</div>${kv('Clinic Shifts (6h)', O.clinicShifts || '-')}${kv('Clinic Cases Count', O.clinicCases || '-')}
          <div class="grp">O2 - Laboratory Operations</div>${kv('Lab Ordered Cases', O.labOrdered || '-')}${kv('Lab Performed Cases', O.labPerformed || '-')}${kv('Lab Compliance Rate', p(O.labCompliance, O.labOrdered))}
          <div class="grp">O3 - Radiology Operations</div>${kv('Radiology Ordered Cases', O.radOrdered || '-')}${kv('Radiology Performed Cases', O.radPerformed || '-')}${kv('Radiology Compliance Rate', p(O.radCompliance, O.radOrdered))}
          <div class="grp">O3.5 - Pharmacy Operations</div>${kv('Pharmacy Referred Cases', O.pharmCases || '-')}
          <div class="grp">O4 - Inpatient Department Operations</div>${kv('Total Inpatient Dept Shifts', O.ipTotalShifts || '-')}${kv('Doctor Inpatient Shifts', O.ipShifts || '-')}${kv('Doctor Participation Rate (IP)', p(O.ipParticipation, O.ipShifts))}
          <div class="grp">O4 - ICU Operations</div>${kv('Total ICU Department Shifts', O.icuTotalShifts || '-')}${kv('Doctor ICU Shifts', O.icuShifts || '-')}${kv('Doctor Participation Rate (ICU)', p(O.icuParticipation, O.icuShifts))}
          <div class="grp">O4 - Emergency Department Operations</div>${kv('Total ED Department Shifts', O.erTotalShifts || '-')}${kv('Doctor ED Shifts', O.erShifts || '-')}${kv('Doctor Participation Rate (ED)', p(O.erParticipation, O.erShifts))}
          <div class="grp">O5 - Surgical Operations Details</div>${kv('Surgeon Contribution Rate', p(O.surgeonContribution, O.orCount))}${kv('OP to IP Conversion Rate', p(O.opToIp, O.clinicCases))}
          <div class="grp">O6 - Dialysis Operations</div>${kv('Dialysis Sessions Supervised', O.kidneySessions || '-')}
          ${kv('Worked Hours / FTE', `${num(O.workedHours, 1)} h / ${num(O.fte)}`)}
        </div>
        <div class="sec s4"><h2>4. CLINICAL INDICATORS (OUTCOMES)</h2>
          ${kv('Readmission Rate', pct100(C.readmissionRate))}${kv('Complication Rate', pct100(C.complicationRate))}${kv('Surgical Site Infection (SSI) Rate', pct100(C.ssiRate))}${kv('Value Index', C.valueIndex === null ? '-' : num(C.valueIndex, 1))}
        </div>
        <div class="sec s5"><h2>5. ADDITIONAL METRICS</h2>
          ${kv('Cost Per Visit (CPV)', egp(A.cpv))}${kv('Outpatient Revenue', egp(A.outpatientRevenue))}${kv('Inpatient Revenue', egp(A.inpatientRevenue))}${kv('Total Revenue', egp(A.totalRevenue))}${kv('Outpatient Volume', A.outpatientVolume || '-')}${kv('Inpatient Volume', A.inpatientVolume || '-')}
        </div>
        <div class="sec s6"><h2>6. DOCTOR PRODUCTIVITY CARD (DPC)</h2>
          ${res.dpc.type === 'er' ? kv('ER P.R / STR', `${num(res.dpc.pr)} / ${num(res.dpc.bm)}`) + kv('Compliance to Schedule', pctf(res.dpc.compliance)) :
            kv('OPD Total PR', pctf(res.dpc.opd.percent)) + kv('IPD+ER Total PR', pctf(res.dpc.ipd.percent)) + kv('OR Total PR', res.dpc.or.active ? pctf(res.dpc.or.percent) : '-')}
          ${kv('Total P.R / B.m', `${num(res.dpc.totalPR)} / ${num(res.dpc.totalBM)}`)}${kv('Average Doc P.R', pctf(res.dpc.average))}
        </div>
      </div>
    </div>
    <div class="sign"><div>منسق نظام إدارة المرضى — إنتاجية الأطباء</div><div>رئيس لجنة الإنتاجية</div><div>المدير الطبي</div></div>
    <div class="foot">${esc(S.orgName)} — ${esc(S.branchName)} · ${esc(S.systemName)} · ${rec.status === 'approved' ? 'معتمد ' + esc((rec.approvedAt || '').slice(0, 10)) : 'غير معتمد'}</div>
  </div>
  <div id="cardPage" class="page-break" style="margin-top:20px">${dpcCardHTML(doctor, res, month)}</div>`;
  document.getElementById('withCard').onchange = (e) => { document.getElementById('cardPage').style.display = e.target.checked ? '' : 'none'; };
});

void can; void money;
