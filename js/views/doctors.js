import { ctx, route, setTitle, topFilters, monthData, loadDoctors, hospName, go, invalidate } from '../core.js';
import { store, can, isValidNid } from '../store.js';
import { CATEGORY_LABELS } from '../defaults.js';
import { categoryOf } from '../engine.js';
import { esc, $, icons, avatar, classChip, pctf, modal, toast, resizeImage, confirmBox } from '../ui.js';

route('doctors', async (view) => {
  setTitle('بحث وفلترة الأطباء', 'اختر طبيباً لعرض ملفه الكامل ومؤشراته');
  await topFilters({ hospital: true, month: true });
  await loadDoctors(true);
  const { rows } = await monthData();
  const resBy = Object.fromEntries(rows.map(r => [r.doctor.id, r]));
  const S = ctx.settings;
  const all = Object.values(ctx.doctors).filter(d => !ctx.hospitalId || d.hospitalId === ctx.hospitalId);
  const specs = [...new Set(all.map(d => d.specialty))].sort();
  const f = ctx.cache.docFilter ||= { q: '', spec: '', degree: '', cls: '', emp: '', cat: '', sort: 'name' };

  view.innerHTML = `
  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <div style="position:relative;flex:1;min-width:240px"><input class="i" id="q" placeholder="ابحث بالرقم القومي أو اسم الطبيب أو الكود…" value="${esc(f.q)}"></div>
      ${can.editData(ctx.user) ? `<button class="btn primary" id="addDoc">${icons.plus} إضافة طبيب</button>` : ''}
    </div>
    <div class="grid g3">
      <label class="f"><span>التخصص</span><select class="i" id="fSpec"><option value="">جميع التخصصات</option>${specs.map(s => `<option ${s === f.spec ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f"><span>الدرجة العلمية</span><select class="i" id="fDeg"><option value="">جميع الدرجات</option>${S.degrees.map(s => `<option ${s === f.degree ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f"><span>تصنيف الإنتاجية (${esc(ctx.month)})</span><select class="i" id="fCls"><option value="">جميع التصنيفات</option>${S.classes.map(c => `<option value="${c.code}" ${c.code === f.cls ? 'selected' : ''}>${c.code} — ${esc(c.ar)}</option>`).join('')}<option value="none" ${f.cls === 'none' ? 'selected' : ''}>بدون بيانات هذا الشهر</option></select></label>
      <label class="f"><span>نوع التوظيف</span><select class="i" id="fEmp"><option value="">جميع الأنواع</option>${S.employmentTypes.map(s => `<option ${s === f.emp ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f"><span>تصنيف التخصص</span><select class="i" id="fCat"><option value="">الكل</option>${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}" ${k === f.cat ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f"><span>ترتيب حسب</span><select class="i" id="fSort">
        <option value="name" ${f.sort === 'name' ? 'selected' : ''}>الاسم (أبجدي)</option>
        <option value="rateDesc" ${f.sort === 'rateDesc' ? 'selected' : ''}>معدل الإنتاجية (الأعلى)</option>
        <option value="rateAsc" ${f.sort === 'rateAsc' ? 'selected' : ''}>معدل الإنتاجية (الأقل)</option>
        <option value="dpcDesc" ${f.sort === 'dpcDesc' ? 'selected' : ''}>إنتاجية DPC (الأعلى)</option>
      </select></label>
    </div>
  </div>
  <div class="row" style="margin:14px 2px"><span class="hint" id="count"></span></div>
  <div class="doc-grid" id="grid"></div>`;

  const draw = () => {
    const q = f.q.trim().toLowerCase();
    let list = all.filter(d => {
      const r = resBy[d.id];
      if (q && !(`${d.name} ${d.nationalId} ${d.code || ''}`.toLowerCase().includes(q))) return false;
      if (f.spec && d.specialty !== f.spec) return false;
      if (f.degree && d.degree !== f.degree) return false;
      if (f.emp && d.employmentType !== f.emp) return false;
      if (f.cat && categoryOf(d.specialty, S) !== f.cat) return false;
      if (f.cls === 'none' && r) return false;
      if (f.cls && f.cls !== 'none' && r?.res.financial.classification !== f.cls) return false;
      return true;
    });
    const rate = (d) => resBy[d.id]?.res.financial.rate ?? -1;
    const dpc = (d) => resBy[d.id]?.res.dpc.average ?? -1;
    list.sort({
      name: (a, b) => a.name.localeCompare(b.name, 'ar'),
      rateDesc: (a, b) => rate(b) - rate(a), rateAsc: (a, b) => (rate(a) < 0 ? 1e9 : rate(a)) - (rate(b) < 0 ? 1e9 : rate(b)),
      dpcDesc: (a, b) => dpc(b) - dpc(a),
    }[f.sort]);
    $('#count').textContent = `النتائج: ${list.length} من ${all.length}`;
    $('#grid').innerHTML = list.length ? list.map(d => {
      const r = resBy[d.id];
      return `<div class="doc-card" data-id="${d.id}">${avatar(d)}<b>${esc(d.name)}</b>
        <div class="s">${esc(d.specialty)} · ${esc(d.degree || '')}</div><div class="s">${esc(hospName(d.hospitalId))}</div>
        <div class="meta"><div>التصنيف<br>${classChip(r?.res.financial.classification)}</div><div>DPC<br><b>${r ? pctf(r.res.dpc.average) : '—'}</b></div>
        <div>نوع التوظيف<br><b>${esc(d.employmentType || '—')}</b></div><div>تصنيف التخصص<br><b>${CATEGORY_LABELS[categoryOf(d.specialty, S)]}</b></div></div></div>`;
    }).join('') : '<div class="empty card" style="grid-column:1/-1">لا يوجد أطباء مطابقين</div>';
    view.querySelectorAll('.doc-card').forEach(c => c.onclick = () => go('#/doctor/' + c.dataset.id));
  };
  const bind = (id, key) => { $(id).oninput = (e) => { f[key] = e.target.value; draw(); }; };
  bind('#q', 'q'); bind('#fSpec', 'spec'); bind('#fDeg', 'degree'); bind('#fCls', 'cls'); bind('#fEmp', 'emp'); bind('#fCat', 'cat'); bind('#fSort', 'sort');
  $('#addDoc')?.addEventListener('click', () => doctorForm(null));
  draw();
});

export function doctorForm(doc, onSaved) {
  const S = ctx.settings;
  const d = doc || { hospitalId: ctx.user.hospitalId || ctx.hospitalId || Object.keys(ctx.hospitals)[0], degree: 'أخصائي', employmentType: S.employmentTypes[0], cardType: 'auto', contractMonths: 11 };
  const hospOpts = (can.seeAllHospitals(ctx.user) ? Object.values(ctx.hospitals) : [ctx.hospitals[ctx.user.hospitalId]].filter(Boolean))
    .map(h => `<option value="${h.id}" ${h.id === d.hospitalId ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  let photo = d.photo || '';
  modal({
    title: doc ? 'تعديل بيانات الطبيب' : 'إضافة طبيب جديد', wide: true,
    body: `<form id="docForm" class="grid g3">
      <label class="f"><span>الاسم بالكامل *</span><input class="i" name="name" value="${esc(d.name || '')}" required></label>
      <label class="f"><span>الرقم القومي *</span><input class="i ltr" name="nationalId" value="${esc(d.nationalId || '')}" maxlength="14" required style="text-align:right"></label>
      <label class="f"><span>الاسم بالإنجليزية (لكارت DPC)</span><input class="i ltr" name="nameEn" value="${esc(d.nameEn || '')}" style="text-align:left"></label>
      <label class="f"><span>التخصص بالإنجليزية (لكارت DPC)</span><input class="i ltr" name="specialtyEn" value="${esc(d.specialtyEn || '')}" style="text-align:left"></label>
      <label class="f"><span>كود الطبيب</span><input class="i" name="code" value="${esc(d.code || '')}"></label>
      <label class="f"><span>المستشفى *</span><select class="i" name="hospitalId" required>${hospOpts}</select></label>
      <label class="f"><span>التخصص *</span><select class="i" name="specialty" required>${S.specialties.map(s => `<option ${s.name === d.specialty ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="f"><span>الدرجة العلمية</span><select class="i" name="degree">${S.degrees.map(s => `<option ${s === d.degree ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f"><span>نوع التوظيف</span><select class="i" name="employmentType">${S.employmentTypes.map(s => `<option ${s === d.employmentType ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f"><span>تاريخ التعيين</span><input class="i" type="date" name="hireDate" value="${esc(d.hireDate || '')}"></label>
      <label class="f"><span>صلاحية العقد (شهر)</span><input class="i" type="number" min="0" name="contractMonths" value="${esc(d.contractMonths ?? '')}"></label>
      <label class="f"><span>نوع كارت DPC</span><select class="i" name="cardType">
        <option value="auto" ${!d.cardType || d.cardType === 'auto' ? 'selected' : ''}>تلقائي (طوارئ لو التخصص طوارئ)</option>
        <option value="standard" ${d.cardType === 'standard' ? 'selected' : ''}>OPD + IPD/ER + OR</option>
        <option value="er" ${d.cardType === 'er' ? 'selected' : ''}>كارت الطوارئ</option></select></label>
      <label class="f"><span>القسم الداخلي المرتبط</span><input class="i" name="ipDept" value="${esc(d.ipDept || '')}" placeholder="افتراضياً = التخصص"></label>
      <label class="f"><span>قسم العناية المرتبط</span><input class="i" name="icuDept" value="${esc(d.icuDept || '')}" placeholder="لو فيه أكثر من عناية"></label>
      <div class="f" style="grid-column:1/-1"><span style="font-weight:700;font-size:12.5px;color:var(--navy-2)">الصورة</span>
        <div class="row" style="margin-top:6px"><div id="ph">${avatar({ ...d, photo })}</div><input type="file" accept="image/*" id="photoIn"><button type="button" class="btn sm" id="rmPh">إزالة الصورة</button></div></div>
    </form><div id="docErr"></div>`,
    footer: `${doc && ctx.user.role === 'process_manager' ? '<button class="btn danger" id="delDoc">حذف الطبيب</button><span class="spacer"></span>' : ''}<button class="btn" data-cancel>إلغاء</button><button class="btn primary" id="saveDoc">حفظ</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-cancel]').onclick = close;
      m.querySelector('#photoIn').onchange = async (e) => { const file = e.target.files[0]; if (!file) return; photo = await resizeImage(file, 320); m.querySelector('#ph').innerHTML = avatar({ ...d, photo }); };
      m.querySelector('#rmPh').onclick = () => { photo = ''; m.querySelector('#ph').innerHTML = avatar({ ...d, photo }); };
      m.querySelector('#delDoc')?.addEventListener('click', async () => {
        if (!await confirmBox('حذف الطبيب سيخفيه من القوائم (سجلاته الشهرية تبقى محفوظة). متأكد؟', 'حذف', true)) return;
        await store.remove('doctors', doc.id); toast('تم الحذف', 'ok'); close(); invalidate(); ctx.cache.doctorsLoaded = false; go('#/doctors');
      });
      m.querySelector('#saveDoc').onclick = async () => {
        const fd = Object.fromEntries(new FormData(m.querySelector('#docForm')));
        const err = (t) => { m.querySelector('#docErr').innerHTML = `<div class="alert err">${esc(t)}</div>`; };
        fd.name = fd.name.trim(); fd.nationalId = fd.nationalId.trim();
        if (!fd.name) return err('الاسم مطلوب');
        if (!isValidNid(fd.nationalId)) return err('الرقم القومي غير صحيح (14 رقم)');
        const dup = Object.values(ctx.doctors).find(x => x.nationalId === fd.nationalId && x.id !== doc?.id);
        if (dup) return err(`الرقم القومي مسجل لطبيب آخر: ${dup.name}`);
        const id = doc?.id || 'doc_' + fd.nationalId;
        const data = { ...fd, contractMonths: fd.contractMonths === '' ? null : Number(fd.contractMonths), photo, id };
        try {
          await store.put('doctors', id, data);
          ctx.doctors[id] = { ...(doc || {}), ...data };
          toast('تم الحفظ', 'ok'); close(); onSaved ? onSaved() : go('#/doctor/' + id);
        } catch (e) { err('تعذر الحفظ: ' + e.message); }
      };
    },
  });
}
