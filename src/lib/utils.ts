export const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
};

/* ─── שעה נוכחית HH:MM — לחותמת זמן בהיסטוריית ההתנהלות ──────────────────── */
export const nowTimeStr = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

/* ─── שם מלא של לקוח/ליד — משלב שם פרטי + משפחה, עם נפילה אחורה ל-name הישן ─
   רשומות חדשות: first_name + last_name. רשומות ישנות: רק name (מוצג כמו שהוא).
   ──────────────────────────────────────────────────────────────────────── */
export const fullName = (c) => {
  if (!c) return "";
  const fn = (c.first_name || "").trim();
  const ln = (c.last_name || "").trim();
  const combined = [fn, ln].filter(Boolean).join(" ");
  return combined || (c.name || "").trim();
};

/* ─── פיצול שם מלא ישן ל-{first_name,last_name} — המילה הראשונה=פרטי, השאר=משפחה ─ */
export const splitName = (full) => {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};

/* ─── תאריך ISO להיום (yyyy-mm-dd) למשימות לוח שנה ──────────────────────── */
export const todayStr2 = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

/* ─── פורמט תאריך עברי קצר מ-ISO ─────────────────────────────────────────── */
export const fmtDate2 = (iso) => {
  if (!iso) return "";
  const d = new Date((iso || "").split("T")[0]);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getFullYear()).slice(-2)}`;
};

/* ─── מזהה ייחודי — UUID אמיתי למניעת התנגשויות ─────────────────────────── */
export const mkId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

/* ─── factory לאובייקט לקוח חדש ─────────────────────────────────────────────
   הערה: ה-CRM מכירות טהור — שדות ספציפיים למשכנתאות (collateral_security_date,
   collateral_signing_date, insurance_*, mortgage_*, final_execution_*, approvals,
   requestedMix וכו') הוסרו לחלוטין: גם מברירת המחדל כאן, גם מהרכיבים שהציגו/ערכו
   אותם (ApprovalCard ו-ExecutionDates נמחקו במלואם), וגם מהרשימה הלבנה ב-toDbRow.
   collateral_approval_date/collateral_appraisal_date נשארו בכוונה — הם עדיין
   גב הנתונים של שני פריטי הצ'ק-ליסט הנותרים ("נשלח WhatsApp"/"נשלח Email"),
   רק שונו התווית והאייקון שלהם, לא העמודות עצמן.
   ──────────────────────────────────────────────────────────────────────── */
/* ─── מנקה payload גלובלי — הגנה אחרונה לפני כל כתיבה ל-Supabase ───────────
   Postgres דוחה מחרוזת ריקה "" עבור עמודות DATE/TIMESTAMP ו-NUMERIC.
   הפונקציה הזו ממירה "" (ועבור מספרים גם ערכים לא-תקינים) ל-null.
   מיושמת בתוך toDbRow (כל נתיבי השמירה הראשיים) וגם עוטפת patches גולמיים
   שנכתבים ישירות, כדי לכסות גם פעולות inline (שינוי שלב, גרירה, עדכון מהיר).
   ──────────────────────────────────────────────────────────────────────── */
export const TIMESTAMP_DATE_FIELDS = [
  "whatsapp_initial_sent_at",
  "collateral_approval_date", "collateral_appraisal_date", "fee_paid_date",
  "lead_created_date",
  "created_at", "updated_at",
];
export const NUMERIC_FIELDS = ["sort_order"];

export const sanitizeClientPayload = (data) => {
  if (!data || typeof data !== "object") return data;
  const cleaned = { ...data };
  // עמודות תאריך/timestamp — "" → null
  TIMESTAMP_DATE_FIELDS.forEach(f => {
    if (cleaned[f] === "" || cleaned[f] === undefined) {
      if (f in cleaned) cleaned[f] = null;
    }
  });
  // עמודות מספריות — ""/לא-תקין → null, אחרת Number
  NUMERIC_FIELDS.forEach(f => {
    if (!(f in cleaned)) return;
    const v = cleaned[f];
    if (v === null) return;
    if (v === "" || v === undefined || String(v).trim() === "" || isNaN(Number(v))) cleaned[f] = null;
    else cleaned[f] = Number(v);
  });
  return cleaned;
};

export const mkClient = (overrides = {}) => ({
  id:           mkId(),
  phase:        "incoming",
  sort_order:   null,
  name:         "",
  first_name:   "",
  last_name:    "",
  lead_created_date: todayStr2(),
  advisor_email: "",
  emails_list:  [],
  fee:          "",
  fee_paid:       false,
  fee_paid_date:  "",
  fee_paid_notes: "",
  description:  "",
  dropbox_url:  "",
  mortgage_property_address:    "",
  mortgage_property_value:      "",
  mortgage_property_appraisal:  "",
  mortgage_property_notes:      "",
  case_type:    "",
  banks:        [],
  phones:       [],
  tids:         [],
  timeline:     [],
  custom_calendar_events: [], // אירועי לוח שנה מותאמים — תכונה כללית, לא ספציפית למשכנתאות, עדיין בשימוש פעיל בגרירת לוח השנה
  // ── פרטי הנכס למכירה ──
  whatsapp_initial_sent_at: "",
  whatsapp_last_sent: null,
  whatsapp_log: [],
  ...overrides,
});


/* ─── סגנון בסיסי ──────────────────────────────────────────────────────────── */
export const baseInput = (extra={}) => ({
  background:"#1a1a2e", border:"1px solid #2e2e50",
  borderRadius:6, color:"#e0e0f4", padding:"7px 10px",
  fontSize:12, outline:"none", width:"100%",
  boxSizing:"border-box", fontFamily:"inherit", direction:"rtl",
  ...extra,
});

export const lbl = {
  display:"block", fontSize:10, color:"#7070a0",
  marginBottom:3, fontWeight:700, letterSpacing:.4,
};


/* ─── localStorage helpers ───────────────────────────────────────────────── */
export const LS = {
  get: (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v)        => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  clear: (keys)      => { try { keys.forEach(k => localStorage.removeItem(k)); } catch {} },
};

// נרמול מספר טלפון ישראלי לפורמט הבינלאומי הנדרש ל-wa.me (ללא +, ללא רווחים/מקפים).
// מטפל בכל הצורות הנפוצות בהזנה ידנית/יבוא:
//   050-1234567 / 0501234567 / 972501234567 / +972501234567 / 501234567 (בלי 0 מוביל)
export const toWhatsAppPhone = (num) => {
  const d = String(num || "").replace(/\D/g, ""); // משאיר ספרות בלבד
  if (!d) return "";
  if (d.startsWith("972")) return d;               // כבר בפורמט בינלאומי
  if (d.startsWith("0"))   return "972" + d.slice(1); // 0 מוביל → 972
  return "972" + d;                                 // חסר 0 מוביל (למשל יובא מקובץ) → מוסיף קידומת
};


