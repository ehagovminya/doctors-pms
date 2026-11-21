import { ctx, route, setTitle, topFilters, monthData, hospName, chart } from '../core.js';
import { CATEGORY_LABELS } from '../defaults.js';
import { esc, money, num, pctf, monthLabel, classChip } from '../ui.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => a.length ? sum(a) / a.length : 0;
const link = (r) => `<a href="#/doctor/${r.doctor.id}">${esc(r.doctor.name)}</a> <span class="hint">(${esc(r.doctor.specialty)} — ${esc(hospName(r.doctor.hospitalId))})</span>`;

// ============ المساعد الذكي (تحليل تلقائي بالقواعد) ============
route('assistant', async (view) => {
  setTitle('المساعد الذكي', 'ملاحظات وتوصيات تلقائية من بيانات الشهر');
  await topFilters();
  const { rows } = await monthData();
  if (!rows.length) { view.innerHTML = `<div class="card empty">لا توجد بيانات لشهر ${monthLabel(ctx.month)}</div>`; return; }
  const S = ctx.settings;
  const sections = [];
  const add = (title, tone, items, note = '') => { if (items.length) sections.push({ title, tone, items, note }); };

  const withEnt = rows.filter(r => r.res.financial.entitlement);
  add('أطباء في التصنيف E — خطة عمل شهر / إنهاء', 'err', withEnt.filter(r => r.res.financial.classification === 'E').map(r => `${link(r)} — معدل ${num(r.res.financial.rate)}`));
  add('أطباء في التصنيف D — خطة عمل 3 شهور', 'warn', withEnt.filter(r => r.res.financial.classification === 'D').map(r => `${link(r)} — معدل ${num(r.res.financial.rate)}`));
  add('إنتاجية DPC أقل من 30%', 'warn', rows.filter(r => r.res.dpc.average < 0.3).sort((a, b) => a.res.dpc.average - b.res.dpc.average).map(r => `${link(r)} — ${pctf(r.res.dpc.average)}`));
  add('ساعات جدول عيادة بدون حالات', 'warn', rows.filter(r => r.res.dpc.type === 'standard' && r.res.dpc.opd.sched > 0 && !r.res.dpc.opd.patients).map(r => `${link(r)} — ${num(r.res.dpc.opd.sched, 0)} ساعة جدول`));
  add('الالتزام بالجدول أقل من 80% (ساعات فعلية ÷ جدول)', 'warn', rows.filter(r => {
    const d = r.res.dpc; if (d.type === 'er') return d.sched && d.compliance < 0.8;
    const s = d.opd.sched + d.ipd.sched; return s > 0 && (d.opd.hours + d.ipd.hours) / s < 0.8;
  }).map(r => link(r)));
  add('مؤشر القيمة أقل من 70 (يحتاج تحسين)', 'err', rows.filter(r => r.res.clinical.valueIndex !== null && r.res.clinical.valueIndex < 70).map(r => `${link(r)} — ${num(r.res.clinical.valueIndex, 1)}`));
  add('أخطاء/تعارضات في البيانات — راجعها قبل الاعتماد', 'err', rows.filter(r => r.res.warnings.length).map(r => `${link(r)}<ul style="margin:2px 0">${r.res.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`));
  add('أطباء بدون استحقاق مسجل', 'warn', rows.filter(r => !r.res.financial.entitlement).map(r => link(r)));
  add('الأعلى أداءً — مرشحون للحافز (A)', 'ok', withEnt.filter(r => r.res.financial.classification === 'A').sort((a, b) => b.res.financial.rate - a.res.financial.rate).map(r => `${link(r)} — معدل ${num(r.res.financial.rate)} · DPC ${pctf(r.res.dpc.average)}`));

  const bySpec = {};
  rows.forEach(r => (bySpec[r.doctor.specialty] ||= []).push(r));
  const overall = avg(rows.map(r => r.res.dpc.average));
  add('تخصصات أقل من متوسط إنتاجية DPC العام (' + pctf(overall) + ')', 'info', Object.entries(bySpec).map(([s, l]) => [s, avg(l.map(r => r.res.dpc.average)), l.length]).filter(x => x[1] < overall * 0.85).sort((a, b) => a[1] - b[1]).map(([s, v, n]) => `${esc(s)} — ${pctf(v)} (${n} طبيب)`));

  const st = { draft: 0, submitted: 0, approved: 0 }; rows.forEach(r => st[r.rec.status || 'draft']++);
  view.innerHTML = `
  <div class="card"><h2>ملخص ${monthLabel(ctx.month)}</h2>
    <p style="margin:0">تم تحليل <b>${rows.length}</b> سجل (${st.approved} معتمد، ${st.submitted} بانتظار الاعتماد، ${st.draft} مسودة). متوسط إنتاجية DPC <b>${pctf(overall)}</b>، ومعدل الإنتاجية الإجمالي <b>${num(sum(withEnt.map(r => r.res.financial.totalNet)) / (sum(withEnt.map(r => r.res.financial.entitlement)) || 1))}</b>.
    ${st.submitted ? `<br>⏳ يوجد ${st.submitted} سجل بانتظار الاعتماد — <a href="#/review">اذهب للاعتماد</a>.` : ''}</p></div>
  ${sections.map(s => `<div class="card"><h2>${s.title} <span class="chip">${s.items.length}</span></h2>${s.items.slice(0, 40).map(i => `<div class="alert ${s.tone}">${i}</div>`).join('')}${s.items.length > 40 ? `<p class="hint">و ${s.items.length - 40} آخرين…</p>` : ''}</div>`).join('')}
  ${!sections.length ? '<div class="card empty">لا توجد ملاحظات — كل المؤشرات في الحدود الطبيعية</div>' : ''}`;
  void S;
});

// ============ تحليل الإنتاجية والتكلفة (القسمان 8 و 11 من الدليل) ============
route('analysis', async (view) => {
  setTitle('تحليل الإنتاجية والتكلفة', 'مقارنة إجمالي إنتاجية الأطباء بإجمالي الاستحقاق، وتحليل تكلفة أجور الأطباء');
  await topFilters();
  const { rows, depts } = await monthData();
  if (!rows.length) { view.innerHTML = `<div class="card empty">لا توجد بيانات لشهر ${monthLabel(ctx.month)}</div>`; return; }
  const S = ctx.settings;

  // القسم 11: معامل الأجر لكل قسم/تخصص
  const bySpec = {};
  rows.forEach(r => { const x = (bySpec[r.doctor.specialty] ||= { n: 0, net: 0, ent: 0, gross: 0, fte: 0, cat: r.res.category }); x.n++; x.net += r.res.financial.totalNet; x.ent += r.res.financial.entitlement; x.gross += r.res.financial.totalGross; x.fte += r.res.operational.fte; });
  const specRows = Object.entries(bySpec).sort((a, b) => (b[1].ent ? b[1].net / b[1].ent : 0) - (a[1].ent ? a[1].net / a[1].ent : 0));

  // القسم 8: تكلفة أجور الأطباء
  const byH = {};
  rows.forEach(r => {
    const h = (byH[r.rec.hospitalId] ||= { docEnt: 0, contractEnt: 0, gov: 0, n: 0, contractN: 0 });
    const e = r.res.financial.grossEnt; h.docEnt += e; h.n++;
    if ((r.doctor.employmentType || '').includes('متعاقد')) { h.contractEnt += e; h.contractN++; } else h.gov += e;
  });
  const staff = Object.fromEntries(depts.filter(d => d.type === 'hospital').map(d => [d.hospitalId, Number(d.totalStaffEntitlement) || 0]));

  const cls = {}; rows.forEach(r => { const c = r.res.financial.classification || '—'; cls[c] = (cls[c] || 0) + 1; });

  view.innerHTML = `
  <div class="card"><h2>معامل الأجر حسب التخصص (إجمالي الإنتاجية ÷ إجمالي الاستحقاق)</h2>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>التخصص</th><th>التصنيف</th><th>الأطباء</th><th>FTE</th><th>إجمالي الإنتاجية</th><th>صافي إنتاجية الأطباء</th><th>إجمالي الاستحقاق</th><th>معامل الأجر</th><th>التصنيف</th></tr></thead><tbody>
    ${specRows.map(([s, x]) => { const rate = x.ent ? x.net / x.ent : 0; const c = x.ent ? [...S.classes].sort((a, b) => b.min - a.min).find(k => rate >= k.min) : null; return `<tr><td><b>${esc(s)}</b></td><td>${CATEGORY_LABELS[x.cat]}</td><td>${x.n}</td><td>${num(x.fte)}</td><td>${money(x.gross)}</td><td>${money(x.net)}</td><td>${money(x.ent)}</td><td class="num">${num(rate)}</td><td>${classChip(c?.code)}</td></tr>`; }).join('')}
    </tbody></table></div></div>

  <div class="grid g2">
    <div class="card"><h2>تكلفة أجور الأطباء بالمنشأة</h2>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>المستشفى</th><th>استحقاق الأطباء</th><th>استحقاق كل العاملين</th><th>% تكلفة الأطباء</th><th>% المتعاقدين من استحقاق الأطباء</th></tr></thead><tbody>
      ${Object.entries(byH).map(([id, h]) => `<tr><td><b>${esc(hospName(id))}</b></td><td>${money(h.docEnt)}</td><td>${staff[id] ? money(staff[id]) : '<span class="hint">أدخله في الأقسام</span>'}</td><td>${staff[id] ? pctf(h.docEnt / staff[id]) : '-'}</td><td>${pctf(h.docEnt ? h.contractEnt / h.docEnt : 0)} <span class="hint">(${h.contractN} من ${h.n})</span></td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">إجمالي استحقاق العاملين يُدخل في بيانات الأقسام (صف "إجمالي المنشأة").</p></div>
    <div class="card"><h2>توزيع التصنيفات</h2><div style="height:260px"><canvas id="cPie"></canvas></div></div>
  </div>

  <div class="card"><h2>جدول الإجراءات حسب التصنيف</h2><table class="t"><thead><tr><th>التصنيف</th><th>معدل الإنتاجية (صافي ÷ استحقاق)</th><th>الإجراء</th><th>عدد الأطباء</th></tr></thead><tbody>
    ${S.classes.map((c, i) => { const hi = S.classes[i - 1]; return `<tr><td>${classChip(c.code)}</td><td class="num">${Number.isFinite(c.min) ? (hi ? `${c.min} – ${hi.min}` : `> ${c.min}`) : `< ${S.classes[i - 1]?.min ?? ''}`}</td><td>${esc(c.en)}<div class="hint">${esc(c.ar)}</div></td><td><b>${cls[c.code] || 0}</b></td></tr>`; }).join('')}
  </tbody></table></div>`;

  chart(document.getElementById('cPie'), {
    type: 'doughnut',
    data: { labels: S.classes.map(c => c.code), datasets: [{ data: S.classes.map(c => cls[c.code] || 0), backgroundColor: S.classes.map(c => c.color) }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });
});

// ============ دليل المنهجية ============
route('guide', async (view) => {
  setTitle('دليل المنهجية', 'ملخص مشروع قياس إنتاجية الأطباء والمعادلات المطبقة في النظام');
  const S = ctx.settings;
  const sec = (t, body) => `<div class="card"><h2>${t}</h2>${body}</div>`;
  view.innerHTML = `
  ${sec('الهدف', `<p>متابعة وقياس وتحليل إنتاجية الأطباء من خلال نظام إدارة المرضى (PMS)، وتحويل البيانات التشغيلية إلى مؤشرات أداء واضحة تدعم اتخاذ القرار وتحسين الكفاءة وجودة الرعاية الصحية: تحسين الأداء الطبي والإداري، تعزيز الشفافية والمساءلة، دعم القرارات المبنية على البيانات، رفع جودة الرعاية، وتحديد الاحتياجات التدريبية.</p>`)}
  ${sec('لجنة حساب الإنتاجية بالمستشفى', `<p><b>رئيس اللجنة:</b> عضو إدارة الموارد البشرية (منسق نظام إدارة المرضى — إنتاجية الأطباء).<br><b>الأعضاء:</b> عضو لجنة إدارة دورة الإيرادات (RCM)، عضو لجنة الإدارة المالية، مدير قسم الداخلي، مدير العيادات، رئيس الأقسام الطبية، عضو لجنة إدارة الجودة، المدير الطبي، مدير العمليات، رئيس قسم العناية، مدير الطوارئ، المكتب الفني.</p>`)}
  ${sec('مسار البيانات في النظام', `<ol><li>المنسق يرفع قالب Excel الشهري (بيانات تعريفية + بيانات الأطباء + الأقسام) أو يدخلها يدوياً ← تُحفظ <b>مسودة</b>.</li><li>النظام يتحقق: يرفض الأرقام السالبة وغير الرقمية، وينبه على نسب المشاركة فوق 100%، والمنفذ أكبر من المطلوب، والبيانات الناقصة.</li><li>المنسق يرسل السجلات <b>للاعتماد</b>.</li><li>مدير الفرع أو الـ Process Manager <b>يعتمد</b> ← تُجمَّد الأرقام وتظهر للطبيب في ملفه، ويصدر التقرير الرسمي وكارت DPC.</li></ol>`)}
  ${sec('مصادر البيانات', `<ul><li>المدير الطبي: الجداول التشغيلية وعدد الشيفتات والإجراءات.</li><li>السجلات الطبية: عدد الحالات لكل طبيب.</li><li>قسم المطالبات: عدد الحالات وإجمالي الإنتاجية — قسم التكاليف: إجمالي التكلفة والمصروفات.</li><li>قسم نظم المعلومات والتحول الرقمي: مطابقة الجداول والإجراءات.</li><li>الأقسام الداخلية (الدفاتر الورقية) — قاعدة بيانات الاستحقاق والمزايا — الموارد البشرية (شيت البصمة).</li></ul>`)}
  ${sec('المعادلات الأساسية', `<ul>
    <li>إجمالي إنتاجية العيادات = عدد الحالات × سعر الكشف (${Object.entries(S.clinicPrice).map(([k, v]) => `${k} ${v} جنيه`).join('، ')}).</li>
    <li>صافي إنتاجية العيادات = الإجمالي − التكاليف (جراحي ${S.categories.surgical.cost}%، غير جراحي ${S.categories.nonsurgical.cost}%، تأهيلي ${S.categories.rehab.cost}%، تشخيصي ${S.categories.diagnostic.cost}%).</li>
    <li>نصيب الطبيب من المعمل ${S.services.lab}% والأشعة ${S.services.rad}% من قيمة الفحوصات المحولة، والصيدلية ${S.services.pharm}% من قيمة الأدوية.</li>
    <li>الداخلي/العناية/الطوارئ: صافي القسم × نصيب الأطباء × (شفتات الطبيب ÷ إجمالي الشفتات).</li>
    <li>العمليات: صافي الإنتاجية = إجمالي الإنتاجية × نسبة الدور (جراح رئيسي / مساعد / تخدير).</li>
    <li>الكلى: عدد الجلسات × سعر الجلسة × ${S.kidney.doctorPct}%.</li>
    <li>معدل الإنتاجية = إجمالي صافي إنتاجية الطبيب ÷ الاستحقاق ← التصنيف A–E.</li>
    <li>FTE = إجمالي الساعات التشغيلية ÷ ${S.hours.monthly} ساعة (الشفت ${S.hours.deptShift} ساعة، وأقصى عدد ${S.hours.maxShifts} شفت).</li>
    <li>مؤشر القيمة = 100 − [(إعادة الدخول × 0.4) + (المضاعفات × 0.4) + (SSI × 0.2)].</li>
    <li>كارت DPC: OPD = المرضى ÷ الساعات (المعيار ${S.dpc.opd})، IPD+ER = الحالات ÷ الساعات (المعيار ${S.dpc.ipd})، OR = العمليات ÷ ساعات العمل مقابل العمليات ÷ ساعات الجدول، Average Doc P.R = مجموع P.R ÷ مجموع B.M. الطوارئ: المرضى ÷ الساعات مقابل ${S.dpc.er}.</li>
  </ul><p><a href="#/settings">عرض كل النسب والجداول ←</a></p>`)}
  ${sec('منهجية حساب التكلفة (اللجنة العامة للتسعير)', `<div class="grid g2"><div><h3>التكلفة المباشرة</h3><ul><li>الأجور (متغير)</li><li>المستلزمات الطبية (متغير)</li><li>مصروف الإهلاك (ثابت)</li><li>مصروف الصيانة (ثابت)</li><li>أتعاب الأطباء (متغير)</li><li>وجبات المرضى الداخلي يومياً (متغير)</li></ul></div><div><h3>التكلفة غير المباشرة</h3><ul><li>أجور الأعمال الإدارية (ثابت)</li><li>فواتير المرافق: كهرباء، مياه، إنترنت (ثابت)</li><li>الإيجارات (ثابت)</li><li>التسويق للخدمة (متغير)</li><li>الأمن والنظافة (ثابت)</li></ul></div></div>
  <div class="grid g2"><table class="t"><thead><tr><th>الأجهزة</th><th>الإهلاك السنوي</th></tr></thead><tbody><tr><td>أجهزة القسطرة والأشعة والأورام</td><td>10%</td></tr><tr><td>باقي الأجهزة الطبية بما فيها الموجات الصوتية</td><td>15%</td></tr></tbody></table>
  <table class="t"><thead><tr><th>الأجهزة</th><th>الصيانة السنوية</th></tr></thead><tbody><tr><td>أجهزة طبية شاملة قطع الغيار</td><td>10%</td></tr><tr><td>أثاث طبي وغير طبي وتجهيزات أخرى</td><td>5%</td></tr></tbody></table></div>
  <table class="t" style="margin-top:10px"><thead><tr><th>البند</th><th>هامش الربح</th></tr></thead><tbody><tr><td>رسم فتح غرفة العمليات</td><td>10%</td></tr><tr><td>خدمات الإقامة الداخلية</td><td>10%</td></tr><tr><td>رسم استخدام الأجهزة الطبية</td><td>10%</td></tr><tr><td>الأدوية</td><td>7%</td></tr><tr><td>المستلزمات والخيوط الجراحية</td><td>10%</td></tr><tr><td>التركيبات الطبية</td><td>6% (حتى 50 ألف) · 5% (50–100 ألف) · 4% (أكثر من 100 ألف)</td></tr><tr><td>خدمات المعمل</td><td>10%</td></tr><tr><td>خدمات الأشعة</td><td>10%</td></tr></tbody></table>`)}`;
});
