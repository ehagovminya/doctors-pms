import { store, can } from './store.js';
import { compute } from './engine.js';
import { esc, $, $$, monthLabel, lastMonths } from './ui.js';

// ============ الحالة المشتركة ============
export const ctx = {
  store, user: null, settings: null, hospitals: {}, doctors: {},
  month: sessionStorage.getItem('pms_month') || null,
  hospitalId: sessionStorage.getItem('pms_hosp') || '',
  cache: {},
};

export const scope = () => {
  const u = ctx.user;
  if (can.seeAllHospitals(u)) return ctx.hospitalId ? [['hospitalId', '==', ctx.hospitalId]] : [];
  if (u.role === 'doctor') return [['doctorId', '==', u.doctorId]];
  return [['hospitalId', '==', u.hospitalId]];
};
export const hospScope = () => {
  const u = ctx.user;
  if (can.seeAllHospitals(u)) return ctx.hospitalId ? [['hospitalId', '==', ctx.hospitalId]] : [];
  return [['hospitalId', '==', u.hospitalId]];
};
export const hospName = (id) => ctx.hospitals[id]?.name || '—';

export async function loadDoctors(force = false) {
  if (!force && ctx.cache.doctorsLoaded) return ctx.doctors;
  const u = ctx.user;
  let list;
  if (u.role === 'doctor') { const d = await store.get('doctors', u.doctorId); list = d ? [d] : []; }
  else if (can.seeAllHospitals(u)) list = await store.list('doctors');
  else list = await store.list('doctors', [['hospitalId', '==', u.hospitalId]]);
  ctx.doctors = Object.fromEntries(list.map(d => [d.id, d]));
  ctx.cache.doctorsLoaded = true;
  return ctx.doctors;
}

// السجلات: للطبيب المعتمد فقط
export async function loadRecords(filters = []) {
  const u = ctx.user;
  if (u.role === 'doctor') return store.list('records', [['doctorId', '==', u.doctorId], ['status', '==', 'approved'], ...filters]);
  if (can.seeAllHospitals(u)) return store.list('records', filters);
  return store.list('records', [['hospitalId', '==', u.hospitalId], ...filters]);
}
export async function loadDepts(filters = []) {
  const u = ctx.user;
  if (u.role === 'doctor') return [];
  if (can.seeAllHospitals(u)) return store.list('depts', filters);
  return store.list('depts', [['hospitalId', '==', u.hospitalId], ...filters]);
}

// النتيجة: المعتمد يُعرض من النسخة المجمدة وقت الاعتماد
export function resultFor(doctor, rec, depts) {
  if (!rec) return null;
  if (rec.status === 'approved' && rec.computed) return rec.computed;
  const ds = (depts || []).filter(d => d.hospitalId === rec.hospitalId && d.month === rec.month);
  return compute(doctor, rec.data || {}, ds, ctx.settings);
}

export async function availableMonths() {
  if (ctx.cache.months) return ctx.cache.months;
  const recs = await loadRecords();
  ctx.cache.months = [...new Set(recs.map(r => r.month))].sort().reverse();
  return ctx.cache.months;
}
export const invalidate = () => { ctx.cache.months = null; };

// رسوم Chart.js
const charts = new Map();
export function chart(canvas, config) {
  if (!canvas || !window.Chart) return;
  charts.get(canvas.id)?.destroy();
  Chart.defaults.font.family = 'Cairo, sans-serif';
  Chart.defaults.color = '#4a5b72';
  Chart.defaults.animation = false;
  const c = new Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, ...(config.options || {}) } });
  charts.set(canvas.id, c);
  return c;
}

// تحميل بيانات شهر مع النتائج
export async function monthData(month = ctx.month) {
  await loadDoctors();
  const [recs, depts] = await Promise.all([
    loadRecords([['month', '==', month]]),
    loadDepts([['month', '==', month]]),
  ]);
  const hid = can.seeAllHospitals(ctx.user) ? ctx.hospitalId : null;
  const rows = recs.filter(r => !hid || r.hospitalId === hid).map(r => {
    const doctor = ctx.doctors[r.doctorId];
    if (!doctor) return null;
    return { rec: r, doctor, res: resultFor(doctor, r, depts) };
  }).filter(Boolean);
  return { rows, depts: depts.filter(d => !hid || d.hospitalId === hid) };
}

// ============ التوجيه ============
const routes = {};
export const route = (name, fn) => { routes[name] = fn; };
export const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

export function setTitle(title, sub = '') { $('#pageTitle').innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; }

// أدوات أعلى الصفحة: اختيار الشهر والمستشفى
export async function topFilters({ month = true, hospital = true, onChange } = {}) {
  const tools = $('#topTools');
  const months = [...new Set([...(await availableMonths()), ...lastMonths(14)])].sort().reverse();
  if (!ctx.month) ctx.month = (await availableMonths())[0] || months[1];
  let html = '';
  if (hospital && can.seeAllHospitals(ctx.user)) {
    html += `<select class="i" id="fHosp" style="width:auto"><option value="">كل المستشفيات</option>${Object.values(ctx.hospitals).map(h => `<option value="${h.id}" ${h.id === ctx.hospitalId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`;
  }
  if (month) html += `<select class="i" id="fMonth" style="width:auto">${months.map(m => `<option value="${m}" ${m === ctx.month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>`;
  tools.innerHTML = html;
  $('#fHosp')?.addEventListener('change', e => { ctx.hospitalId = e.target.value; sessionStorage.setItem('pms_hosp', ctx.hospitalId); onChange ? onChange() : render(); });
  $('#fMonth')?.addEventListener('change', e => { ctx.month = e.target.value; sessionStorage.setItem('pms_month', ctx.month); onChange ? onChange() : render(); });
}

export async function render() {
  if (!ctx.user) return;
  const hash = location.hash || '';
  const [, name, ...args] = hash.split('/');
  $$('.nav a').forEach(a => a.classList.toggle('active', hash.startsWith(a.dataset.nav) || (a.dataset.nav === '#/doctors' && hash.startsWith('#/doctor/'))));
  $('#sidebar')?.classList.remove('open');
  $('#topTools').innerHTML = '';
  const view = $('#view');
  view.innerHTML = '<div class="empty">جاري التحميل…</div>';
  let fn = routes[name];
  if (ctx.user.role === 'doctor' && !['doctor', 'card', 'report', 'account'].includes(name)) { location.hash = '#/doctor/' + ctx.user.doctorId; return; }
  if (!fn) { location.hash = ctx.user.role === 'doctor' ? '#/doctor/' + ctx.user.doctorId : '#/dashboard'; return; }
  try { await fn(view, ...args.map(a => decodeURIComponent(a))); }
  catch (e) {
    console.error(e);
    view.innerHTML = `<div class="alert err">حدث خطأ أثناء تحميل الصفحة: ${esc(e.message || e)}</div>`;
  }
}

