// أدوات الواجهة
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const money = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '-' : (v ? `${nf0.format(v)} جنيه` : '-');
export const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v)) ? '-' : (d === 0 ? nf0 : nf2).format(v);
export const pctf = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '-' : `${Math.round(v * 100)}%`;
export const pct100 = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '-' : `${nf2.format(v)}%`;
export const dash = (v, f = num) => (v ? f(v) : '-');

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (m) => { if (!m) return '—'; const [y, mm] = m.split('-'); return `${MONTHS_AR[+mm - 1]} ${y}`; };
export const monthLabelEn = (m) => { if (!m) return '—'; const [y, mm] = m.split('-'); return `${MONTHS_EN[+mm - 1]} ${y}`; };
export const currentMonth = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
export const lastMonths = (count = 18) => { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < count; i++) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1); } return out; };

export const initials = (name) => { const p = String(name || '').replace(/^د[\.\/]\s*/, '').trim().split(/\s+/); return (p[0]?.[0] || '') + (p[1]?.[0] || ''); };
export const avatar = (d, cls = '') => `<div class="avatar ${cls}">${d?.photo ? `<img src="${esc(d.photo)}" alt="">` : esc(initials(d?.name))}</div>`;

export const STATUS = { draft: 'مسودة', submitted: 'بانتظار الاعتماد', approved: 'معتمد' };
export const statusChip = (s) => `<span class="chip ${s || 'draft'}">${STATUS[s] || 'لا توجد بيانات'}</span>`;
export const classChip = (c) => c ? `<span class="chip ${c}">${c}</span>` : '<span class="chip">—</span>';

export function toast(msg, type = '') {
  let box = document.getElementById('toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3200);
}

export function modal({ title, body, footer = '', wide = false, onMount }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog"><header><h3>${title}</h3><button class="btn ghost sm" data-x>✕</button></header><div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  bg.querySelector('[data-x]').onclick = close;
  document.body.appendChild(bg);
  onMount?.(bg.querySelector('.modal'), close);
  return close;
}

export function confirmBox(text, okLabel = 'تأكيد', danger = false) {
  return new Promise(res => {
    const close = modal({
      title: 'تأكيد', body: `<p style="margin:0">${text}</p>`,
      footer: `<button class="btn" data-no>إلغاء</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okLabel}</button>`,
      onMount: (m, c) => { m.querySelector('[data-no]').onclick = () => { c(); res(false); }; m.querySelector('[data-ok]').onclick = () => { c(); res(true); }; },
    });
    void close;
  });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function resizeImage(file, max = 360) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.82);
}

// شعار عام (درع) — يمكن استبداله بشعار الهيئة الرسمي من الإعدادات
export const emblem = (logo) => logo ? `<img src="${esc(logo)}" alt="">` : `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cc7d6"/><stop offset="1" stop-color="#17a2a0"/></linearGradient></defs><circle cx="32" cy="32" r="30" fill="#fff" stroke="#9fb3c8" stroke-width="2"/><path d="M32 12l15 6v11c0 10-6.5 17.5-15 21-8.5-3.5-15-11-15-21V18z" fill="url(#eg)"/><path d="M32 22c-4 3-6 6.5-6 10.5 0 3.5 2.6 6.5 6 6.5s6-3 6-6.5C38 28.5 36 25 32 22z" fill="#fff"/><circle cx="32" cy="18" r="3" fill="#93d3a2"/></svg>`;

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  dash: I('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'),
  bot: I('<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4M8 14h.01M16 14h.01"/>'),
  users: I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  doc: I('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  hosp: I('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M10 9h4M12 7v4"/>'),
  upload: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  check: I('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  key: I('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 7.5l3 3L22 7l-3-3"/>'),
  out: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  money: I('<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  clock: I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  heart: I('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>'),
  chart: I('<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/>'),
  file: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  card: I('<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="11" r="2.5"/><path d="M14 9h5M14 13h5M5 17h6"/>'),
  print: I('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  edit: I('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  down: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  menu: I('<path d="M3 6h18M3 12h18M3 18h18"/>'),
  back: I('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  alert: I('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>'),
  search: I('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'),
};
