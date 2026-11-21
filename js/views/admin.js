import { ctx, route, setTitle, loadDoctors, go, hospName } from '../core.js';
import { store, can, ROLES, isValidNid } from '../store.js';
import { CATEGORY_LABELS, DEFAULT_SETTINGS } from '../defaults.js';
import { esc, $, $$, icons, toast, modal, confirmBox, resizeImage, emblem } from '../ui.js';

// ============ المستشفيات ============
route('hospitals', async (view) => {
  setTitle('المستشفيات', `مستشفيات ${ctx.settings.branchName}`);
  if (!can.manageHospitals(ctx.user)) { view.innerHTML = '<div class="card empty">ليست لديك صلاحية</div>'; return; }
  const hs = await store.list('hospitals');
  await loadDoctors(true);
  const count = (id) => Object.values(ctx.doctors).filter(d => d.hospitalId === id).length;
  view.innerHTML = `<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">المستشفيات (${hs.length})</h2><span class="spacer"></span><button class="btn primary" id="addH">${icons.plus} إضافة مستشفى</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>المستشفى</th><th>الكود</th><th>عدد الأطباء</th><th></th></tr></thead><tbody>
    ${hs.map(h => `<tr><td><b>${esc(h.name)}</b></td><td>${esc(h.code || '')}</td><td>${count(h.id)}</td><td><button class="btn sm" data-edit="${h.id}">${icons.edit} تعديل</button> ${count(h.id) ? '' : `<button class="btn sm danger" data-del="${h.id}">حذف</button>`}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد مستشفيات — أضف أول مستشفى</td></tr>'}
    </tbody></table></div></div>`;
  const form = (h) => modal({
    title: h ? 'تعديل مستشفى' : 'إضافة مستشفى',
    body: `<label class="f"><span>اسم المستشفى</span><input class="i" id="hn" value="${esc(h?.name || '')}"></label><br><label class="f"><span>كود (اختياري)</span><input class="i" id="hc" value="${esc(h?.code || '')}"></label>`,
    footer: `<button class="btn" data-c>إلغاء</button><button class="btn primary" data-s>حفظ</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-c]').onclick = close;
      m.querySelector('[data-s]').onclick = async () => {
        const name = m.querySelector('#hn').value.trim(); if (!name) return toast('اكتب اسم المستشفى', 'err');
        const id = h?.id || 'h_' + Date.now().toString(36);
        await store.put('hospitals', id, { id, name, code: m.querySelector('#hc').value.trim() });
        ctx.hospitals[id] = { id, name, code: m.querySelector('#hc').value.trim() };
        toast('تم الحفظ', 'ok'); close(); go('#/hospitals');
      };
    },
  });
  $('#addH').onclick = () => form(null);
  $$('[data-edit]').forEach(b => b.onclick = () => form(hs.find(h => h.id === b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!await confirmBox('حذف المستشفى؟', 'حذف', true)) return; await store.remove('hospitals', b.dataset.del); delete ctx.hospitals[b.dataset.del]; go('#/hospitals'); });
});

// ============ المستخدمين ============
route('users', async (view) => {
  setTitle('إدارة المستخدمين', 'الصلاحيات: Process Manager · مدير الفرع · منسق الإنتاجية · عضو اللجنة · الطبيب');
  if (!can.manageUsers(ctx.user)) { view.innerHTML = '<div class="card empty">ليست لديك صلاحية</div>'; return; }
  const isPM = ctx.user.role === 'process_manager';
  const users = (await store.list('users', isPM ? [] : [['hospitalId', '==', ctx.user.hospitalId]])).filter(u => u.active !== false || isPM);
  await loadDoctors();
  const showInactive = ctx.cache.showInactive || false;
  const list = users.filter(u => showInactive || u.active !== false).sort((a, b) => (a.role + a.name).localeCompare(b.role + b.name, 'ar'));
  view.innerHTML = `<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">المستخدمون (${list.length})</h2>
    ${isPM ? `<label class="hint row"><input type="checkbox" id="inact" ${showInactive ? 'checked' : ''}> عرض الموقوفين</label>` : ''}<span class="spacer"></span>
    <button class="btn" id="bulkDocs">${icons.users} إنشاء حسابات للأطباء دفعة واحدة</button>
    <button class="btn primary" id="addU">${icons.plus} إضافة مستخدم</button></div>
    ${!isPM ? '<div class="alert info">كمنسق، يمكنك إنشاء حسابات الأطباء ولجنة الإنتاجية في مستشفاك فقط.</div>' : ''}
    <div class="tbl-wrap"><table class="t"><thead><tr><th>الاسم</th><th>الرقم القومي</th><th>الصلاحية</th><th>المستشفى</th><th>الطبيب المرتبط</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${list.map(u => `<tr><td><b>${esc(u.name)}</b></td><td class="num">${esc(u.nationalId)}</td><td>${esc(ROLES[u.role] || u.role)}</td><td>${esc(u.hospitalId ? hospName(u.hospitalId) : 'كل المستشفيات')}</td><td>${esc(ctx.doctors[u.doctorId]?.name || '')}</td>
      <td>${u.active === false ? '<span class="chip E">موقوف</span>' : '<span class="chip approved">نشط</span>'}</td>
      <td>${u.uid !== ctx.user.uid && u.active !== false && (isPM || ['doctor', 'committee'].includes(u.role)) ? `<button class="btn sm" data-pw="${u.uid}">${icons.key} كلمة مرور جديدة</button> <button class="btn sm danger" data-off="${u.uid}">إيقاف</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">لا يوجد مستخدمون</td></tr>'}
    </tbody></table></div></div>`;
  $('#inact')?.addEventListener('change', e => { ctx.cache.showInactive = e.target.checked; go('#/users'); });
  $('#addU').onclick = () => userForm(isPM);
  $('#bulkDocs').onclick = () => bulkDoctorAccounts(users);
  $$('[data-off]').forEach(b => b.onclick = async () => {
    if (!await confirmBox('إيقاف هذا المستخدم؟ لن يتمكن من الدخول.', 'إيقاف', true)) return;
    await store.put('users', b.dataset.off, { active: false }); toast('تم الإيقاف', 'ok'); go('#/users');
  });
  $$('[data-pw]').forEach(b => b.onclick = () => {
    const u = users.find(x => x.uid === b.dataset.pw);
    modal({
      title: `كلمة مرور جديدة — ${esc(u.name)}`,
      body: `<label class="f"><span>كلمة المرور الجديدة (6 أحرف على الأقل)</span><input class="i" id="np" value="${genPw()}"></label><p class="hint">سلّم كلمة المرور للمستخدم، ويقدر يغيرها من "حسابي".</p>`,
      footer: `<button class="btn" data-c>إلغاء</button><button class="btn primary" data-s>حفظ</button>`,
      onMount: (m, close) => {
        m.querySelector('[data-c]').onclick = close;
        m.querySelector('[data-s]').onclick = async () => {
          const p = m.querySelector('#np').value; if (p.length < 6) return toast('6 أحرف على الأقل', 'err');
          try { await store.resetPassword(u, p); toast('تم تغيير كلمة المرور', 'ok'); close(); go('#/users'); } catch (e) { toast(e.message, 'err'); }
        };
      },
    });
  });
});

const genPw = () => Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);

function userForm(isPM) {
  const roles = isPM ? Object.keys(ROLES) : ['doctor', 'committee'];
  const hosps = isPM ? Object.values(ctx.hospitals) : [ctx.hospitals[ctx.user.hospitalId]].filter(Boolean);
  modal({
    title: 'إضافة مستخدم', wide: false,
    body: `<form id="uf" class="grid g2">
      <label class="f"><span>الصلاحية</span><select class="i" name="role">${roles.map(r => `<option value="${r}">${ROLES[r]}</option>`).join('')}</select></label>
      <label class="f" id="hWrap"><span>المستشفى</span><select class="i" name="hospitalId">${hosps.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></label>
      <label class="f" id="dWrap" style="grid-column:1/-1"><span>الطبيب المرتبط</span><select class="i" name="doctorId"></select></label>
      <label class="f"><span>الاسم</span><input class="i" name="name" required></label>
      <label class="f"><span>الرقم القومي (اسم الدخول)</span><input class="i ltr" name="nationalId" maxlength="14" required style="text-align:right"></label>
      <label class="f"><span>كلمة المرور المبدئية</span><input class="i" name="password" value="${genPw()}" required></label>
    </form><div id="uErr"></div>`,
    footer: `<button class="btn" data-c>إلغاء</button><button class="btn primary" data-s>إنشاء الحساب</button>`,
    onMount: (m, close) => {
      const f = m.querySelector('#uf');
      const sync = () => {
        const role = f.role.value;
        m.querySelector('#hWrap').style.display = ['process_manager', 'branch_manager'].includes(role) ? 'none' : '';
        m.querySelector('#dWrap').style.display = role === 'doctor' ? '' : 'none';
        const docs = Object.values(ctx.doctors).filter(d => d.hospitalId === f.hospitalId.value).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        f.doctorId.innerHTML = docs.map(d => `<option value="${d.id}">${esc(d.name)} — ${esc(d.nationalId)}</option>`).join('');
        if (role === 'doctor') { const d = ctx.doctors[f.doctorId.value]; if (d) { f.name.value = d.name; f.nationalId.value = d.nationalId; } }
      };
      f.role.onchange = sync; f.hospitalId.onchange = sync; f.doctorId.onchange = () => { const d = ctx.doctors[f.doctorId.value]; if (d) { f.name.value = d.name; f.nationalId.value = d.nationalId; } };
      sync();
      m.querySelector('[data-c]').onclick = close;
      m.querySelector('[data-s]').onclick = async () => {
        const v = Object.fromEntries(new FormData(f));
        const err = (t) => { m.querySelector('#uErr').innerHTML = `<div class="alert err">${esc(t)}</div>`; };
        if (!v.name.trim()) return err('الاسم مطلوب');
        if (!isValidNid(v.nationalId)) return err('رقم قومي غير صحيح');
        if (v.password.length < 6) return err('كلمة المرور 6 أحرف على الأقل');
        const all = ['process_manager', 'branch_manager'].includes(v.role);
        if (v.role === 'doctor' && !v.doctorId) return err('اختر الطبيب');
        try {
          await store.createUser({ nationalId: v.nationalId.trim(), password: v.password, name: v.name.trim(), role: v.role, hospitalId: all ? null : v.hospitalId, doctorId: v.role === 'doctor' ? v.doctorId : null });
          close();
          modal({ title: 'تم إنشاء الحساب', body: `<p>سلّم بيانات الدخول للمستخدم:</p><div class="alert ok">الرابط: <b class="ltr">${esc(location.origin + location.pathname)}</b><br>الرقم القومي: <b class="num">${esc(v.nationalId)}</b><br>كلمة المرور: <b class="num">${esc(v.password)}</b></div>`, footer: '<button class="btn primary" data-x2>تم</button>', onMount: (mm, c2) => { mm.querySelector('[data-x2]').onclick = () => { c2(); go('#/users'); }; } });
        } catch (e) { err(e.message); }
      };
    },
  });
}

function bulkDoctorAccounts(users) {
  const has = new Set(users.filter(u => u.active !== false).map(u => u.nationalId));
  const hid = ctx.user.hospitalId;
  const docs = Object.values(ctx.doctors).filter(d => (!hid || d.hospitalId === hid) && !has.has(d.nationalId) && isValidNid(d.nationalId));
  modal({
    title: 'إنشاء حسابات الأطباء', wide: true,
    body: docs.length ? `<p>${docs.length} طبيب بدون حساب. سيتم إنشاء كلمة مرور عشوائية لكل طبيب، ونزّل ملف Excel بالبيانات لتسليمها.</p><div class="tbl-wrap" style="max-height:300px"><table class="t"><tbody>${docs.map(d => `<tr><td>${esc(d.name)}</td><td class="num">${esc(d.nationalId)}</td><td>${esc(hospName(d.hospitalId))}</td></tr>`).join('')}</tbody></table></div><div id="bProg"></div>` : '<div class="empty">كل الأطباء لديهم حسابات</div>',
    footer: docs.length ? `<button class="btn" data-c>إلغاء</button><button class="btn primary" data-s>إنشاء ${docs.length} حساب</button>` : '',
    onMount: (m, close) => {
      m.querySelector('[data-c]')?.addEventListener('click', close);
      m.querySelector('[data-s]')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        const out = [];
        for (const [i, d] of docs.entries()) {
          const pw = genPw();
          m.querySelector('#bProg').innerHTML = `<div class="alert info">جاري الإنشاء ${i + 1} / ${docs.length}…</div>`;
          try { await store.createUser({ nationalId: d.nationalId, password: pw, name: d.name, role: 'doctor', hospitalId: d.hospitalId, doctorId: d.id }); out.push({ 'المستشفى': hospName(d.hospitalId), 'الاسم': d.name, 'الرقم القومي': d.nationalId, 'كلمة المرور': pw }); }
          catch (ex) { out.push({ 'المستشفى': hospName(d.hospitalId), 'الاسم': d.name, 'الرقم القومي': d.nationalId, 'كلمة المرور': 'لم يُنشأ: ' + ex.message }); }
        }
        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(out); XLSX.utils.book_append_sheet(wb, ws, 'الحسابات'); wb.Workbook = { Views: [{ RTL: true }] };
        XLSX.writeFile(wb, 'حسابات-الأطباء.xlsx');
        toast('تم — احتفظ بملف الحسابات في مكان آمن', 'ok'); close(); go('#/users');
      });
    },
  });
}

// ============ الإعدادات ============
route('settings', async (view) => {
  const edit = can.manageSettings(ctx.user);
  setTitle(edit ? 'الإعدادات والمعادلات' : 'المعادلات المعتمدة', 'كل النسب والأسعار والمعايير المستخدمة في الحساب');
  const S = structuredClone(ctx.settings);
  const dis = edit ? '' : 'disabled';
  const inp = (path, val, w = '') => `<input class="i ltr" style="text-align:right;${w}" data-path="${path}" value="${esc(val)}" ${dis}>`;
  const row = (label, path, val, unit = '%') => `<label class="f"><span>${label}</span><div class="row" style="flex-wrap:nowrap">${inp(path, val)}<span class="hint">${unit}</span></div></label>`;
  view.innerHTML = `
  ${edit ? '<div class="alert info no-print">أي تعديل هنا يطبق على كل السجلات غير المعتمدة فوراً. السجلات المعتمدة محفوظة بأرقامها وقت الاعتماد.</div>' : ''}
  <div class="card"><h2>الهوية</h2><div class="grid g3">
    <label class="f"><span>اسم الجهة</span><input class="i" data-path="orgName" value="${esc(S.orgName)}" ${dis}></label>
    <label class="f"><span>الفرع</span><input class="i" data-path="branchName" value="${esc(S.branchName)}" ${dis}></label>
    <label class="f"><span>اسم النظام</span><input class="i" data-path="systemName" value="${esc(S.systemName)}" ${dis}></label>
  </div>${edit ? `<div class="row" style="margin-top:10px"><div style="width:56px" id="logoPrev">${emblem(S.logo)}</div><label class="btn sm">رفع الشعار الرسمي<input type="file" accept="image/*" id="logoIn" hidden></label><button class="btn sm" id="logoRm">الشعار الافتراضي</button></div>` : ''}</div>

  <div class="card"><h2>F1 — سعر الكشف حسب الدرجة العلمية</h2><div class="grid g4" id="prices">${S.degrees.map(d => row(d, 'clinicPrice.' + d, S.clinicPrice[d] ?? 0, 'جنيه')).join('')}</div>
    ${edit ? `<div class="row" style="margin-top:8px"><input class="i" id="newDeg" placeholder="درجة جديدة (مثال: أخصائي أول)" style="max-width:260px"><button class="btn sm" id="addDeg">${icons.plus} إضافة درجة</button></div>` : ''}</div>

  <div class="card"><h2>نسب التكلفة ونصيب الطبيب حسب تصنيف التخصص</h2>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>التصنيف</th><th>نسبة التكاليف المخصومة من الإجمالي</th><th>الصافي</th><th>نصيب الطبيب من صافي العيادة</th><th>= من الإجمالي</th></tr></thead><tbody>
    ${Object.entries(S.categories).map(([k, c]) => `<tr><td><b>${CATEGORY_LABELS[k]}</b></td><td>${inp(`categories.${k}.cost`, c.cost, 'max-width:110px')}</td><td>${100 - c.cost}%</td><td>${inp(`categories.${k}.docShare`, c.docShare, 'max-width:110px')}</td><td>${((100 - c.cost) * c.docShare / 100).toFixed(2)}%</td></tr>`).join('')}
    </tbody></table></div>
    <p class="hint">من الدليل: الجراحي 70% (55% مباشرة + 15% غير مباشرة)، غير الجراحي والتأهيلي 47% (32% + 15%) ونصيب الطبيب 42.5% من الإجمالي = 80% من الصافي، التشخيصي 60% (45% + 15%) ونصيب الطبيب 29.5% = 73.75% من الصافي. <b>نصيب الطبيب من صافي عيادة التخصص الجراحي غير منصوص عليه صراحة في الدليل — القيمة 80% افتراض قابل للتعديل.</b></p>
  </div>

  <div class="grid g2">
    <div class="card"><h2>F2–F4 نسبة الطبيب من الخدمات</h2><div class="grid g3">${row('المعمل', 'services.lab', S.services.lab)}${row('الأشعة', 'services.rad', S.services.rad)}${row('الصيدلية', 'services.pharm', S.services.pharm)}</div></div>
    <div class="card"><h2>F9 الغسيل الكلوي</h2><div class="grid g2">${row('سعر الجلسة', 'kidney.sessionPrice', S.kidney.sessionPrice, 'جنيه')}${row('نسبة الطبيب', 'kidney.doctorPct', S.kidney.doctorPct)}</div></div>
  </div>

  <div class="card"><h2>F5 / F6 / F8 — الأقسام</h2><div class="grid g3">
    ${[['inpatient', 'الداخلي'], ['icu', 'العناية'], ['er', 'الطوارئ']].map(([k, l]) => `<div><h3>${l}</h3>${row('الاستقطاعات الافتراضية (لو مفيش رقم)', `depts.${k}.defaultCost`, S.depts[k].defaultCost)}<br>${row('نصيب الأطباء من الصافي', `depts.${k}.doctorsPool`, S.depts[k].doctorsPool)}</div>`).join('')}
  </div><p class="hint">الصافي = الإجمالي − الاستقطاعات · نصيب الطبيب = صافي الأطباء × (شفتات الطبيب ÷ إجمالي شفتات القسم).</p></div>

  <div class="card"><h2>F7 — العمليات (نسبة الطبيب من إجمالي قيمة العملية)</h2><div class="grid g4">
    ${row('كبرى — جراح رئيسي', 'ops.majorMain', S.ops.majorMain)}${row('كبرى — جراح مساعد', 'ops.majorAssist', S.ops.majorAssist)}${row('كبرى — تخدير', 'ops.majorAnesth', S.ops.majorAnesth)}${row('كبرى — أطقم فنية', 'ops.majorTech', S.ops.majorTech)}
    ${row('صغرى/متوسطة — جراح رئيسي', 'ops.minorMain', S.ops.minorMain)}${row('صغرى/متوسطة — تخدير', 'ops.minorAnesth', S.ops.minorAnesth)}${row('صغرى/متوسطة — أطقم فنية', 'ops.minorTech', S.ops.minorTech)}${row('نسبة تكلفة العملية', 'ops.costPct', S.ops.costPct)}
    ${row('بسيطة — جراح رئيسي', 'ops.simpleMain', S.ops.simpleMain)}${row('بسيطة — أطقم فنية', 'ops.simpleTech', S.ops.simpleTech)}
  </div><p class="hint">كبرى: 15% = 50% من الصافي · مساعد 1.5% = 5% · تخدير 3% = 10% · أطقم 10.5% = 35%. صغرى بتخدير: 16.5% = 55%. بسيطة: 19.5% = 65%.</p></div>

  <div class="grid g2">
    <div class="card"><h2>ساعات العمل و FTE</h2><div class="grid g2">${row('ساعات شفت العيادة', 'hours.clinicShift', S.hours.clinicShift, 'ساعة')}${row('ساعات شفت الأقسام', 'hours.deptShift', S.hours.deptShift, 'ساعة')}${row('الساعات الشهرية (اللائحة)', 'hours.monthly', S.hours.monthly, 'ساعة')}${row('أقصى عدد شفتات', 'hours.maxShifts', S.hours.maxShifts, 'شفت')}</div></div>
    <div class="card"><h2>كارت DPC — المعايير (B.M)</h2><div class="grid g3">${row('OPD مريض/ساعة', 'dpc.opd', S.dpc.opd, '')}${row('IPD+ER حالة/ساعة', 'dpc.ipd', S.dpc.ipd, '')}${row('الطوارئ STR PR', 'dpc.er', S.dpc.er, '')}</div><p class="hint">OR: المعيار = عدد العمليات ÷ ساعات الجدول.</p></div>
  </div>

  <div class="grid g2">
    <div class="card"><h2>معدل الإنتاجية والتصنيف</h2>
      <label class="f"><span>الأساس</span><select class="i" data-path="entitlementBasis" ${dis}><option value="gross" ${S.entitlementBasis === 'gross' ? 'selected' : ''}>صافي الإنتاجية ÷ إجمالي الاستحقاق</option><option value="net" ${S.entitlementBasis === 'net' ? 'selected' : ''}>صافي الإنتاجية ÷ صافي الاستحقاق</option></select></label>
      <table class="t" style="margin-top:10px"><thead><tr><th>التصنيف</th><th>من (≥)</th><th>الإجراء</th></tr></thead><tbody>
      ${S.classes.map((c, i) => `<tr><td><span class="chip ${c.code}">${c.code}</span></td><td>${Number.isFinite(c.min) ? inp(`classes.${i}.min`, c.min, 'max-width:90px') : 'أقل من ذلك'}</td><td>${esc(c.ar)}<div class="hint">${esc(c.en)}</div></td></tr>`).join('')}
      </tbody></table></div>
    <div class="card"><h2>مؤشر القيمة</h2><div class="grid g3">${row('وزن إعادة الدخول', 'value.wReadmission', S.value.wReadmission, '')}${row('وزن المضاعفات', 'value.wComplication', S.value.wComplication, '')}${row('وزن SSI', 'value.wSsi', S.value.wSsi, '')}</div>
      <p class="hint">مؤشر القيمة = 100 − [(نسبة إعادة الدخول × 0.4) + (نسبة المضاعفات × 0.4) + (نسبة عدوى موضع الجراحة × 0.2)] · ≥90 ممتاز · 80–89 جيد جداً · 70–79 مقبول · أقل من 70 يحتاج تحسين.</p></div>
  </div>

  <div class="card"><h2>جدول تصنيف التخصصات (${S.specialties.length})</h2>
    <div class="tbl-wrap" style="max-height:420px"><table class="t"><thead><tr><th>التخصص</th><th>التصنيف</th>${edit ? '<th></th>' : ''}</tr></thead><tbody id="specTb">
    ${S.specialties.map((s, i) => `<tr><td>${esc(s.name)}</td><td><select class="i" data-spec="${i}" ${dis} style="max-width:180px">${Object.entries(CATEGORY_LABELS).map(([k, l]) => `<option value="${k}" ${k === s.cat ? 'selected' : ''}>${l}</option>`).join('')}</select></td>${edit ? `<td><button class="btn sm danger" data-rmspec="${i}">✕</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>
    ${edit ? `<div class="row" style="margin-top:8px"><input class="i" id="newSpec" placeholder="تخصص جديد" style="max-width:260px"><select class="i" id="newSpecCat" style="max-width:160px">${Object.entries(CATEGORY_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn sm" id="addSpec">${icons.plus} إضافة</button></div>` : ''}
  </div>

  <div class="card"><h2>أنواع التوظيف</h2><textarea class="i" id="empTypes" rows="3" ${dis}>${esc(S.employmentTypes.join('\n'))}</textarea><p class="hint">نوع في كل سطر.</p></div>

  ${edit ? `<div class="row end" style="position:sticky;bottom:0;background:var(--bg);padding:12px 0"><button class="btn" id="resetS">استرجاع قيم الدليل الافتراضية</button><button class="btn primary" id="saveS">حفظ الإعدادات</button></div>` : ''}`;

  if (!edit) return;
  const setPath = (obj, path, val) => { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks.at(-1)] = val; };
  $('#logoIn').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; S.logo = await resizeImage(f, 240); $('#logoPrev').innerHTML = emblem(S.logo); };
  $('#logoRm').onclick = () => { S.logo = ''; $('#logoPrev').innerHTML = emblem(''); };
  $('#addDeg').onclick = () => { const d = $('#newDeg').value.trim(); if (!d || S.degrees.includes(d)) return; collect(); S.degrees.push(d); S.clinicPrice[d] = 0; ctx.settings = S; go('#/settings'); };
  $('#addSpec').onclick = () => { const n = $('#newSpec').value.trim(); if (!n || S.specialties.some(s => s.name === n)) return toast('التخصص موجود أو فارغ', 'err'); collect(); S.specialties.push({ name: n, cat: $('#newSpecCat').value }); ctx.settings = S; go('#/settings'); };
  $$('[data-rmspec]').forEach(b => b.onclick = () => { collect(); S.specialties.splice(+b.dataset.rmspec, 1); ctx.settings = S; go('#/settings'); });
  const collect = () => {
    let bad = false;
    $$('[data-path]').forEach(i => {
      const p = i.dataset.path;
      if (['orgName', 'branchName', 'systemName', 'entitlementBasis'].includes(p)) return setPath(S, p, i.value);
      const v = Number(i.value);
      if (!Number.isFinite(v) || v < 0) { i.classList.add('err'); bad = true; return; }
      i.classList.remove('err'); setPath(S, p, v);
    });
    $$('[data-spec]').forEach(s => { S.specialties[+s.dataset.spec].cat = s.value; });
    S.employmentTypes = $('#empTypes').value.split('\n').map(x => x.trim()).filter(Boolean);
    return !bad;
  };
  $('#saveS').onclick = async () => {
    if (!collect()) return toast('في قيم غير صحيحة (معلّمة بالأحمر)', 'err');
    await store.saveSettings(S); ctx.settings = await store.getSettings(); toast('تم حفظ الإعدادات', 'ok'); go('#/settings');
  };
  $('#resetS').onclick = async () => {
    if (!await confirmBox('استرجاع كل النسب والأسعار لقيم الدليل الافتراضية؟ (الهوية والشعار لن تتغير)', 'استرجاع', true)) return;
    const d = structuredClone(DEFAULT_SETTINGS); d.orgName = S.orgName; d.branchName = S.branchName; d.systemName = S.systemName; d.logo = S.logo;
    await store.saveSettings(d); ctx.settings = await store.getSettings(); go('#/settings');
  };
});

// ============ حسابي ============
route('account', async (view) => {
  setTitle('حسابي');
  view.innerHTML = `<div class="card" style="max-width:520px"><h2>${esc(ctx.user.name)}</h2><p class="hint">${esc(ROLES[ctx.user.role])} — الرقم القومي <span class="num">${esc(ctx.user.nationalId)}</span></p>
    <h3>تغيير كلمة المرور</h3><form id="pf" class="grid">
    <label class="f"><span>كلمة المرور الحالية</span><input class="i" type="password" name="o" required></label>
    <label class="f"><span>كلمة المرور الجديدة</span><input class="i" type="password" name="n" minlength="6" required></label>
    <label class="f"><span>تأكيد الجديدة</span><input class="i" type="password" name="n2" minlength="6" required></label>
    <button class="btn primary">حفظ</button></form></div>`;
  $('#pf').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    if (f.get('n') !== f.get('n2')) return toast('كلمتا المرور غير متطابقتين', 'err');
    try { await store.changePassword(f.get('o'), f.get('n')); toast('تم تغيير كلمة المرور', 'ok'); e.target.reset(); } catch (ex) { toast(ex.message, 'err'); }
  };
});

void loadDoctors;
