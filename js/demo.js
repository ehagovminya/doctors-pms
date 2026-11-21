// بيانات وهمية لوضع التجربة فقط — لا علاقة لها بأي طبيب حقيقي
import { DEFAULT_SETTINGS } from './defaults.js';

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function buildDemoData() {
  const R = rng(20261121);
  const ri = (a, b) => Math.round(a + R() * (b - a));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const first = ['أحمد', 'محمد', 'محمود', 'مصطفى', 'إسلام', 'عمرو', 'كريم', 'هاني', 'سارة', 'منى', 'ريهام', 'دينا', 'ياسمين', 'هبة', 'نهى', 'شريف', 'طارق', 'خالد', 'مروة', 'إيمان'];
  const last = ['عبد الحميد', 'السيد', 'فوزي', 'عبد الرحمن', 'حسن', 'إبراهيم', 'سليمان', 'عبد الله', 'رمضان', 'جابر', 'منصور', 'شاكر'];

  const hospitals = {
    h1: { id: 'h1', name: 'مستشفى تجريبي (أ)', code: 'A' },
    h2: { id: 'h2', name: 'مستشفى تجريبي (ب)', code: 'B' },
    h3: { id: 'h3', name: 'مستشفى تجريبي (ج)', code: 'C' },
  };
  const plan = [
    ['نسا', 'surgical', 4], ['عظام', 'surgical', 3], ['جراحة عامة', 'surgical', 3], ['تخدير', 'surgical', 3],
    ['باطنة', 'nonsurgical', 3], ['قلب', 'nonsurgical', 2], ['أطفال', 'nonsurgical', 2], ['حضانة', 'rehab', 2],
    ['كلى', 'rehab', 2], ['طوارئ', 'nonsurgical', 3], ['أشعة', 'diagnostic', 1],
  ];
  const doctors = {};
  let i = 0;
  for (const [spec, , count] of plan) {
    for (let k = 0; k < count; k++) {
      i++;
      const id = 'd' + String(i).padStart(3, '0');
      const hid = ['h1', 'h2', 'h3'][i % 3];
      doctors[id] = {
        id, name: `${pick(first)} ${pick(first)} ${pick(last)}`,
        nationalId: String(28000000000000 + i * 7919 + 10000),
        hospitalId: hid, specialty: spec,
        degree: R() > 0.45 ? 'استشاري' : 'أخصائي',
        employmentType: R() > 0.3 ? 'متعاقد' : 'داخل الجهاز الإداري للدولة',
        hireDate: `202${ri(3, 5)}-0${ri(1, 9)}-01`, code: 'DR' + (1000 + i),
        cardType: spec === 'طوارئ' ? 'er' : 'standard',
        ipDept: spec, contractMonths: 11, photo: '',
      };
    }
  }

  const months = ['2026-08', '2026-09', '2026-10'];
  const records = {}, depts = {};
  for (const m of months) {
    for (const h of Object.keys(hospitals)) {
      for (const spec of ['نسا', 'عظام', 'جراحة عامة', 'باطنة', 'قلب', 'أطفال', 'كلى']) {
        const id = `${h}_${m}_inpatient_${spec}`;
        depts[id] = { id, hospitalId: h, month: m, type: 'inpatient', name: spec, gross: ri(900000, 3200000), deductions: '', totalShifts: ri(55, 90) };
      }
      depts[`${h}_${m}_icu_العناية المركزة`] = { id: `${h}_${m}_icu_العناية المركزة`, hospitalId: h, month: m, type: 'icu', name: 'العناية المركزة', gross: ri(1500000, 4000000), deductions: '', totalShifts: ri(60, 90) };
      depts[`${h}_${m}_er_الطوارئ`] = { id: `${h}_${m}_er_الطوارئ`, hospitalId: h, month: m, type: 'er', name: 'الطوارئ', gross: ri(1500000, 3500000), deductions: '', totalShifts: ri(80, 120) };
      depts[`${h}_${m}_hospital_إجمالي المنشأة`] = { id: `${h}_${m}_hospital_إجمالي المنشأة`, hospitalId: h, month: m, type: 'hospital', name: 'إجمالي المنشأة', totalStaffEntitlement: ri(3500000, 6000000) };
    }
    for (const d of Object.values(doctors)) {
      const surg = ['نسا', 'عظام', 'جراحة عامة'].includes(d.specialty);
      const anesth = d.specialty === 'تخدير';
      const er = d.specialty === 'طوارئ';
      const clinicShifts = er || anesth && R() > 0.5 ? 0 : ri(3, 10);
      const rec = er ? {
        erHours: ri(80, 300), erSchedHours: ri(100, 300), erPatients: ri(40, 320), erShifts: ri(6, 20),
        grossEntitlement: ri(14000, 55000),
      } : {
        clinicShifts, clinicHours: clinicShifts * 6, clinicSchedHours: clinicShifts * 6 + ri(0, 2) * 6,
        clinicCases: Math.round(clinicShifts * 6 * (1.2 + R() * 3.6)), opReferrals: ri(0, 12),
        labOrdered: ri(20, 160), labPerformed: 0, labValue: ri(1500, 14000),
        radOrdered: ri(10, 80), radPerformed: 0, radValue: ri(1000, 12000),
        pharmCases: ri(30, 200), pharmValue: ri(4000, 40000),
        ipShifts: d.specialty === 'أشعة' ? 0 : ri(4, 14), ipHours: ri(40, 170), ipSchedHours: ri(60, 170), ipPatients: ri(2, 90),
        icuShifts: ['حضانة', 'تخدير'].includes(d.specialty) ? ri(3, 10) : 0,
        orCount: surg || anesth ? ri(3, 45) : 0,
        kidneySessions: d.specialty === 'كلى' ? ri(40, 160) : 0,
        clinicalCases: ri(20, 120), readmissions: ri(0, 6), complications: ri(0, 3),
        grossEntitlement: ri(12000, 95000),
      };
      if (!er) {
        rec.labPerformed = Math.round(rec.labOrdered * (0.75 + R() * 0.25));
        rec.radPerformed = Math.round(rec.radOrdered * (0.75 + R() * 0.25));
        if (rec.orCount) {
          rec.orHours = Math.round(rec.orCount * (0.7 + R() * 1.4) * 10) / 10;
          rec.orSchedHours = Math.round(rec.orCount * (0.8 + R() * 1.2) * 10) / 10;
          rec.ssiCases = R() > 0.7 ? 1 : 0;
          if (anesth) { rec.opsMajorAnesth = ri(80000, 400000); rec.opsMinorAnesth = ri(20000, 90000); }
          else { rec.opsMajorMain = ri(60000, 350000); rec.opsMinorMain = ri(10000, 70000); rec.opsSimpleMain = ri(0, 20000); rec.opsMajorAssist = ri(0, 40000); }
        }
      }
      rec.netEntitlement = Math.round(rec.grossEntitlement * 0.82);
      rec.contractMonths = 11;
      const id = `${d.id}_${m}`;
      records[id] = { id, doctorId: d.id, hospitalId: d.hospitalId, month: m, status: m === '2026-10' ? 'submitted' : 'approved', data: rec, updatedAt: new Date().toISOString(), updatedBy: 'demo' };
    }
  }

  const users = {};
  const addU = (uid, nationalId, name, role, hospitalId = null, doctorId = null) => { users[uid] = { uid, id: uid, nationalId, password: '123456', name, role, hospitalId, doctorId, active: true }; };
  addU('u_pm', '29001010100011', 'مسؤول النظام (تجريبي)', 'process_manager');
  addU('u_bm', '29001010100022', 'مدير الفرع (تجريبي)', 'branch_manager');
  addU('u_c1', '29001010100033', 'منسق مستشفى (أ)', 'coordinator', 'h1');
  addU('u_cm', '29001010100044', 'عضو لجنة مستشفى (أ)', 'committee', 'h1');
  const d1 = doctors.d001;
  addU('u_d1', d1.nationalId, d1.name, 'doctor', d1.hospitalId, d1.id);

  return { settings: null, hospitals, doctors, records, depts, users, logs: {} };
}

export const DEMO_LOGINS = [
  ['Process Manager', '29001010100011'],
  ['مدير الفرع', '29001010100022'],
  ['منسق مستشفى (أ)', '29001010100033'],
  ['عضو لجنة', '29001010100044'],
];
void DEFAULT_SETTINGS;
