import { ctx, route, setTitle, topFilters, monthData, loadDoctors, loadDepts, hospName, go, invalidate, resultFor } from '../core.js';
import { store, can, isValidNid } from '../store.js';
import { RECORD_FIELDS, DEPT_TYPES, CATEGORY_LABELS } from '../defaults.js';
import { compute, validateRecord, categoryOf, num as toNum } from '../engine.js';
import { esc, $, $$, icons, money, num, pctf, monthLabel, statusChip, classChip, toast, modal, confirmBox, downloadBlob, lastMonths } from '../ui.js';

const FIELD = Object.fromEntries(RECORD_FIELDS.map(([k, l]) => [k, l]));
const nowIso = () => new Date().toISOString();
const log = (action, extra = {}) => store.put('logs', 'l' + Date.now() + Math.random().toString(36).slice(2, 6), { action, by: ctx.user.uid, byName: ctx.user.name, at: nowIso(), ...extra }).catch(() => {});

// ============ عمليات الحالة ============
export async function submitRecords(recs) {
  const list = recs.filter(r => r.status === 'draft' || !r.status);
  if (!list.length) return toast('لا توجد مسودات للإرسال');
  await store.putMany('records', list.map(r => ({ id: r.id, status: 'submitted', submittedBy: ctx.user.uid, submittedAt: nowIso() })));
  log('submit', { count: list.length, month: list[0].month });
  toast(`تم إرسال ${list.length} سجل للاعتماد`, 'ok');
}
export async function approveRecords(items) {
  const list = items.filter(x => x.rec.status !== 'approved');
  if (!list.length) return toast('لا توجد سجلات للاعتماد');
  await store.putMany('records', list.map(({ rec, doctor, depts }) => ({
    id: rec.id, status: 'approved',
    computed: compute(doctor, rec.data || {}, (depts || []).filter(d => d.hospitalId === rec.hospitalId && d.month === rec.month), ctx.settings),
    approvedBy: ctx.user.uid, approvedByName: ctx.user.name || '', approvedAt: nowIso(),
  })));
  log('approve', { count: list.length, month: list[0].rec.month });
  toast(`تم اعتماد ${list.length} سجل`, 'ok');
}
export async function returnRecords(recs) {
  if (!await confirmBox(`إرجاع ${recs.length} سجل إلى مسودة؟ (سيختفي من ملف الطبيب لحين إعادة الاعتماد)`, 'إرجاع', true)) return;
  await store.putMany('records', recs.map(r => ({ id: r.id, status: 'draft', computed: null, approvedBy: null, approvedAt: null })));
  log('return', { count: recs.length, month: recs[0]?.month });
  toast('تم الإرجاع', 'ok');
}

// ============ محرر سجل شهري ============
export function openRecordEditor(doctor, month, rec, depts, onSaved) {
  const data = { ...(rec?.data || {}) };
  const groups = [...new Set(RECORD_FIELDS.map(f => f[2]))];
  const isNew = !rec;
  const m0 = month || ctx.month;
  modal({
    title: `${isNew ? 'إدخال' : 'تعديل'} بيانات شهر — ${esc(doctor.name)}`, wide: true,
    body: `
      ${isNew ? `<label class="f" style="max-width:260px;margin-bottom:10px"><span>الشهر</span><select class="i" id="recMonth">${lastMonths(18).map(m => `<option value="${m}" ${m === m0 ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>` : `<p class="hint">الشهر: <b>${monthLabel(month)}</b> — اترك الخانة فاضية لو مش منطبقة.</p>`}
      ${rec?.status === 'approved' ? '<div class="alert warn">هذا السجل معتمد — أي تعديل سيرجعه إلى مسودة ويحتاج إعادة اعتماد.</div>' : ''}
      <div class="grid" style="grid-template-columns: 1fr 300px; align-items:start">
        <form id="recForm">${groups.map(g => `<h3>${g}</h3><div class="grid g3">${RECORD_FIELDS.filter(f => f[2] === g).map(([k, l, , u]) =>
          `<label class="f"><span>${l} <small class="hint">(${u})</small></span><input class="i ltr" style="text-align:right" name="${k}" inputmode="decimal" value="${esc(data[k] ?? '')}"></label>`).join('')}</div>`).join('')}</form>
        <div class="card" style="position:sticky;top:70px"><h2>معاينة فورية</h2><div id="preview"></div></div>
      </div>`,
    footer: `<button class="btn" data-cancel>إلغاء</button><button class="btn primary" id="saveRec">حفظ كمسودة</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-cancel]').onclick = close;
      const read = () => { const o = {}; $$('input[name]', m.querySelector('#recForm')).forEach(i => { if (i.value.trim() !== '') o[i.name] = toNum(i.value); }); return o; };
      const preview = () => {
        const d = read();
        const mon = isNew ? m.querySelector('#recMonth').value : month;
        const res = compute(doctor, d, (depts || []).filter(x => x.hospitalId === doctor.hospitalId && x.month === mon), ctx.settings);
        const errs = validateRecord(Object.fromEntries($$('input[name]', m).map(i => [i.name, i.value.trim()])));
        $$('input[name]', m).forEach(i => i.classList.toggle('err', errs.some(e => e.field === i.name)));
        m.querySelector('#preview').innerHTML = `
          <div class="kv">صافي الإنتاجية: <b>${money(res.financial.totalNet)}</b></div>
          <div>الاستحقاق: <b>${money(res.financial.entitlement)}</b></div>
          <div>معدل الإنتاجية: <b class="num">${res.financial.entitlement ? num(res.financial.rate) : '-'}</b> ${classChip(res.financial.classification)}</div>
          <div>إنتاجية DPC: <b>${pctf(res.dpc.average)}</b></div>
          <div>مؤشر القيمة: <b>${res.clinical.valueIndex === null ? '-' : num(res.clinical.valueIndex, 1)}</b></div>
          ${errs.map(e => `<div class="alert err">${esc(FIELD[e.field] || e.field)}: ${esc(e.msg)}</div>`).join('')}
          ${res.warnings.map(w => `<div class="alert warn">${esc(w)}</div>`).join('')}`;
        return errs;
      };
      m.querySelector('#recForm').oninput = preview;
      m.querySelector('#recMonth')?.addEventListener('change', preview);
      preview();
      m.querySelector('#saveRec').onclick = async () => {
        if (preview().length) return toast('صحح الخانات المعلّمة بالأحمر أولاً', 'err');
        const mon = isNew ? m.querySelector('#recMonth').value : month;
        const id = `${doctor.id}_${mon}`;
        if (isNew) {
          const ex = await store.get('records', id).catch(() => null);
          if (ex && !await confirmBox(`يوجد بالفعل سجل لشهر ${monthLabel(mon)}. استبداله؟`, 'استبدال', true)) return;
          if (ex?.status === 'approved' && !can.admin(ctx.user)) return toast('السجل معتمد — لا يمكن تعديله إلا بواسطة مدير الفرع أو الـ Process Manager', 'err');
        }
        try {
          await store.put('records', id, { id, doctorId: doctor.id, hospitalId: doctor.hospitalId, month: mon, status: 'draft', data: read(), computed: null, updatedBy: ctx.user.uid, updatedByName: ctx.user.name || '', updatedAt: nowIso() });
          log('edit', { doctorId: doctor.id, month: mon });
          toast('تم الحفظ كمسودة', 'ok'); close(); invalidate(); onSaved?.(mon);
        } catch (e) { toast('تعذر الحفظ: ' + e.message, 'err'); }
      };
    },
  });
}

// ============ المراجعة والاعتماد ============
route('review', async (view) => {
  setTitle('البيانات الشهرية والاعتماد', 'مراجعة سجلات الأطباء وبيانات الأقسام، ثم الإرسال والاعتماد');
  await topFilters();
  await loadDoctors();
  const { rows, depts } = await monthData();
  const hid = ctx.user.hospitalId || ctx.hospitalId;
  const doctorsInScope = Object.values(ctx.doctors).filter(d => !hid || d.hospitalId === hid);
  const missing = doctorsInScope.filter(d => !rows.some(r => r.doctor.id === d.id));
  const sel = new Set();
  const stF = ctx.cache.reviewStatus || '';

  view.innerHTML = `
  <div class="card">
    <div class="row" style="margin-bottom:10px">
      <select class="i" id="stF" style="width:auto"><option value="">كل الحالات</option><option value="draft" ${stF === 'draft' ? 'selected' : ''}>مسودة</option><option value="submitted" ${stF === 'submitted' ? 'selected' : ''}>بانتظار الاعتماد</option><option value="approved" ${stF === 'approved' ? 'selected' : ''}>معتمد</option></select>
      <span class="hint">${rows.length} سجل — ${missing.length} طبيب بدون بيانات هذا الشهر</span><span class="spacer"></span>
      ${can.editData(ctx.user) ? `<button class="btn sm teal" id="bSubmit">إرسال المحدد للاعتماد</button>` : ''}
      ${can.approve(ctx.user) ? `<button class="btn sm teal" id="bApprove">${icons.check} اعتماد المحدد</button><button class="btn sm danger" id="bReturn">إرجاع المحدد للمسودة</button>` : ''}
      <button class="btn sm" id="bExport">${icons.down} تصدير النتائج Excel</button>
    </div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th><input type="checkbox" id="all"></th><th>الطبيب</th><th>المستشفى</th><th>الحالة</th><th>صافي الإنتاجية</th><th>الاستحقاق</th><th>المعدل</th><th>التصنيف</th><th>DPC</th><th>القيمة</th><th>ملاحظات</th></tr></thead>
    <tbody id="rtb"></tbody></table></div>
    ${missing.length ? `<details style="margin-top:12px"><summary class="hint" style="cursor:pointer">أطباء بدون بيانات لشهر ${monthLabel(ctx.month)} (${missing.length})</summary><div class="row" style="margin-top:8px">${missing.map(d => `<a class="chip" href="#/doctor/${d.id}">${esc(d.name)}</a>`).join('')}</div></details>` : ''}
  </div>
  <div class="card" style="margin-top:16px"><h2>بيانات الأقسام للشهر (الداخلي / العناية / الطوارئ / إجمالي المنشأة)</h2><div id="deptBox"></div></div>`;

  const drawRows = () => {
    const list = rows.filter(r => !stF || (r.rec.status || 'draft') === stF).sort((a, b) => a.doctor.name.localeCompare(b.doctor.name, 'ar'));
    $('#rtb').innerHTML = list.map(r => {
      const F = r.res.financial;
      return `<tr><td><input type="checkbox" data-sel="${r.rec.id}"></td>
      <td><a href="#/doctor/${r.doctor.id}"><b>${esc(r.doctor.name)}</b></a><div class="hint">${esc(r.doctor.specialty)}</div></td>
      <td>${esc(hospName(r.rec.hospitalId))}</td><td>${statusChip(r.rec.status)}</td>
      <td>${money(F.totalNet)}</td><td>${money(F.entitlement)}</td><td class="num">${F.entitlement ? num(F.rate) : '-'}</td><td>${classChip(F.classification)}</td>
      <td>${pctf(r.res.dpc.average)}</td><td>${r.res.clinical.valueIndex === null ? '-' : num(r.res.clinical.valueIndex, 0)}</td>
      <td>${r.res.warnings.length ? `<span class="chip warn" title="${esc(r.res.warnings.join('\n'))}">⚠ ${r.res.warnings.length}</span>` : '<span class="chip approved">✓</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="11" class="empty">لا توجد سجلات</td></tr>';
    $$('[data-sel]').forEach(c => c.onchange = () => c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel));
  };
  drawRows();
  $('#stF').onchange = (e) => { ctx.cache.reviewStatus = e.target.value; go('#/review'); };
  $('#all').onchange = (e) => { $$('[data-sel]').forEach(c => { c.checked = e.target.checked; c.onchange(); }); };
  const picked = () => rows.filter(r => sel.has(r.rec.id));
  const need = () => { const p = picked(); if (!p.length) toast('اختر سجلات أولاً', 'err'); return p; };
  $('#bSubmit')?.addEventListener('click', async () => { const p = need(); if (!p.length) return; await submitRecords(p.map(r => r.rec)); go('#/review'); });
  $('#bApprove')?.addEventListener('click', async () => {
    const p = need(); if (!p.length) return;
    const w = p.filter(r => r.res.warnings.length).length;
    if (!await confirmBox(`اعتماد ${p.length} سجل؟${w ? `<br><b>تنبيه:</b> ${w} منها عليها ملاحظات.` : ''}<br>بعد الاعتماد تُجمَّد الأرقام وتظهر للطبيب.`, 'اعتماد')) return;
    await approveRecords(p.map(r => ({ rec: r.rec, doctor: r.doctor, depts })));
    go('#/review');
  });
  $('#bReturn')?.addEventListener('click', async () => { const p = need(); if (!p.length) return; await returnRecords(p.map(r => r.rec)); go('#/review'); });
  $('#bExport').onclick = () => exportResults(rows);

  // الأقسام
  const editH = can.editData(ctx.user) ? (ctx.user.hospitalId || ctx.hospitalId) : null;
  const dlist = depts.filter(d => !hid || d.hospitalId === hid).sort((a, b) => (a.hospitalId + a.type + a.name).localeCompare(b.hospitalId + b.type + b.name));
  $('#deptBox').innerHTML = `
    ${can.editData(ctx.user) && !editH ? '<div class="alert info">لتعديل بيانات الأقسام اختر مستشفى من أعلى الصفحة.</div>' : ''}
    <div class="tbl-wrap"><table class="t"><thead><tr><th>المستشفى</th><th>النوع</th><th>اسم القسم</th><th>إجمالي الإنتاجية</th><th>الاستقطاعات</th><th>إجمالي شفتات القسم</th><th>إجمالي استحقاق العاملين</th>${editH ? '<th></th>' : ''}</tr></thead>
    <tbody id="dtb">${dlist.map(d => deptRow(d, !!editH && d.hospitalId === editH)).join('') || '<tr><td colspan="8" class="empty">لا توجد بيانات أقسام لهذا الشهر</td></tr>'}</tbody></table></div>
    ${editH ? `<div class="row" style="margin-top:10px"><button class="btn sm" id="addDept">${icons.plus} إضافة قسم</button><span class="spacer"></span><button class="btn sm primary" id="saveDepts">حفظ بيانات الأقسام</button></div>` : ''}`;
  $('#addDept')?.addEventListener('click', () => {
    const tb = $('#dtb'); if (tb.querySelector('.empty')) tb.innerHTML = '';
    tb.insertAdjacentHTML('beforeend', deptRow({ hospitalId: editH, month: ctx.month, type: 'inpatient', name: '' }, true));
    bindDel();
  });
  const bindDel = () => $$('[data-deldept]').forEach(b => b.onclick = () => b.closest('tr').remove());
  bindDel();
  $('#saveDepts')?.addEventListener('click', async () => {
    const trs = $$('#dtb tr[data-edit]');
    const items = [];
    for (const tr of trs) {
      const g = (n) => tr.querySelector(`[name=${n}]`).value.trim();
      const type = g('type'), name = g('name') || DEPT_TYPES[type];
      const it = { hospitalId: editH, month: ctx.month, type, name, gross: g('gross') === '' ? '' : toNum(g('gross')), deductions: g('deductions') === '' ? '' : toNum(g('deductions')), totalShifts: g('totalShifts') === '' ? '' : toNum(g('totalShifts')), totalStaffEntitlement: g('tse') === '' ? '' : toNum(g('tse')) };
      if ([it.gross, it.deductions, it.totalShifts, it.totalStaffEntitlement].some(v => v !== '' && (v < 0 || !Number.isFinite(v)))) return toast(`قيمة غير صحيحة في قسم "${name}"`, 'err');
      it.id = `${editH}_${ctx.month}_${type}_${name}`;
      items.push(it);
    }
    const old = dlist.filter(d => d.hospitalId === editH).map(d => d.id);
    const keep = new Set(items.map(i => i.id));
    for (const id of old) if (!keep.has(id)) await store.remove('depts', id);
    await store.putMany('depts', items);
    log('depts', { month: ctx.month, hospitalId: editH, count: items.length });
    toast('تم حفظ بيانات الأقسام — السجلات غير المعتمدة أعيد حسابها', 'ok');
    go('#/review');
  });
});

function deptRow(d, edit) {
  if (!edit) return `<tr><td>${esc(hospName(d.hospitalId))}</td><td>${DEPT_TYPES[d.type] || d.type}</td><td>${esc(d.name)}</td><td>${money(toNum(d.gross))}</td><td>${d.deductions === '' || d.deductions === undefined ? '<span class="hint">افتراضي</span>' : money(toNum(d.deductions))}</td><td>${d.totalShifts ?? '-'}</td><td>${money(toNum(d.totalStaffEntitlement))}</td></tr>`;
  const v = (x) => esc(x ?? '');
  return `<tr data-edit="1"><td>${esc(hospName(d.hospitalId))}</td>
    <td><select class="i" name="type">${Object.entries(DEPT_TYPES).map(([k, l]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    <td><input class="i" name="name" value="${v(d.name)}" placeholder="مثال: نسا / العناية المركزة"></td>
    <td><input class="i ltr" name="gross" value="${v(d.gross)}"></td><td><input class="i ltr" name="deductions" value="${v(d.deductions)}" placeholder="فاضي = النسبة الافتراضية"></td>
    <td><input class="i ltr" name="totalShifts" value="${v(d.totalShifts)}"></td><td><input class="i ltr" name="tse" value="${v(d.totalStaffEntitlement)}"></td>
    <td><button class="btn sm danger" data-deldept>✕</button></td></tr>`;
}

function exportResults(rows) {
  const S = ctx.settings;
  const out = rows.map(r => {
    const F = r.res.financial, D = r.res.dpc, C = r.res.clinical, O = r.res.operational;
    return {
      'المستشفى': hospName(r.rec.hospitalId), 'اسم الطبيب': r.doctor.name, 'الرقم القومي': r.doctor.nationalId, 'التخصص': r.doctor.specialty,
      'تصنيف التخصص': CATEGORY_LABELS[r.res.category], 'الدرجة العلمية': r.doctor.degree, 'نوع التوظيف': r.doctor.employmentType, 'الحالة': r.rec.status,
      'إجمالي إنتاجية العيادات': F.clinicGross, 'صافي الطبيب بالعيادة': F.clinicDoctorNet, 'نصيب الخدمات': F.servicesShare,
      'صافي الطبيب بالداخلي': F.ip.doctor, 'صافي الطبيب بالعناية': F.icu.doctor, 'صافي الطبيب بالعمليات': F.ops.doctor, 'صافي الطبيب بالطوارئ': F.er.doctor, 'صافي الطبيب بالكلى': F.kidneyDoctor,
      'إجمالي الإنتاجية': F.totalGross, 'إجمالي صافي إنتاجية الطبيب': F.totalNet, 'إجمالي الاستحقاق': F.grossEnt, 'صافي الاستحقاق': F.netEnt,
      'معدل الإنتاجية': +F.rate.toFixed(2), 'التصنيف': F.classification || '',
      'FTE': +O.fte.toFixed(2), 'DPC Total P.R': +D.totalPR.toFixed(2), 'DPC B.M': +D.totalBM.toFixed(2), 'Average Doc P.R %': Math.round(D.average * 100),
      'إعادة الدخول %': +C.readmissionRate.toFixed(2), 'المضاعفات %': +C.complicationRate.toFixed(2), 'SSI %': +C.ssiRate.toFixed(2), 'مؤشر القيمة': C.valueIndex === null ? '' : +C.valueIndex.toFixed(1),
      'ملاحظات': r.res.warnings.join(' | '),
    };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(out); ws['!views'] = [{ RTL: true }];
  XLSX.utils.book_append_sheet(wb, ws, 'النتائج');
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, `نتائج-الإنتاجية-${ctx.month}.xlsx`);
  void S;
}

// ============ رفع البيانات ============
const ID_COLS = ['المحافظة', 'المستشفى', 'اسم الطبيب', 'الرقم القومي', 'كود الطبيب', 'نوع التعيين', 'التخصص', 'التصنيف', 'الدرجة العلمية', 'تاريخ التعيين', 'الاسم بالإنجليزية', 'التخصص بالإنجليزية'];
const DEPT_COLS = ['نوع القسم', 'اسم القسم', 'إجمالي الإنتاجية', 'الاستقطاعات', 'إجمالي شفتات القسم', 'إجمالي استحقاق العاملين بالمنشأة'];
const SH_ID = 'بيانات تعريفية', SH_MONTH = 'بيانات الأطباء الشهرية', SH_DEPT = 'الأقسام', SH_HELP = 'تعليمات';

route('upload', async (view) => {
  if (!can.editData(ctx.user)) { view.innerHTML = '<div class="card empty">ليست لديك صلاحية</div>'; return; }
  setTitle('رفع البيانات', 'قالب Excel موحد: بيانات تعريفية + البيانات الشهرية + الأقسام');
  await topFilters({ hospital: false });
  await loadDoctors(true);
  const hospOpts = can.seeAllHospitals(ctx.user) ? Object.values(ctx.hospitals) : [ctx.hospitals[ctx.user.hospitalId]].filter(Boolean);
  let hid = ctx.user.hospitalId || ctx.hospitalId || hospOpts[0]?.id || '';
  view.innerHTML = `
  <div class="card"><h2>1) اختر المستشفى والشهر ونزّل القالب</h2>
    <div class="row">
      <label class="f" style="min-width:260px"><span>المستشفى</span><select class="i" id="upH" ${ctx.user.hospitalId ? 'disabled' : ''}>${hospOpts.map(h => `<option value="${h.id}" ${h.id === hid ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
      <div class="f"><span class="hint">الشهر (من أعلى الصفحة)</span><br><b>${monthLabel(ctx.month)}</b></div><span class="spacer"></span>
      <button class="btn teal" id="dlT">${icons.down} تنزيل قالب Excel (بأسماء أطباء المستشفى)</button>
    </div>
    ${!hospOpts.length ? '<div class="alert warn">لا توجد مستشفيات بعد — أضفها من صفحة المستشفيات.</div>' : ''}
  </div>
  <div class="card"><h2>2) ارفع الملف بعد ملئه</h2>
    <input type="file" id="upF" accept=".xlsx,.xls,.csv" class="i">
    <p class="hint">السيستم بيتعرف على الأعمدة بأسمائها، وبيرفض الأرقام السالبة أو غير الرقمية، وبيطابق كل طبيب بالرقم القومي. السجلات المعتمدة لا تُستبدل إلا بواسطة مدير الفرع أو الـ Process Manager.</p>
    <div id="upRes"></div>
  </div>`;
  $('#upH').onchange = (e) => { hid = e.target.value; };
  $('#dlT').onclick = () => downloadTemplate(hid);
  $('#upF').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await handleUpload(file, hid, $('#upRes')); } catch (ex) { console.error(ex); $('#upRes').innerHTML = `<div class="alert err">تعذر قراءة الملف: ${esc(ex.message)}</div>`; }
    e.target.value = '';
  };
});

function downloadTemplate(hid) {
  const S = ctx.settings;
  const h = ctx.hospitals[hid];
  const docs = Object.values(ctx.doctors).filter(d => d.hospitalId === hid).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const wb = XLSX.utils.book_new();
  const idRows = [ID_COLS, ...docs.map(d => ['المنيا', h?.name || '', d.name, d.nationalId, d.code || '', d.employmentType || '', d.specialty, CATEGORY_LABELS[categoryOf(d.specialty, S)], d.degree || '', d.hireDate || '', d.nameEn || '', d.specialtyEn || ''])];
  const monthRows = [['الرقم القومي', 'اسم الطبيب', ...RECORD_FIELDS.map(f => f[1])], ...docs.map(d => [d.nationalId, d.name])];
  const deptRows = [DEPT_COLS, ['قسم داخلي', 'نسا', '', '', '', ''], ['عناية', 'العناية المركزة', '', '', '', ''], ['طوارئ', 'الطوارئ', '', '', '', ''], ['إجمالي المنشأة', 'إجمالي المنشأة', '', '', '', '']];
  const help = [
    ['تعليمات قالب ' + S.systemName], [''],
    [`المستشفى: ${h?.name || ''} — الشهر: ${monthLabel(ctx.month)} (الشهر يتحدد من السيستم وقت الرفع)`],
    ['1) شيت "بيانات تعريفية": بيانات الأطباء الأساسية. أي طبيب جديد يضاف هنا (الرقم القومي 14 رقم).'],
    [`2) شيت "بيانات الأطباء الشهرية": صف لكل طبيب. الخانة الفاضية = غير منطبق. الأرقام بدون فواصل أو علامات.`],
    ['   — ساعات العمل الفعلية بالعيادة: لو فاضية تُحسب = عدد الشفتات × 6.'],
    ['   — قيم العمليات: إجمالي قيمة العمليات اللي شارك فيها الطبيب حسب نوعها ودوره.'],
    ['   — أطباء الطوارئ: املأ خانات (الطوارئ كارت مستقل).'],
    ['3) شيت "الأقسام": لكل قسم داخلي/عناية/طوارئ: إجمالي الإنتاجية، الاستقطاعات (لو فاضية تُطبق النسبة الافتراضية)، وإجمالي شفتات القسم.'],
    ['   — اسم القسم الداخلي لازم يطابق تخصص الطبيب (أو "القسم الداخلي المرتبط" في ملفه).'],
    ['   — صف "إجمالي المنشأة": اكتب إجمالي استحقاق كل العاملين بالمنشأة (لتحليل نسبة تكلفة الأطباء).'],
    ['4) نوع القسم: قسم داخلي / عناية / طوارئ / إجمالي المنشأة'],
    [`5) الدرجات العلمية المعتمدة: ${S.degrees.join(' / ')} — أنواع التعيين: ${S.employmentTypes.join(' / ')}`],
  ];
  const add = (rows, name, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = widths; XLSX.utils.book_append_sheet(wb, ws, name); };
  add(help, SH_HELP, [{ wch: 110 }]);
  add(idRows, SH_ID, ID_COLS.map(() => ({ wch: 18 })));
  add(monthRows, SH_MONTH, [{ wch: 16 }, { wch: 26 }, ...RECORD_FIELDS.map(() => ({ wch: 20 }))]);
  add(deptRows, SH_DEPT, DEPT_COLS.map(() => ({ wch: 22 })));
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, `قالب-الإنتاجية-${h?.name || ''}-${ctx.month}.xlsx`);
}

async function handleUpload(file, hid, box) {
  const S = ctx.settings;
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheet = (name) => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : null;
  const idRows = sheet(SH_ID) || [];
  const monthRows = sheet(SH_MONTH) || (wb.SheetNames.length === 1 ? sheet(wb.SheetNames[0]) : []);
  const deptRows = sheet(SH_DEPT) || [];
  const errors = [], warnings = [];
  const labelToKey = Object.fromEntries(RECORD_FIELDS.flatMap(([k, l]) => [[l, k], [k, k]]));
  const specNames = new Set(S.specialties.map(s => s.name));
  const empty = (v) => v === '' || v === null || v === undefined;

  // التعريفية
  const newDocs = [];
  const byNid = Object.fromEntries(Object.values(ctx.doctors).map(d => [d.nationalId, d]));
  idRows.forEach((r, i) => {
    const nid = String(r['الرقم القومي'] || '').trim();
    if (!nid && !r['اسم الطبيب']) return;
    const line = `بيانات تعريفية — صف ${i + 2}`;
    if (!isValidNid(nid)) return errors.push(`${line}: رقم قومي غير صحيح "${nid}"`);
    const spec = String(r['التخصص'] || '').trim();
    if (!specNames.has(spec)) warnings.push(`${line}: التخصص "${spec}" غير موجود في جدول التصنيفات — سيُعامل كغير جراحي (أضفه من الإعدادات)`);
    const ex = byNid[nid];
    if (ex && ex.hospitalId !== hid) return errors.push(`${line}: الطبيب ${ex.name} مسجل في ${hospName(ex.hospitalId)} — انقله من ملفه أولاً`);
    const deg = String(r['الدرجة العلمية'] || '').trim();
    if (deg && !S.degrees.includes(deg)) warnings.push(`${line}: الدرجة "${deg}" ليس لها سعر كشف في الإعدادات`);
    newDocs.push({ ...(ex || {}), id: ex?.id || 'doc_' + nid, nationalId: nid, name: String(r['اسم الطبيب'] || ex?.name || '').trim(), hospitalId: hid, specialty: spec || ex?.specialty, degree: deg || ex?.degree || '', employmentType: String(r['نوع التعيين'] || ex?.employmentType || '').trim(), code: String(r['كود الطبيب'] || ex?.code || '').trim(), hireDate: String(r['تاريخ التعيين'] || ex?.hireDate || '').trim(), nameEn: String(r['الاسم بالإنجليزية'] || ex?.nameEn || '').trim(), specialtyEn: String(r['التخصص بالإنجليزية'] || ex?.specialtyEn || '').trim() });
  });
  const docAfter = { ...byNid }; newDocs.forEach(d => { docAfter[d.nationalId] = d; });

  // الشهرية
  const recs = [];
  const existing = Object.fromEntries((await store.list('records', [['hospitalId', '==', hid], ['month', '==', ctx.month]])).map(r => [r.id, r]));
  monthRows.forEach((r, i) => {
    const nid = String(r['الرقم القومي'] || '').trim();
    if (!nid) return;
    const line = `البيانات الشهرية — صف ${i + 2}`;
    const d = docAfter[nid];
    if (!d) return errors.push(`${line}: الرقم القومي ${nid} غير مسجل — أضفه في شيت "بيانات تعريفية"`);
    if (d.hospitalId !== hid) return errors.push(`${line}: ${d.name} تابع لمستشفى آخر`);
    const data = {}; let bad = false;
    for (const [col, v] of Object.entries(r)) {
      const key = labelToKey[String(col).trim()];
      if (!key || empty(v)) continue;
      const x = typeof v === 'number' ? v : Number(String(v).replace(/[,٬\s]/g, '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
      if (!Number.isFinite(x)) { errors.push(`${line} (${d.name}): "${FIELD[key]}" قيمة غير رقمية "${v}"`); bad = true; continue; }
      if (x < 0) { errors.push(`${line} (${d.name}): "${FIELD[key]}" بالسالب (${x}) — غير مقبول`); bad = true; continue; }
      data[key] = x;
    }
    if (bad) return;
    const id = `${d.id}_${ctx.month}`;
    if (existing[id]?.status === 'approved' && !can.admin(ctx.user)) return errors.push(`${line} (${d.name}): سجل الشهر معتمد بالفعل — لن يُستبدل`);
    recs.push({ id, doctorId: d.id, hospitalId: hid, month: ctx.month, status: 'draft', data, computed: null, updatedBy: ctx.user.uid, updatedByName: ctx.user.name || '', updatedAt: nowIso(), _doctor: d, _replace: !!existing[id] });
  });

  // الأقسام
  const typeOf = Object.fromEntries(Object.entries(DEPT_TYPES).map(([k, l]) => [l, k]));
  const deptItems = [];
  deptRows.forEach((r, i) => {
    const tl = String(r['نوع القسم'] || '').trim();
    const nums = ['إجمالي الإنتاجية', 'الاستقطاعات', 'إجمالي شفتات القسم', 'إجمالي استحقاق العاملين بالمنشأة'].map(c => r[c]);
    if (!tl || nums.every(empty)) return;
    const line = `الأقسام — صف ${i + 2}`;
    const type = typeOf[tl] || (DEPT_TYPES[tl] ? tl : null);
    if (!type) return errors.push(`${line}: نوع القسم "${tl}" غير معروف`);
    const vals = nums.map(v => empty(v) ? '' : Number(String(v).replace(/[,\s]/g, '')));
    if (vals.some(v => v !== '' && (!Number.isFinite(v) || v < 0))) return errors.push(`${line}: قيمة غير صحيحة`);
    const name = String(r['اسم القسم'] || DEPT_TYPES[type]).trim();
    deptItems.push({ id: `${hid}_${ctx.month}_${type}_${name}`, hospitalId: hid, month: ctx.month, type, name, gross: vals[0], deductions: vals[1], totalShifts: vals[2], totalStaffEntitlement: vals[3] });
  });

  // المعاينة
  const preview = recs.map(r => ({ r, res: compute(r._doctor, r.data, deptItems, S) }));
  preview.forEach(({ r, res }) => res.warnings.forEach(w => warnings.push(`${r._doctor.name}: ${w}`)));
  box.innerHTML = `
    <div class="grid g4" style="margin:12px 0">
      <div class="kpi small"><div><div class="lbl">أطباء (تعريفية)</div><div class="val">${newDocs.length}</div></div></div>
      <div class="kpi small"><div><div class="lbl">سجلات شهرية صالحة</div><div class="val">${recs.length}</div><div class="sub">${recs.filter(r => r._replace).length} ستستبدل سجلات موجودة</div></div></div>
      <div class="kpi small"><div><div class="lbl">أقسام</div><div class="val">${deptItems.length}</div></div></div>
      <div class="kpi small"><div><div class="lbl">أخطاء / ملاحظات</div><div class="val" style="color:${errors.length ? 'var(--E)' : 'inherit'}">${errors.length} / ${warnings.length}</div></div></div>
    </div>
    ${errors.length ? `<details open><summary><b style="color:var(--E)">الأخطاء (الصفوف دي مش هتترفع)</b></summary>${errors.slice(0, 200).map(e => `<div class="alert err">${esc(e)}</div>`).join('')}</details>` : ''}
    ${warnings.length ? `<details><summary><b style="color:#946000">ملاحظات للمراجعة (${warnings.length})</b></summary>${warnings.slice(0, 300).map(e => `<div class="alert warn">${esc(e)}</div>`).join('')}</details>` : ''}
    ${preview.length ? `<div class="tbl-wrap" style="margin-top:10px;max-height:340px"><table class="t"><thead><tr><th>الطبيب</th><th>صافي الإنتاجية</th><th>الاستحقاق</th><th>المعدل</th><th>التصنيف</th><th>DPC</th></tr></thead><tbody>
      ${preview.map(({ r, res }) => `<tr><td>${esc(r._doctor.name)}${r._replace ? ' <span class="chip warn">استبدال</span>' : ''}</td><td>${money(res.financial.totalNet)}</td><td>${money(res.financial.entitlement)}</td><td class="num">${res.financial.entitlement ? num(res.financial.rate) : '-'}</td><td>${classChip(res.financial.classification)}</td><td>${pctf(res.dpc.average)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="row end" style="margin-top:12px"><button class="btn primary" id="doImport" ${newDocs.length + recs.length + deptItems.length ? '' : 'disabled'}>${icons.upload} حفظ البيانات كمسودة لشهر ${monthLabel(ctx.month)}</button></div>`;
  $('#doImport').onclick = async () => {
    if (!await confirmBox(`سيتم حفظ ${newDocs.length} طبيب، ${recs.length} سجل شهري، ${deptItems.length} قسم لشهر ${monthLabel(ctx.month)}.${errors.length ? `<br>${errors.length} صف به أخطاء سيتم تجاهله.` : ''}`, 'حفظ')) return;
    $('#doImport').disabled = true;
    try {
      if (newDocs.length) await store.putMany('doctors', newDocs);
      if (deptItems.length) await store.putMany('depts', deptItems);
      if (recs.length) await store.putMany('records', recs.map(({ _doctor, _replace, ...r }) => r));
      log('upload', { month: ctx.month, hospitalId: hid, doctors: newDocs.length, records: recs.length, depts: deptItems.length, file: file.name });
      ctx.cache.doctorsLoaded = false; invalidate();
      toast('تم الحفظ بنجاح', 'ok');
      go('#/review');
    } catch (e) { toast('تعذر الحفظ: ' + e.message, 'err'); $('#doImport').disabled = false; }
  };
}

void loadDepts; void resultFor; void modal;
