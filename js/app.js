import { store, ROLES, can, isValidNid } from './store.js';
import { esc, $, $$, icons, emblem } from './ui.js';
import { DEMO_LOGINS } from './demo.js';
import { ctx, render, hospName } from './core.js';
import './views/dashboard.js';
import './views/doctors.js';
import './views/profile.js';
import './views/cards.js';
import './views/data.js';
import './views/admin.js';
import './views/insights.js';

function navItems(u) {
  const items = [];
  if (u.role === 'doctor') {
    items.push(['#/doctor/' + u.doctorId, 'ملفي وإنتاجيتي', icons.doc]);
    items.push(['#/account', 'حسابي', icons.key]);
    return items;
  }
  items.push(['#/dashboard', 'لوحة التحكم', icons.dash]);
  items.push(['#/assistant', 'المساعد الذكي', icons.bot]);
  items.push(['#/doctors', 'الأطباء', icons.doc]);
  items.push(['#/review', 'البيانات الشهرية والاعتماد', icons.check]);
  if (can.editData(u)) items.push(['#/upload', 'رفع البيانات', icons.upload]);
  items.push(['#/analysis', 'تحليل الإنتاجية والتكلفة', icons.chart]);
  items.push(['sep', 'الإدارة']);
  if (can.manageUsers(u)) items.push(['#/users', 'إدارة المستخدمين', icons.users]);
  if (can.manageHospitals(u)) items.push(['#/hospitals', 'المستشفيات', icons.hosp]);
  items.push(['#/settings', can.manageSettings(u) ? 'الإعدادات والمعادلات' : 'المعادلات المعتمدة', icons.gear]);
  items.push(['#/guide', 'دليل المنهجية', icons.file]);
  items.push(['#/account', 'حسابي', icons.key]);
  return items;
}

function layout() {
  const u = ctx.user, S = ctx.settings;
  document.getElementById('root').innerHTML = `
  ${store.mode === 'demo' ? '<div class="demo-banner no-print">وضع التجربة — بيانات وهمية محفوظة في هذا المتصفح فقط. <button class="btn sm" id="resetDemo">إعادة ضبط بيانات التجربة</button></div>' : ''}
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand">${emblem(S.logo)}<div><b>${esc(S.systemName)}</b><small>${esc(S.orgName)} — ${esc(S.branchName)}</small></div></div>
      <nav class="nav">${navItems(u).map(([h, l, ic]) => h === 'sep' ? `<div class="sep">${l}</div>` : `<a href="${h}" data-nav="${h}">${ic}<span>${l}</span></a>`).join('')}</nav>
      <div class="side-foot"><div class="who"><b>${esc(u.name || '')}</b><span>${esc(ROLES[u.role] || '')}${u.hospitalId ? ' — ' + esc(hospName(u.hospitalId)) : ''}</span></div>
      <button class="btn sm danger" id="logout">${icons.out} تسجيل الخروج</button></div>
    </aside>
    <div class="main">
      <div class="topbar"><button class="btn sm menu-btn" id="menuBtn">${icons.menu}</button><h1 id="pageTitle"></h1><div class="row" id="topTools"></div></div>
      <div class="content" id="view"></div>
    </div>
  </div>`;
  $('#logout').onclick = () => store.logout();
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#resetDemo')?.addEventListener('click', () => store.resetDemo());
}

// ============ تسجيل الدخول ============
function loginScreen(bootstrap = false) {
  const S = ctx.settings;
  document.getElementById('root').innerHTML = `
  <div class="login-wrap">
    <div class="login-side">
      <div style="width:84px">${emblem(S.logo)}</div>
      <div style="color:var(--navy);font-weight:700">${esc(S.orgName)} — ${esc(S.branchName)}</div>
      <h1>${esc(S.systemName)}</h1>
      <p>متابعة وقياس إنتاجية الأطباء بالمؤشرات المالية والتشغيلية والسريرية، وكارت إنتاجية الطبيب (DPC) والتقارير الشهرية الرسمية.</p>
      <svg class="wave" viewBox="0 0 600 200" preserveAspectRatio="none"><polyline fill="none" stroke="#5cc7d6" stroke-width="3" points="0,150 60,60 120,110 180,40 240,120 300,70 360,140 420,50 480,120 540,90 600,130"/><polyline fill="none" stroke="#0d2b4e" stroke-opacity=".35" stroke-width="2" points="0,170 70,120 140,150 210,90 280,160 350,110 420,170 490,100 560,150 600,120"/></svg>
    </div>
    <div class="login-form"><form class="login-box" id="loginForm" autocomplete="on">
      <div style="width:64px;margin:0 auto">${emblem(S.logo)}</div>
      <h2>${bootstrap ? 'إعداد أول مسؤول للنظام' : 'Performance Management System'}</h2>
      <div class="sub">${bootstrap ? 'لم يتم إعداد النظام بعد — أنشئ حساب الـ Process Manager' : 'نظام تقييم أداء الأطباء'}</div>
      ${bootstrap ? `<label class="f"><span>الاسم</span><input class="i" name="name" required></label>` : ''}
      <label class="f"><span>الرقم القومي</span><input class="i ltr" name="nid" inputmode="numeric" maxlength="14" placeholder="أدخل الرقم القومي" required style="text-align:right"></label>
      <label class="f"><span>كلمة المرور</span><input class="i" name="pw" type="password" placeholder="أدخل كلمة المرور" required minlength="6"></label>
      ${bootstrap ? `<label class="f"><span>تأكيد كلمة المرور</span><input class="i" name="pw2" type="password" required minlength="6"></label>` : ''}
      <div id="loginErr"></div>
      <button class="btn primary" type="submit">${bootstrap ? 'إنشاء الحساب' : 'تسجيل الدخول'}</button>
      <p class="hint" style="text-align:center;margin-top:14px">للحصول على حساب جديد يرجى التواصل مع الإدارة</p>
      ${store.mode === 'demo' && !bootstrap ? `<div class="demo-logins">دخول سريع للتجربة (كلمة المرور 123456):<br>${[...DEMO_LOGINS, ['طبيب', store.db.users.u_d1?.nationalId]].map(([l, n]) => `<button type="button" class="btn sm" data-nid="${n}">${l}</button>`).join('')}</div>` : ''}
    </form></div>
  </div>`;
  $$('[data-nid]').forEach(b => b.onclick = () => { $('[name=nid]').value = b.dataset.nid; $('[name=pw]').value = '123456'; $('#loginForm').requestSubmit(); });
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nid = String(f.get('nid')).trim();
    const err = (m) => { $('#loginErr').innerHTML = `<div class="alert err">${esc(m)}</div>`; };
    if (!isValidNid(nid)) return err('الرقم القومي يجب أن يكون 14 رقماً ويبدأ بـ 2 أو 3');
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (bootstrap) {
        if (f.get('pw') !== f.get('pw2')) throw new Error('كلمتا المرور غير متطابقتين');
        await store.bootstrap({ nationalId: nid, password: f.get('pw'), name: String(f.get('name')).trim() });
      } else await store.login(nid, f.get('pw'));
    } catch (ex) { err(ex.message); btn.disabled = false; }
  };
}

// ============ الإقلاع ============
async function boot() {
  const root = document.getElementById('root');
  try { await store.init(); }
  catch (e) { root.innerHTML = `<div class="content"><div class="alert err">تعذر الاتصال بالخادم: ${esc(e.message)}</div></div>`; return; }
  store.onAuth(async (user) => {
    ctx.cache = {}; ctx.doctors = {};
    if (!user) {
      ctx.user = null;
      try { ctx.settings = await store.getSettings(); } catch { ctx.settings = (await import('./defaults.js')).DEFAULT_SETTINGS; }
      const boot = await store.needsBootstrap();
      loginScreen(boot);
      return;
    }
    if (user.missingProfile || !user.role) {
      root.innerHTML = `<div class="content"><div class="alert err">هذا الحساب غير مرتبط بصلاحية في النظام. تواصل مع الإدارة.</div><button class="btn" id="lo">تسجيل الخروج</button></div>`;
      $('#lo').onclick = () => store.logout();
      return;
    }
    ctx.user = user;
    try {
      ctx.settings = await store.getSettings();
      const hs = await store.list('hospitals');
      ctx.hospitals = Object.fromEntries(hs.map(h => [h.id, h]));
    } catch (e) { console.error(e); }
    document.title = `${ctx.settings.systemName} — ${ctx.settings.branchName}`;
    layout();
    render();
  });
}

window.addEventListener('hashchange', render);

boot();
