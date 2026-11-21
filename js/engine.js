// محرك الحساب — كل معادلات الدليل + كارت DPC
// دالة نقية: compute(doctor, record, depts, settings) → نتيجة كاملة

const n = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,٬\s]/g, '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return Number.isFinite(x) ? x : 0;
};
const has = (v) => !(v === '' || v === null || v === undefined);
const div = (a, b) => (b ? a / b : 0);
const pct = (p) => n(p) / 100;

export function categoryOf(specialty, settings) {
  const s = (settings.specialties || []).find(x => x.name === specialty);
  return s ? s.cat : 'nonsurgical';
}

export function isErDoctor(doctor, settings) {
  return doctor.cardType === 'er' || (doctor.cardType !== 'standard' && doctor.specialty === 'طوارئ');
}

export function classify(rate, settings) {
  const cls = [...settings.classes].sort((a, b) => b.min - a.min);
  for (const c of cls) if (rate >= c.min) return c;
  return cls[cls.length - 1];
}

export function valueBand(v, settings) {
  const b = [...settings.value.bands].sort((a, b) => b.min - a.min);
  for (const x of b) if (v >= x.min) return x.label;
  return b[b.length - 1].label;
}

function findDept(depts, type, name) {
  const list = (depts || []).filter(d => d.type === type);
  if (!list.length) return null;
  if (name) {
    const m = list.find(d => (d.name || '').trim() === name.trim());
    if (m) return m;
  }
  // الداخلي لازم يطابق اسم القسم؛ العناية/الطوارئ لو قسم واحد بس يتربط تلقائياً
  return type !== 'inpatient' && list.length === 1 ? list[0] : null;
}

function deptShare(dept, doctorShifts, cfg) {
  if (!dept) return { gross: 0, netAll: 0, netDoctors: 0, totalShifts: 0, participation: 0, doctor: 0, found: false };
  const gross = n(dept.gross);
  const netAll = has(dept.deductions) ? gross - n(dept.deductions) : gross * (1 - pct(cfg.defaultCost));
  const netDoctors = netAll * pct(cfg.doctorsPool);
  const totalShifts = n(dept.totalShifts);
  const participation = div(n(doctorShifts), totalShifts);
  return { gross, netAll, netDoctors, totalShifts, participation, doctor: netDoctors * participation, found: true, name: dept.name };
}

export function compute(doctor, rec = {}, depts = [], settings) {
  const S = settings;
  const r = rec || {};
  const cat = categoryOf(doctor.specialty, S);
  const catCfg = S.categories[cat] || S.categories.nonsurgical;
  const warnings = [];

  // ---------- F1 العيادات ----------
  const price = n(S.clinicPrice[doctor.degree] ?? 0);
  const clinicCases = n(r.clinicCases);
  const clinicGross = clinicCases * price;
  const clinicNet = clinicGross * (1 - pct(catCfg.cost));
  const clinicDoctorNet = clinicNet * pct(catCfg.docShare);
  if (clinicCases && !price) warnings.push(`لا يوجد سعر كشف محدد للدرجة "${doctor.degree || '—'}"`);

  // ---------- F2–F4 الخدمات ----------
  const labShare = n(r.labValue) * pct(S.services.lab);
  const radShare = n(r.radValue) * pct(S.services.rad);
  const pharmShare = n(r.pharmValue) * pct(S.services.pharm);
  const servicesAuto = labShare + radShare + pharmShare;
  const servicesShare = has(r.servicesShareManual) ? n(r.servicesShareManual) : servicesAuto;

  // ---------- F5 الداخلي / F6 العناية / F8 الطوارئ ----------
  const ip = deptShare(findDept(depts, 'inpatient', doctor.ipDept || doctor.specialty), r.ipShifts, S.depts.inpatient);
  const icu = deptShare(findDept(depts, 'icu', doctor.icuDept), r.icuShifts, S.depts.icu);
  const er = deptShare(findDept(depts, 'er', doctor.erDept), r.erShifts, S.depts.er);
  if (n(r.ipShifts) && !ip.found) warnings.push('شفتات داخلي بدون بيانات قسم داخلي مطابق لهذا الشهر');
  if (n(r.icuShifts) && !icu.found) warnings.push('شفتات عناية بدون بيانات قسم عناية لهذا الشهر');
  if (n(r.erShifts) && !er.found) warnings.push('شفتات طوارئ بدون بيانات قسم الطوارئ لهذا الشهر');
  for (const [d, lbl] of [[ip, 'الداخلي'], [icu, 'العناية'], [er, 'الطوارئ']]) {
    if (d.participation > 1) warnings.push(`نسبة المشاركة في ${lbl} أكبر من 100% (${Math.round(d.participation * 100)}%) — راجع عدد الشفتات`);
  }

  // ---------- F7 العمليات ----------
  const O = S.ops;
  const ops = {
    majorGross: n(r.opsMajorMain) + n(r.opsMajorAssist) + n(r.opsMajorAnesth),
    minorGross: n(r.opsMinorMain) + n(r.opsMinorAnesth),
    simpleGross: n(r.opsSimpleMain),
    majorDoc: n(r.opsMajorMain) * pct(O.majorMain) + n(r.opsMajorAssist) * pct(O.majorAssist) + n(r.opsMajorAnesth) * pct(O.majorAnesth),
    minorDoc: n(r.opsMinorMain) * pct(O.minorMain) + n(r.opsMinorAnesth) * pct(O.minorAnesth),
    simpleDoc: n(r.opsSimpleMain) * pct(O.simpleMain),
  };
  const opsNetFactor = 1 - pct(O.costPct); // صافي إنتاجية العملية = 30% من الإجمالي
  ops.majorNet = ops.majorGross * opsNetFactor;
  ops.minorNet = ops.minorGross * opsNetFactor;
  ops.simpleNet = ops.simpleGross * opsNetFactor;
  ops.gross = ops.majorGross + ops.minorGross + ops.simpleGross;
  ops.doctor = ops.majorDoc + ops.minorDoc + ops.simpleDoc;
  const roleOf = (main, assist, anesth) => {
    const roles = [];
    if (n(main)) roles.push('جراح رئيسي');
    if (n(assist)) roles.push('جراح مساعد');
    if (n(anesth)) roles.push('تخدير');
    return roles.join(' / ') || '—';
  };
  ops.majorRole = roleOf(r.opsMajorMain, r.opsMajorAssist, r.opsMajorAnesth);
  ops.minorRole = roleOf(r.opsMinorMain, 0, r.opsMinorAnesth);
  ops.simpleRole = roleOf(r.opsSimpleMain, 0, 0);

  // ---------- F9 الكلى ----------
  const kidneyGross = n(r.kidneySessions) * n(S.kidney.sessionPrice);
  const kidneyDoctor = kidneyGross * pct(S.kidney.doctorPct);
  if (n(r.kidneySessions) && !n(S.kidney.sessionPrice)) warnings.push('سعر جلسة الغسيل الكلوي غير محدد في الإعدادات');

  // ---------- F10 الملخص المالي ----------
  const totalGross = clinicGross + n(r.labValue) + n(r.radValue) + n(r.pharmValue) + ops.gross
    + ip.gross * ip.participation + icu.gross * icu.participation + er.gross * er.participation + kidneyGross;
  const totalNet = clinicDoctorNet + servicesShare + ip.doctor + icu.doctor + er.doctor + ops.doctor + kidneyDoctor;
  const grossEnt = n(r.grossEntitlement);
  const netEnt = n(r.netEntitlement);
  const entitlement = S.entitlementBasis === 'net' && netEnt ? netEnt : grossEnt;
  const rate = div(totalNet, entitlement);
  const cls = entitlement ? classify(rate, S) : null;
  if (!entitlement) warnings.push('لا يوجد استحقاق مسجل — لا يمكن حساب معدل الإنتاجية والتصنيف');

  // ---------- المؤشرات التشغيلية ----------
  const H = S.hours;
  const clinicHours = has(r.clinicHours) ? n(r.clinicHours) : n(r.clinicShifts) * H.clinicShift;
  const deptHours = (n(r.ipShifts) + n(r.icuShifts) + n(r.erShifts)) * H.deptShift;
  const workedHours = clinicHours + (has(r.ipHours) ? n(r.ipHours) : deptHours) + n(r.orHours) + n(r.erHours);
  const operational = {
    clinicShifts: n(r.clinicShifts), clinicCases,
    labOrdered: n(r.labOrdered), labPerformed: n(r.labPerformed), labCompliance: div(n(r.labPerformed), n(r.labOrdered)),
    radOrdered: n(r.radOrdered), radPerformed: n(r.radPerformed), radCompliance: div(n(r.radPerformed), n(r.radOrdered)),
    pharmCases: n(r.pharmCases),
    ipTotalShifts: ip.totalShifts, ipShifts: n(r.ipShifts), ipParticipation: ip.participation,
    icuTotalShifts: icu.totalShifts, icuShifts: n(r.icuShifts), icuParticipation: icu.participation,
    erTotalShifts: er.totalShifts, erShifts: n(r.erShifts), erParticipation: er.participation,
    surgeonContribution: div(ops.doctor, ops.gross),
    opToIp: div(n(r.opReferrals), clinicCases),
    kidneySessions: n(r.kidneySessions),
    workedHours,
    fte: div(workedHours, H.monthly),
    orCount: n(r.orCount),
  };
  for (const [k, l] of [['labCompliance', 'المعمل'], ['radCompliance', 'الأشعة']]) {
    if (operational[k] > 1) warnings.push(`المنفذ في ${l} أكبر من المطلوب — راجع الأرقام`);
  }

  // ---------- المؤشرات السريرية ----------
  const base = n(r.clinicalCases);
  const opsCount = n(r.orCount);
  const readmissionRate = div(n(r.readmissions), base) * 100;
  const complicationRate = div(n(r.complications), base) * 100;
  const ssiRate = div(n(r.ssiCases), opsCount) * 100;
  const V = S.value;
  const hasClinical = base > 0 || opsCount > 0;
  const valueIndex = hasClinical
    ? Math.max(0, Math.min(100, 100 - (readmissionRate * V.wReadmission + complicationRate * V.wComplication + ssiRate * V.wSsi)))
    : null;
  const clinical = {
    readmissionRate, complicationRate, ssiRate, valueIndex,
    valueBand: valueIndex === null ? null : valueBand(valueIndex, S),
  };

  // ---------- كارت DPC ----------
  const D = S.dpc;
  let dpc;
  if (isErDoctor(doctor, S)) {
    const hrs = has(r.erHours) ? n(r.erHours) : n(r.ipHours);
    const sched = has(r.erSchedHours) ? n(r.erSchedHours) : n(r.ipSchedHours);
    const pts = has(r.erPatients) ? n(r.erPatients) : n(r.ipPatients);
    const pr = (div(pts, hrs));
    dpc = {
      type: 'er', hours: hrs, sched, patients: pts, pr, bm: D.er,
      compliance: div(hrs, sched), percent: div(pr, D.er),
      totalPR: pr, totalBM: D.er, average: div(pr, D.er),
    };
    if (hrs < 0) warnings.push('ساعات عمل الطوارئ بالسالب — غير مقبول');
  } else {
    const opdHours = clinicHours;
    const opd = {
      hours: opdHours, sched: n(r.clinicSchedHours), patients: clinicCases,
      ideal: n(r.clinicSchedHours) * D.opd, pr: (div(clinicCases, opdHours)), bm: D.opd,
    };
    opd.percent = div(opd.pr, opd.bm);
    const ipd = {
      hours: n(r.ipHours), sched: n(r.ipSchedHours), patients: n(r.ipPatients),
      pr: (div(n(r.ipPatients), n(r.ipHours))), bm: D.ipd,
    };
    ipd.percent = div(ipd.pr, ipd.bm);
    const orr = {
      count: n(r.orCount), hours: n(r.orHours), sched: n(r.orSchedHours),
      pr: (div(n(r.orCount), n(r.orHours))), bm: (div(n(r.orCount), n(r.orSchedHours))),
    };
    orr.percent = div(orr.pr, orr.bm);
    orr.active = orr.count > 0;
    const totalPR = (opd.pr + ipd.pr + (orr.active ? orr.pr : 0));
    const totalBM = (opd.bm + ipd.bm + (orr.active ? orr.bm : 0));
    dpc = { type: 'standard', opd, ipd, or: orr, totalPR, totalBM, average: div(totalPR, totalBM) };
    if (n(r.ipHours) < 0 || n(r.clinicHours) < 0 || n(r.orHours) < 0) warnings.push('توجد ساعات عمل بالسالب — غير مقبول، راجع البيانات');
  }
  dpc.contractMonths = has(r.contractMonths) ? n(r.contractMonths) : (doctor.contractMonths ?? null);
  dpc.salary = grossEnt;

  return {
    category: cat,
    financial: {
      price, clinicGross, clinicNet, clinicDoctorNet,
      labValue: n(r.labValue), labShare, radValue: n(r.radValue), radShare,
      pharmValue: n(r.pharmValue), pharmShare, servicesAuto, servicesShare,
      servicesManual: has(r.servicesShareManual),
      ip, icu, er, ops, kidneyGross, kidneyDoctor,
      totalGross, totalNet, grossEnt, netEnt, entitlement, rate,
      classification: cls ? cls.code : null,
    },
    operational, clinical, dpc,
    additional: {
      cpv: div(grossEnt, clinicCases + n(r.ipPatients)),
      outpatientRevenue: clinicGross,
      inpatientRevenue: ip.gross * ip.participation + icu.gross * icu.participation,
      totalRevenue: totalGross,
      outpatientVolume: clinicCases,
      inpatientVolume: n(r.ipPatients),
    },
    warnings,
  };
}

// أخطاء تمنع الحفظ (بيانات غير منطقية)
export function validateRecord(rec) {
  const errors = [];
  for (const [k, v] of Object.entries(rec || {})) {
    if (!has(v)) continue;
    const raw = String(v).replace(/[,٬\s]/g, '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    const x = Number(raw);
    if (!Number.isFinite(x)) errors.push({ field: k, msg: `قيمة غير رقمية: "${v}"` });
    else if (x < 0) errors.push({ field: k, msg: `لا يُقبل رقم بالسالب (${v})` });
  }
  return errors;
}

export { n as num };
