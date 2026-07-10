/* ─── קבועים ──────────────────────────────────────────────────────────────── */
export const PHASES = [
  { id:"incoming",               label:"ליד נכנס",                  color:"#16a3a3", dim:"#0a4444" },
  { id:"after_call",             label:"לידים לאחר שיחה",           color:"#7c6fcd", dim:"#3b3470" },
  { id:"followup_interested",    label:"פולואו אפ - מעוניינים",     color:"#3dba7e", dim:"#0e4430" },
  { id:"followup_not_interested",label:"פולואו אפ - לא מעוניינים",  color:"#e8a838", dim:"#5c420e" },
  { id:"do_not_call",            label:"לא להתקשר יותר",            color:"#d43a3a", dim:"#5a1010" },
  { id:"closed_client",          label:"ליד סגר - לקוח",            color:"#4f46e5", dim:"#241f70" },
];
export const PHASE_MAP = Object.fromEntries(PHASES.map(p => [p.id, p]));


/* ─── סוגי תיקים מובנים עם אייקונים ─────────────────────────────────────── */
export const CASE_TYPE_OPTIONS = [
  { label:"דירה יחידה - רכישה",        icon:"🏠" },
  { label:"דירה יחידה - רכישה במשפחה", icon:"👨‍👩‍👧" },
  { label:"רכישה מקבלן",                icon:"🏗️" },
  { label:"רכישה יד שנייה",             icon:"🔑" },
  { label:"דירה להשקעה",                icon:"📈" },
  { label:"מחזור משכנתא",               icon:"🔄" },
  { label:"הגדלת משכנתא",               icon:"➕" },
  { label:"משכנתא הפוכה",               icon:"↩️" },
  { label:"בנייה עצמית",                icon:"🧱" },
  { label:"אחר",                        icon:"📁" },
];


/* ─── כרטיסיית ביטחונות ──────────────────────────────────────────────────── */
export const SEC_FIELDS = [
  { key:"approval",      label:"נשלח WhatsApp", icon:"💬", placeholder:"תאריך / פרטים…", dateKey:"collateral_approval_date",  doneKey:"collateral_approval_completed" },
  { key:"appraisal",     label:"נשלח Email",    icon:"✉️", placeholder:"תאריך / פרטים…", dateKey:"collateral_appraisal_date", doneKey:"collateral_appraisal_completed" },
];


