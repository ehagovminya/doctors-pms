// طبقة البيانات — Firebase (الإنتاج) أو المتصفح (وضع التجربة)
import { firebaseConfig, LOGIN_DOMAIN, DEMO } from './config.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { buildDemoData } from './demo.js';

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';

export const ROLES = {
  process_manager: 'Process Manager (مسؤول النظام)',
  branch_manager: 'مدير الفرع',
  coordinator: 'منسق الإنتاجية بالمستشفى',
  committee: 'عضو لجنة الإنتاجية',
  doctor: 'طبيب',
};

export const can = {
  manageSettings: (u) => u?.role === 'process_manager',
  manageUsers: (u) => u?.role === 'process_manager' || u?.role === 'coordinator',
  manageHospitals: (u) => u?.role === 'process_manager',
  approve: (u) => u?.role === 'process_manager' || u?.role === 'branch_manager',
  editData: (u) => u?.role === 'process_manager' || u?.role === 'coordinator',
  seeAllHospitals: (u) => ['process_manager', 'branch_manager'].includes(u?.role),
  isDoctor: (u) => u?.role === 'doctor',
};

export const nidToEmail = (nid, v = 0) => `${String(nid).trim()}${v ? '.v' + v : ''}@${LOGIN_DOMAIN}`;
export async function nidHash(nid) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pms-minya:' + String(nid).trim()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const isValidNid = (nid) => /^[23]\d{13}$/.test(String(nid).trim());

const mergeSettings = (s) => {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!s) return out;
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...v };
    else if (v !== undefined) out[k] = v;
  }
  // Infinity لا تُحفظ في Firestore
  out.classes = out.classes.map(c => ({ ...c, min: c.min === null || c.min === undefined || c.min <= -1e9 ? -Infinity : Number(c.min) }));
  out.value.bands = out.value.bands.map(b => ({ ...b, min: b.min === null || b.min === undefined || b.min <= -1e9 ? -Infinity : Number(b.min) }));
  return out;
};
const serializeSettings = (s) => {
  const c = structuredClone(s);
  c.classes = c.classes.map(x => ({ ...x, min: Number.isFinite(x.min) ? x.min : -1e12 }));
  c.value.bands = c.value.bands.map(x => ({ ...x, min: Number.isFinite(x.min) ? x.min : -1e12 }));
  return c;
};

const matches = (doc, filters) => filters.every(([f, op, v]) => {
  const x = doc[f];
  if (op === '==') return x === v;
  if (op === 'in') return v.includes(x);
  if (op === '>=') return x >= v;
  if (op === '<=') return x <= v;
  return true;
});

// ======================= وضع التجربة =======================
class LocalStore {
  constructor() {
    this.mode = 'demo';
    this.key = 'pms_demo_v1';
    this.listeners = [];
    const raw = localStorage.getItem(this.key);
    this.db = raw ? JSON.parse(raw) : buildDemoData();
    this.save();
    const sess = sessionStorage.getItem('pms_demo_session');
    this.user = sess ? this.db.users[sess] || null : null;
  }
  save() { localStorage.setItem(this.key, JSON.stringify(this.db)); }
  async init() {}
  onAuth(cb) { this.listeners.push(cb); cb(this.user); }
  emit() { this.listeners.forEach(cb => cb(this.user)); }
  async needsBootstrap() { return false; }
  async login(nid, password) {
    const u = Object.values(this.db.users).find(x => x.nationalId === String(nid).trim());
    if (!u || u.password !== password) throw new Error('الرقم القومي أو كلمة المرور غير صحيحة');
    if (u.active === false) throw new Error('هذا الحساب موقوف');
    this.user = u; sessionStorage.setItem('pms_demo_session', u.uid); this.emit();
  }
  async logout() { this.user = null; sessionStorage.removeItem('pms_demo_session'); this.emit(); }
  async changePassword(oldP, newP) {
    if (this.user.password !== oldP) throw new Error('كلمة المرور الحالية غير صحيحة');
    this.db.users[this.user.uid].password = newP; this.save();
  }
  async getSettings() { return mergeSettings(this.db.settings); }
  async saveSettings(s) { this.db.settings = serializeSettings(s); this.save(); }
  async list(col, filters = []) { return Object.values(this.db[col] || {}).filter(d => matches(d, filters)).map(d => structuredClone(d)); }
  async get(col, id) { const d = (this.db[col] || {})[id]; return d ? structuredClone(d) : null; }
  async put(col, id, data) { this.db[col] = this.db[col] || {}; this.db[col][id] = { ...(this.db[col][id] || {}), ...structuredClone(data), id }; this.save(); return id; }
  async putMany(col, items) { for (const it of items) await this.put(col, it.id, it); }
  async remove(col, id) { delete (this.db[col] || {})[id]; this.save(); }
  async createUser({ nationalId, password, ...rest }) {
    if (Object.values(this.db.users).some(u => u.nationalId === nationalId)) throw new Error('يوجد مستخدم بنفس الرقم القومي');
    const uid = 'u' + Date.now() + Math.random().toString(36).slice(2, 6);
    this.db.users[uid] = { uid, id: uid, nationalId, password, active: true, ...rest }; this.save(); return uid;
  }
  async resetPassword(user, newPassword) { this.db.users[user.uid].password = newPassword; this.save(); }
  async resetDemo() { localStorage.removeItem(this.key); location.reload(); }
}

// ======================= Firebase =======================
class FirebaseStore {
  constructor() { this.mode = 'firebase'; this.user = null; this.listeners = []; this.ready = false; }
  async init() {
    const [appM, authM, fsM] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    this.m = { ...appM, ...authM, ...fsM };
    this.app = appM.initializeApp(firebaseConfig);
    this.auth = authM.getAuth(this.app);
    await authM.setPersistence(this.auth, authM.browserSessionPersistence);
    this.fs = fsM.getFirestore(this.app);
    authM.onAuthStateChanged(this.auth, async (fbUser) => {
      if (!fbUser) { this.user = null; }
      else {
        const snap = await fsM.getDoc(fsM.doc(this.fs, 'users', fbUser.uid)).catch(() => null);
        this.user = snap && snap.exists() ? { uid: fbUser.uid, ...snap.data() } : { uid: fbUser.uid, role: null, missingProfile: true };
        if (this.user.active === false) { await authM.signOut(this.auth); this.user = null; }
      }
      this.ready = true;
      this.listeners.forEach(cb => cb(this.user));
    });
  }
  onAuth(cb) { this.listeners.push(cb); if (this.ready) cb(this.user); }
  async needsBootstrap() {
    const { doc, getDoc } = this.m;
    try { const s = await getDoc(doc(this.fs, 'meta', 'bootstrap')); return !s.exists(); } catch { return false; }
  }
  async bootstrap({ nationalId, password, name }) {
    const { createUserWithEmailAndPassword, writeBatch, doc, serverTimestamp } = this.m;
    const cred = await createUserWithEmailAndPassword(this.auth, nidToEmail(nationalId), password);
    const b = writeBatch(this.fs);
    b.set(doc(this.fs, 'users', cred.user.uid), { uid: cred.user.uid, nationalId, name, role: 'process_manager', hospitalId: null, doctorId: null, active: true, createdAt: serverTimestamp() });
    b.set(doc(this.fs, 'meta', 'bootstrap'), { by: cred.user.uid, at: serverTimestamp() });
    await b.commit();
    location.reload();
  }
  async loginVersion(nid) {
    const { doc, getDoc } = this.m;
    try { const s = await getDoc(doc(this.fs, 'logins', await nidHash(nid))); return s.exists() ? (s.data().v || 0) : 0; } catch { return 0; }
  }
  async login(nid, password) {
    try { await this.m.signInWithEmailAndPassword(this.auth, nidToEmail(nid, await this.loginVersion(nid)), password); }
    catch (e) {
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(e.code)) throw new Error('الرقم القومي أو كلمة المرور غير صحيحة');
      if (e.code === 'auth/too-many-requests') throw new Error('محاولات كثيرة — حاول مرة أخرى بعد قليل');
      throw new Error('تعذر تسجيل الدخول: ' + (e.code || e.message));
    }
  }
  async logout() { await this.m.signOut(this.auth); }
  async changePassword(oldP, newP) {
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = this.m;
    const u = this.auth.currentUser;
    try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, oldP)); }
    catch { throw new Error('كلمة المرور الحالية غير صحيحة'); }
    await updatePassword(u, newP);
  }
  async getSettings() {
    const { doc, getDoc } = this.m;
    const s = await getDoc(doc(this.fs, 'settings', 'main'));
    return mergeSettings(s.exists() ? s.data() : null);
  }
  async saveSettings(s) { const { doc, setDoc } = this.m; await setDoc(doc(this.fs, 'settings', 'main'), serializeSettings(s)); }
  async list(col, filters = []) {
    const { collection, query, where, getDocs } = this.m;
    const q = query(collection(this.fs, col), ...filters.map(([f, op, v]) => where(f, op, v)));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async get(col, id) { const { doc, getDoc } = this.m; const s = await getDoc(doc(this.fs, col, id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
  async put(col, id, data) { const { doc, setDoc } = this.m; const clean = JSON.parse(JSON.stringify({ ...data, id })); await setDoc(doc(this.fs, col, id), clean, { merge: true }); return id; }
  async putMany(col, items) {
    const { writeBatch, doc } = this.m;
    for (let i = 0; i < items.length; i += 400) {
      const b = writeBatch(this.fs);
      for (const it of items.slice(i, i + 400)) b.set(doc(this.fs, col, it.id), JSON.parse(JSON.stringify(it)), { merge: true });
      await b.commit();
    }
  }
  async remove(col, id) { const { doc, deleteDoc } = this.m; await deleteDoc(doc(this.fs, col, id)); }
  async resetPassword(user, newPassword) {
    // Firebase المجاني لا يسمح بتغيير كلمة مرور مستخدم آخر — فننشئ دخول جديد بإصدار جديد ونوقف القديم
    const v = (user.loginVersion || 0) + 1;
    const { uid: oldUid, id, password, ...profile } = user;
    await this.createUser({ ...profile, password: newPassword, loginVersion: v });
    await this.put('users', oldUid, { active: false, replacedBy: 'v' + v });
  }
  async createUser({ nationalId, password, ...rest }) {
    // تطبيق ثانوي علشان إنشاء الحساب ما يسجلش خروج المسؤول
    const { initializeApp, getAuth, createUserWithEmailAndPassword, signOut, deleteApp } = this.m;
    const sec = initializeApp(firebaseConfig, 'sec' + Date.now());
    const secAuth = getAuth(sec);
    try {
      const v = rest.loginVersion || 0;
      const cred = await createUserWithEmailAndPassword(secAuth, nidToEmail(nationalId, v), password);
      const uid = cred.user.uid;
      await this.put('users', uid, { uid, nationalId, active: true, loginVersion: v, ...rest });
      await this.put('logins', await nidHash(nationalId), { v });
      await signOut(secAuth);
      return uid;
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') throw new Error('يوجد حساب بنفس الرقم القومي');
      if (e.code === 'auth/weak-password') throw new Error('كلمة المرور ضعيفة (6 أحرف على الأقل)');
      throw e;
    } finally { deleteApp(sec).catch(() => {}); }
  }
}

export const store = firebaseConfig && !DEMO ? new FirebaseStore() : new LocalStore();
