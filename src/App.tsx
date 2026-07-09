import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import Papa from "papaparse";

/* ══════════════════════════════════════════════════════════════════════════════
   ─── Supabase — חיבור מסד נתונים חי ─────────────────────────────────────────
   גישה ישירה עם Anon Key, ללא מסך כניסה.
   הגדר ב-Vercel / .env:
     VITE_SUPABASE_URL      = https://xxxx.supabase.co
     VITE_SUPABASE_ANON_KEY = eyJ...
   ════════════════════════════════════════════════════════════════════════════ */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = SUPABASE_URL && SUPABASE_ANON
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,      // שמור את הסשן ב-localStorage בין רענונים
        autoRefreshToken: true,    // רענן את ה-JWT אוטומטית לפני פקיעה
        detectSessionInUrl: true,  // טפל ב-callback של התחברות
      },
    })
  : null;

/* ─── קבועים ──────────────────────────────────────────────────────────────── */
const PHASES = [
  { id:"incoming",               label:"ליד נכנס",                  color:"#16a3a3", dim:"#0a4444" },
  { id:"after_call",             label:"לידים לאחר שיחה",           color:"#7c6fcd", dim:"#3b3470" },
  { id:"followup_interested",    label:"פולואו אפ - מעוניינים",     color:"#3dba7e", dim:"#0e4430" },
  { id:"followup_not_interested",label:"פולואו אפ - לא מעוניינים",  color:"#e8a838", dim:"#5c420e" },
  { id:"do_not_call",            label:"לא להתקשר יותר",            color:"#d43a3a", dim:"#5a1010" },
  { id:"closed_client",          label:"ליד סגר - לקוח",            color:"#4f46e5", dim:"#241f70" },
];
const PHASE_MAP = Object.fromEntries(PHASES.map(p => [p.id, p]));

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
};

/* ─── שעה נוכחית HH:MM — לחותמת זמן בהיסטוריית ההתנהלות ──────────────────── */
const nowTimeStr = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

/* ─── שם מלא של לקוח/מוכר — משלב שם פרטי + משפחה, עם נפילה אחורה ל-name הישן ─
   רשומות חדשות: first_name + last_name. רשומות ישנות: רק name (מוצג כמו שהוא).
   ──────────────────────────────────────────────────────────────────────── */
const fullName = (c) => {
  if (!c) return "";
  const fn = (c.first_name || "").trim();
  const ln = (c.last_name || "").trim();
  const combined = [fn, ln].filter(Boolean).join(" ");
  return combined || (c.name || "").trim();
};

/* ─── פיצול שם מלא ישן ל-{first_name,last_name} — המילה הראשונה=פרטי, השאר=משפחה ─ */
const splitName = (full) => {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};

/* ─── תאריך ISO להיום (yyyy-mm-dd) למשימות לוח שנה ──────────────────────── */
const todayStr2 = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

/* ─── פורמט תאריך עברי קצר מ-ISO ─────────────────────────────────────────── */
const fmtDate2 = (iso) => {
  if (!iso) return "";
  const d = new Date((iso || "").split("T")[0]);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getFullYear()).slice(-2)}`;
};

/* ─── מזהה ייחודי — UUID אמיתי למניעת התנגשויות ─────────────────────────── */
const mkId = () =>
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
const TIMESTAMP_DATE_FIELDS = [
  "whatsapp_initial_sent_at", "property_on_market_since",
  "collateral_approval_date", "collateral_appraisal_date", "fee_paid_date",
  "created_at", "updated_at",
];
const NUMERIC_FIELDS = ["property_size_sqm", "property_rooms", "property_price", "sort_order"];

const sanitizeClientPayload = (data) => {
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

const mkClient = (overrides = {}) => ({
  id:           mkId(),
  phase:        "incoming",
  sort_order:   null,
  name:         "",
  first_name:   "",
  last_name:    "",
  handler:      "",
  opFor:        "",
  advisor_email: "",
  emails_list:  [],
  fee:          "",
  fee_paid:       false,
  fee_paid_date:  "",
  fee_paid_notes: "",
  description:  "",
  dropbox_url:  "",
  case_type:    "",
  lead_source:  "",
  banks:        [],
  phones:       [],
  tids:         [],
  timeline:     [],
  custom_calendar_events: [], // אירועי לוח שנה מותאמים — תכונה כללית, לא ספציפית למשכנתאות, עדיין בשימוש פעיל בגרירת לוח השנה
  // ── פרטי הנכס למכירה ──
  property_street:        "",
  property_house_number:  "",
  property_neighborhood:  "",
  property_city:          "",
  property_size_sqm:      "",
  property_rooms:         "",
  property_floor:         "",
  property_type:          "",
  property_condition:     "",
  property_mamad:         "",
  property_price:         "",
  property_on_market_since: "",
  property_published_on:  "",
  property_balcony:       "",
  property_elevator:      "",
  property_parking:       "",
  property_seller_notes:  "",
  property_ad_link:       "",
  whatsapp_initial_sent_at: "",
  whatsapp_last_sent: null,
  whatsapp_log: [],
  post_onboarding_checks: {},
  ...overrides,
});


/* ─── סגנון בסיסי ──────────────────────────────────────────────────────────── */
const baseInput = (extra={}) => ({
  background:"#1a1a2e", border:"1px solid #2e2e50",
  borderRadius:6, color:"#e0e0f4", padding:"7px 10px",
  fontSize:12, outline:"none", width:"100%",
  boxSizing:"border-box", fontFamily:"inherit", direction:"rtl",
  ...extra,
});

const lbl = {
  display:"block", fontSize:10, color:"#7070a0",
  marginBottom:3, fontWeight:700, letterSpacing:.4,
};

/* ─── רכיב RInput ──────────────────────────────────────────────────────────── */
function RInput({ value, onChange, placeholder, style={} }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir="rtl"
      style={baseInput(style)}
    />
  );
}

/* ─── רכיב זוג שדות (מספר + שם בעלים) — ללא הגבלת כמות ─────────────────── */
function PairFields({ pairs, onChange, numPlaceholder, namePlaceholder, addLabel="+ הוסף", inputBg, inputBdr, inputColor, keyA="number", keyB="ownerName", dirA="rtl" }) {
  const update = (i, key, val) =>
    onChange(pairs.map((p,j) => j===i ? { ...p, [key]:val } : p));
  const add    = () => onChange([...pairs, { [keyA]:"", [keyB]:"" }]);
  const remove = (i) => onChange(pairs.filter((_,j) => j!==i));

  const iStyle = {
    background: inputBg || "#1a1a2e",
    border:`1px solid ${inputBdr || "#2e2e50"}`,
    borderRadius:6, color: inputColor || "#e0e0f4",
    WebkitTextFillColor: inputColor || "#e0e0f4", opacity:1,
    padding:"7px 10px", fontSize:12, outline:"none",
    boxSizing:"border-box", fontFamily:"inherit", direction:"rtl",
  };

  return (
    <div>
      {pairs.map((p, i) => (
        <div key={i} style={{ display:"flex", gap:5, marginBottom:5, alignItems:"center" }}>
          <input
            value={p[keyA] || ""}
            onChange={e => update(i,keyA,e.target.value)}
            placeholder={numPlaceholder}
            dir={dirA}
            style={{ ...iStyle, flex:"0 0 128px", width:"auto", direction:dirA, textAlign: dirA==="ltr" ? "left" : "right" }}
          />
          <input
            value={p[keyB] || ""}
            onChange={e => update(i,keyB,e.target.value)}
            placeholder={namePlaceholder}
            dir="rtl"
            style={{ ...iStyle, flex:1, width:"auto" }}
          />
          {pairs.length > 1 && (
            <button onClick={() => remove(i)}
              style={{ background:"none", border:"none", color:"#774444", fontSize:15, cursor:"pointer", padding:"0 2px" }}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button onClick={add} style={{
        background:"none", border:`1px dashed ${inputBdr||"#3a3a60"}`, color: inputColor ? inputBdr||"#6060a0" : "#6060a0",
        borderRadius:5, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit",
      }}>{addLabel}</button>
    </div>
  );
}

/* ─── סוגי תיקים מובנים עם אייקונים ─────────────────────────────────────── */
const CASE_TYPE_OPTIONS = [
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

/* ─── שורת "הוסף לקוח חדש" (Inline בתוך הטבלה) ───────────────────────────── */
function InlineAddRow({ phaseId, onSave, onCancel, theme:TH={}, advisors=[], isAdmin=false, myName="" }) {
  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [advisor, setAdvisor] = useState("");

  const isLight = TH.name === "Light Mode";
  const rowBg   = isLight ? "#f8f9ff" : "#13132b";
  const barCol  = "#6c5ecf";
  const inputBg = isLight ? "#ffffff" : "#1a1a35";
  const inputBdr= isLight ? "#d0d8e8" : "#2e2e50";
  const txtCol  = isLight ? "#1a1a3a" : "#e0e0f4";
  const subCol  = isLight ? "#7070a0" : "#8888b0";
  const lblCol  = isLight ? "#6060a0" : "#9090c0";

  const valid = name.trim() !== "";

  const save = () => {
    if (!valid) return;
    onSave(mkClient({
      phase:     phaseId,
      name:      name.trim(),
      advisor_email: advisor,
      banks:     [],
      // הטלפון נשמר במבנה הזוגות הסטנדרטי { number, ownerName } —
      // כך שהוא יוצג נכון בכל מקום אחר שקורא client.phones (טבלה, מגירת לקוח וכו')
      phones:    phone.trim() ? [{ number: phone.trim(), ownerName: name.trim() }] : [],
      tids:      [],
      timeline:  [],
    }));
  };

  const C = { padding:"10px 8px", verticalAlign:"top" };
  const lblStyle = { display:"block", fontSize:10, fontWeight:700, color:lblCol, marginBottom:4 };
  const fieldStyle = {
    width:"100%", boxSizing:"border-box",
    background:inputBg, border:`1px solid ${inputBdr}`, borderRadius:7,
    color:txtCol, padding:"8px 10px", fontSize:13, outline:"none",
    fontFamily:"inherit", cursor:"pointer",
  };

  return (
    <tr style={{ background:rowBg, borderBottom:`2px solid ${barCol}66` }}>
      {/* פס צבע */}
      <td style={{ width:4, padding:0, background:barCol }} />

      {/* שם הלקוח */}
      <td style={C}>
        <label style={lblStyle}>שם הלקוח *</label>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="ישראל ישראלי" dir="rtl"
          onKeyDown={e => { if (e.key==="Enter") save(); if (e.key==="Escape") onCancel(); }}
          style={{ ...fieldStyle, cursor:"text", WebkitTextFillColor:txtCol, opacity:1 }}
        />
      </td>

      {/* פלאפון — שדה טלפון */}
      <td style={{ ...C, minWidth:200 }}>
        <label style={lblStyle}>📱 פלאפון</label>
        <input
          type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="050-0000000" dir="ltr"
          onKeyDown={e => { if (e.key==="Enter") save(); if (e.key==="Escape") onCancel(); }}
          style={{ ...fieldStyle, cursor:"text", textAlign:"right", WebkitTextFillColor:txtCol, opacity:1 }}
        />
      </td>

      {/* מתופעל ע״י / יועץ — Dropdown (אדמין/סופר-אדמין בלבד; איש מכירות לא רואה בחירה כלל) */}
      <td style={{ ...C, minWidth:170 }}>
        <label style={lblStyle}>👤 מתופעל ע״י</label>
        {isAdmin ? (
          <select
            value={advisor} onChange={e => setAdvisor(e.target.value)} dir="rtl"
            style={{ ...fieldStyle, color: advisor ? txtCol : subCol }}
          >
            <option value="">— בחר סוכן —</option>
            {advisors.map(a => (
              <option key={a.email} value={a.email}>{a.name}</option>
            ))}
          </select>
        ) : (
          // איש מכירות: אין בחירה — הליד תמיד משויך אליו, מוצג כקריאה-בלבד
          <div style={{ ...fieldStyle, cursor:"default", color:subCol, background:isLight?"#f0f0f8":"#15152e" }}>
            {myName || "אתה"} (אוטומטי)
          </div>
        )}
      </td>

      {/* כפתורים */}
      <td style={{ ...C, whiteSpace:"nowrap" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:16 }}>
          <button
            onClick={save} disabled={!valid}
            style={{
              background: valid ? "linear-gradient(135deg,#6c5ecf,#2d88d4)" : (isLight ? "#e0e0ec" : "#222238"),
              color: valid ? "#fff" : (isLight ? "#a0a0b0" : "#555"),
              border:"none", borderRadius:7, padding:"8px 18px",
              fontSize:12, fontWeight:800, cursor: valid ? "pointer" : "default",
            }}
          >✓ שמור</button>
          <button onClick={onCancel} style={{
            background: isLight ? "#ffffff" : "#1a1a35", color: subCol,
            border:`1px solid ${inputBdr}`, borderRadius:7,
            padding:"7px 12px", fontSize:12, cursor:"pointer",
          }}>ביטול</button>
        </div>
      </td>
    </tr>
  );
}


/* ─── DescriptionField — תיאור התיק עם נעילה/עריכה ושמירה ישירה ל-Supabase ── */
function DescriptionField({ value, onChange, readOnly:_readOnly, clientId, theme:TH={}, DB, DC, DBR, DT, DS, DI, ACCENT }) {
  const readOnly = false; // תיאור התיק — פתוח לעריכה לכל המשתמשים (יועץ + מתפעל)
  const isLight = TH.name === "Light Mode";
  const txtColor = isLight ? "#1a1a3a" : (DT || "#e0e0f8");
  const [locked, setLocked] = useState(() => !!value);
  const [draft,  setDraft]  = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [flash,  setFlash]  = useState(false);

  useEffect(() => {
    setDraft(value || "");
    setLocked(!!value);
  }, [value]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (supabase && clientId) {
        const { error } = await supabase
          .from("clients")
          .update({ description: draft })
          .eq("id", clientId);
        if (error) { console.error("שגיאת DB בשמירת תיאור:", error.message); alert(`שגיאה בשמירת התיאור:\n${error.message}`); }
      }
      onChange && onChange(draft);
      setLocked(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    } catch(err) {
      console.error("שגיאה לא צפויה בשמירת תיאור:", err);
    } finally {
      setSaving(false);
    }
  };

  const isLocked = readOnly || locked;
  const cardBg   = isLight ? "#f8faff" : "#0a1220";

  return (
    <div style={{
      marginTop:36,
      background: DC,
      border:`1px solid ${DBR}`,
      borderRadius:12, overflow:"hidden",
    }}>
      {/* כותרת */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"12px 16px", borderBottom:`1px solid ${DBR}`,
        background: isLight ? "linear-gradient(135deg,#eef4ff,#f4f0ff)" : "linear-gradient(135deg,#13182e,#0e1020)",
      }}>
        <span style={{ fontSize:14, fontWeight:900, color:ACCENT, display:"flex", alignItems:"center", gap:7 }}>
          📋 תיאור כללי
        </span>
        {/* כפתור ערוך — כשנעול ולא יועץ */}
        {!readOnly && locked && (
          <button
            onClick={() => setLocked(false)}
            style={{
              background:"transparent", border:`1px solid ${ACCENT}66`,
              color:ACCENT, borderRadius:6, padding:"4px 12px",
              fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background=ACCENT; e.currentTarget.style.color="#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=ACCENT; }}
          >📝 ערוך תיאור</button>
        )}
        {flash && (
          <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700, animation:"fadeUp .2s ease" }}>
            ✓ נשמר בהצלחה
          </span>
        )}
      </div>

      {/* תוכן */}
      <div style={{ padding:"14px 16px" }}>
        {isLocked && !value ? (
          <div style={{ fontSize:13, color:DS, fontStyle:"italic" }}>
            {readOnly ? "לא הוזן תיאור" : "אין תיאור עדיין — לחץ על \"ערוך תיאור\" להוספה"}
          </div>
        ) : (
          <textarea
            value={isLocked ? (value || "") : draft}
            onChange={e => !isLocked && setDraft(e.target.value)}
            readOnly={isLocked}
            rows={5}
            dir="rtl"
            placeholder={isLocked ? "" : "תאר את התיק: רקע הלקוח, מצב נוכחי, נקודות חשובות…"}
            style={{
              width:"100%", boxSizing:"border-box", padding:"10px 12px",
              background: isLocked ? (isLight ? "#f4f6fc" : "#0d1525") : DI,
              border:`1.5px solid ${isLocked ? (isLight ? "#e0e4f2" : "#1a2035") : ACCENT+"66"}`,
              borderRadius:9,
              color: txtColor,
              WebkitTextFillColor: txtColor,
              opacity: 1,
              fontSize:13, lineHeight:1.7,
              resize: isLocked ? "none" : "vertical",
              outline:"none", fontFamily:"inherit", cursor: isLocked ? "default" : "text",
              transition:"background .2s, border-color .2s",
            }}
            onFocus={e => { if (!isLocked) e.target.style.borderColor=ACCENT; }}
            onBlur={e =>  { if (!isLocked) e.target.style.borderColor=ACCENT+"66"; }}
          />
        )}

        {/* כפתור שמור — במצב עריכה ולא יועץ */}
        {!readOnly && !locked && (
          <div style={{ marginTop:10 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving ? "#888" : `linear-gradient(135deg,${ACCENT},#1a6ab0)`,
                color:"#fff", border:"none", borderRadius:7,
                padding:"9px 22px", fontSize:12, fontWeight:800,
                cursor: saving ? "default" : "pointer",
                boxShadow:`0 3px 12px ${ACCENT}44`, transition:"opacity .15s",
              }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity=".85"; }}
              onMouseLeave={e => e.currentTarget.style.opacity="1"}
            >{saving ? "שומר…" : "💾 שמור"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── WhatsAppCard — שליחת הודעת ווטסאפ ללקוח לפי תבנית נבחרת ────────────────
   • בחירת תבנית מתוך 6 התבניות הגלובליות (dropdown "{מספר} - {כותרת}")
   • הטקסט בר-עריכה מלאה לפני שליחה (גם תבניות 2-6); תבנית 1 = רישום חופשי
     עם ברירת מחדל https://wiseli.co.il
   • "שלח ווטסאפ" פותח wa.me עם הטקסט שבתיבה (כולל עריכות הסוכן), מקודד
   • בלחיצה — שני לוגים: (A) הערה מובנית בהיסטוריית ההתנהלות עם שם הסוכן+תבנית+טקסט,
     (B) חותם whatsapp_last_sent (JSONB) שמוצג בתחתית הכרטיסייה
   ────────────────────────────────────────────────────────────────────────── */
function WhatsAppCard({ client, onUpdate, onAddNote, templates=[], myName="", theme:TH={} }) {
  const isLight  = TH.name === "Light Mode";
  const cardBg   = TH.drawerCard    || "#12122a";
  const cardBdr  = TH.drawerBorder  || "#2a2a48";
  const inputBg  = TH.drawerInput   || "#1a1a2e";
  const textMain = TH.drawerText    || "#d8d8f0";
  const textSub  = TH.drawerSubText || "#8080b0";
  const WA = "#25d366"; // ירוק ווטסאפ

  const FREE_WRITE_DEFAULT = "https://wiseli.co.il";

  // תבנית נבחרת (id). ברירת מחדל — הראשונה אם קיימת.
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find(t => String(t.id) === String(selectedId)) || null;
  const isFreeWrite = String(selectedId) === "1";

  // טקסט בר-עריכה — מאותחל לפי התבנית הנבחרת, וניתן לעריכה חופשית.
  const [editText, setEditText] = useState("");
  // בעת החלפת תבנית: טען את גוף התבנית (או ברירת המחדל לרישום חופשי).
  useEffect(() => {
    if (isFreeWrite) setEditText(selected?.body?.trim() ? selected.body : FREE_WRITE_DEFAULT);
    else setEditText(selected?.body || "");
  }, [selectedId, selected?.body, isFreeWrite]);

  // טלפון ראשי (ראשון במערך) — לתאימות אחורה
  const rawPhone = (Array.isArray(client.phones) && client.phones[0]?.number) || "";

  // כל מספרי הטלפון של הלקוח — מקור לבחירת נמען (multi-number)
  const phoneOptions = (Array.isArray(client.phones) ? client.phones : [])
    .filter(p => p && String(p.number || "").replace(/\D/g, "").length >= 6)
    .map((p, i) => ({
      idx: i,
      number: p.number,
      ownerName: p.ownerName || fullName(client) || "",
    }));

  // נרמול מספר לפורמט wa.me (ישראל: 0... → 972...)
  const toWaPhone = (num) => {
    const d = String(num || "").replace(/\D/g, "");
    return d.startsWith("0") ? "972" + d.slice(1) : d;
  };

  // יומן ההיסטוריה — מערך (חדש), עם נפילה אחורה לרשומה הבודדת הישנה
  const waLog = Array.isArray(client.whatsapp_log) && client.whatsapp_log.length
    ? client.whatsapp_log
    : (client.whatsapp_last_sent ? [client.whatsapp_last_sent] : []);
  // ממוין מהחדש לישן
  const sortedLog = [...waLog].sort((a, b) => new Date(b.at) - new Date(a.at));

  const [showRecipient, setShowRecipient] = useState(false);
  const [recipientIdx,  setRecipientIdx]  = useState(0); // אינדקס המספר הנבחר במודל
  const [carouselIdx,   setCarouselIdx]   = useState(0); // אינדקס בקרוסלת ההיסטוריה (0 = החדש ביותר)

  // איפוס מצביע הקרוסלה לחדש ביותר כשהיומן משתנה
  useEffect(() => { setCarouselIdx(0); }, [waLog.length]);

  // לחיצה על "שלח ווטסאפ" — פותחת תחילה את מודל בחירת הנמען
  const openRecipientModal = () => {
    const body = (editText || "").trim();
    if (!body) { alert("ההודעה ריקה. כתוב טקסט לפני השליחה."); return; }
    if (phoneOptions.length === 0) { alert("אין מספר טלפון תקין ללקוח זה."); return; }
    setRecipientIdx(0);
    setShowRecipient(true);
  };

  // ביצוע השליחה בפועל לנמען שנבחר
  const doSend = () => {
    const chosen = phoneOptions[recipientIdx];
    if (!chosen) return;
    const waPhone = toWaPhone(chosen.number);
    if (!waPhone) { alert("מספר הטלפון שנבחר אינו תקין."); return; }
    const body = (editText || "").trim();
    if (!body) return;
    const text = body.replace(/\r\n/g, "\n");
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    const now = new Date();
    const tplLabel = selected ? `${selected.id} - ${selected.title}` : "ללא תבנית";
    const record = {
      at: now.toISOString(),
      agent: myName || "",
      template_id: selected?.id ?? null,
      template_label: tplLabel,
      body,
      to_number: chosen.number,
      to_name: chosen.ownerName,
    };
    // צרף ליומן (מערך) + שמור גם last_sent + timestamp לתאימות
    const nextLog = [...waLog, record];
    if (onUpdate) onUpdate(client.id, {
      whatsapp_initial_sent_at: now.toISOString(),
      whatsapp_last_sent: record,
      whatsapp_log: nextLog,
    });
    // Log A — הערה מובנית בהיסטוריית ההתנהלות
    if (onAddNote) {
      onAddNote(client.id, `${myName ? myName + " " : ""}שלח הודעת ווטסאפ (תבנית ${tplLabel}) ל-${chosen.ownerName} (${chosen.number}): "${body}"`);
    }
    setShowRecipient(false);
    setCarouselIdx(0);
  };

  const fmtSent = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  const labelStyle = { fontSize:11, fontWeight:700, color:textSub, marginBottom:5, display:"block" };

  return (
    <div style={{
      background:cardBg, borderRadius:12,
      border:`1px solid ${WA}66`, marginTop:24, marginBottom:24, overflow:"hidden",
    }}>
      {/* כותרת */}
      <div style={{
        background: isLight ? "linear-gradient(135deg,#e8f9ee,#d8f5e2)" : "linear-gradient(135deg,#0a2418,#0d1f17)",
        borderBottom:`1px solid ${WA}55`,
        padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
      }}>
        <span style={{ fontSize:16 }}>💬</span>
        <span style={{ fontSize:13, fontWeight:900, color:WA, letterSpacing:.5 }}>שלח ווטסאפ</span>
      </div>

      <div style={{ padding:"16px" }}>
        {/* בורר תבנית */}
        <div style={{ marginBottom:13 }}>
          <label style={labelStyle}>📋 בחר תבנית</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            dir="rtl"
            style={{
              width:"100%", boxSizing:"border-box", fontSize:13, color:textMain,
              background:inputBg, border:`1px solid ${cardBdr}`, borderRadius:7,
              padding:"9px 11px", outline:"none", fontFamily:"inherit", cursor:"pointer",
            }}
          >
            {templates.length === 0 && <option value="">— אין תבניות מוגדרות —</option>}
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.id} - {t.title}</option>
            ))}
          </select>
        </div>

        {/* טקסט בר-עריכה — כל התבניות ניתנות לעריכה לפני שליחה */}
        <div style={{ marginBottom:15 }}>
          <label style={labelStyle}>✏️ {isFreeWrite ? "רישום חופשי — כתוב הודעה" : "ערוך לפני שליחה"}</label>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            placeholder="כתוב כאן את ההודעה…"
            dir="rtl" rows={5}
            style={{
              width:"100%", boxSizing:"border-box", fontSize:13, lineHeight:1.6,
              color:textMain, background:inputBg, border:`1px solid ${cardBdr}`,
              borderRadius:7, padding:"10px 12px", outline:"none", fontFamily:"inherit",
              resize:"vertical", minHeight:90,
            }}
          />
        </div>

        {/* כפתור שליחה — פותח תחילה מודל בחירת נמען */}
        <button
          onClick={openRecipientModal}
          style={{
            width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            background:`linear-gradient(135deg,${WA},#1eb858)`, color:"#fff",
            border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:800,
            cursor:"pointer", fontFamily:"inherit",
          }}
        >
          <span style={{ fontSize:17 }}>💬</span> שלח ווטסאפ
        </button>

        {/* קרוסלת היסטוריית ההודעות שנשלחו */}
        {sortedLog.length > 0 && (() => {
          const safeIdx = Math.min(carouselIdx, sortedLog.length - 1); // 0 = החדש ביותר
          const rec = sortedLog[safeIdx];
          const hasMultiple = sortedLog.length > 1;
          // מספור כרונולוגי: הישן ביותר = 1, החדש ביותר = total.
          // safeIdx=0 הוא החדש ביותר → מציג total; safeIdx=total-1 הוא הישן → מציג 1.
          const chronoNum = sortedLog.length - safeIdx;
          const navBtn = (enabled) => ({
            background: isLight ? "#ffffff" : "#0a1812",
            border:`1px solid ${WA}44`, color: WA, borderRadius:7,
            width:26, height:26, flexShrink:0, fontSize:14, fontWeight:900,
            cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : .3,
            display:"flex", alignItems:"center", justifyContent:"center", padding:0,
          });
          return (
            <div style={{ marginTop:13 }}>
              {/* שורת כותרת — כותרת בצד אחד, חצים+מונה מקובצים בצד השני */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                marginBottom:6,
              }}>
                <span style={{ fontSize:11, fontWeight:700, color:textSub }}>📜 היסטוריית שליחות</span>
                {hasMultiple && (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {/* חץ ישן יותר (‹) */}
                    <button
                      onClick={() => setCarouselIdx(i => Math.min(sortedLog.length-1, i+1))}
                      disabled={safeIdx >= sortedLog.length-1}
                      title="ישן יותר"
                      style={navBtn(safeIdx < sortedLog.length-1)}
                    >‹</button>
                    <span style={{ fontSize:11, fontWeight:800, color:textSub, minWidth:34, textAlign:"center" }}>
                      {chronoNum}/{sortedLog.length}
                    </span>
                    {/* חץ חדש יותר (›) */}
                    <button
                      onClick={() => setCarouselIdx(i => Math.max(0, i-1))}
                      disabled={safeIdx === 0}
                      title="חדש יותר"
                      style={navBtn(safeIdx > 0)}
                    >›</button>
                  </div>
                )}
              </div>
              {/* כרטיס הרשומה — רוחב מלא */}
              <div style={{
                width:"100%", boxSizing:"border-box", padding:"11px 13px", borderRadius:9,
                background: isLight ? "#e8f9ee" : "#0d2418", border:`1px solid ${WA}44`,
              }}>
                <div style={{
                  fontSize:12, fontWeight:800, color: isLight ? "#0d7a3e" : "#5fd98a",
                  display:"flex", alignItems:"center", gap:6, marginBottom:6, flexWrap:"wrap",
                }}>
                  <span>✓ נשלח</span>
                  <span style={{ color:textSub, fontWeight:600 }}>·</span>
                  <span>{fmtSent(rec.at)}</span>
                  {rec.agent && <><span style={{ color:textSub, fontWeight:600 }}>·</span><span>{rec.agent}</span></>}
                </div>
                {(rec.template_label || rec.to_name) && (
                  <div style={{ fontSize:11, fontWeight:700, color:textSub, marginBottom:5 }}>
                    {rec.template_label && <span>תבנית: {rec.template_label}</span>}
                    {rec.to_name && <span>{rec.template_label ? " · " : ""}אל: {rec.to_name}{rec.to_number ? ` (${rec.to_number})` : ""}</span>}
                  </div>
                )}
                {rec.body && (
                  <div style={{
                    fontSize:12, lineHeight:1.6, color:textMain, whiteSpace:"pre-wrap",
                    wordBreak:"break-word", background: isLight ? "#ffffff" : "#0a1812",
                    border:`1px solid ${WA}22`, borderRadius:6, padding:"8px 10px", marginTop:4,
                    maxHeight:140, overflowY:"auto",
                  }}>
                    {rec.body}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* מודל בחירת נמען — "למי לשלוח ווטסאפ?" */}
      {showRecipient && (
        <div
          onClick={() => setShowRecipient(false)}
          style={{
            position:"fixed", inset:0, zIndex:1200,
            background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
            display:"flex", alignItems:"center", justifyContent:"center", padding:16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            dir="rtl"
            style={{
              background: isLight ? "#ffffff" : "#13132b", borderRadius:14, width:"100%", maxWidth:420,
              border:`1px solid ${cardBdr}`, boxShadow:"0 20px 60px rgba(0,0,0,.5)", overflow:"hidden",
            }}
          >
            <div style={{
              padding:"14px 18px", borderBottom:`1px solid ${cardBdr}`,
              display:"flex", alignItems:"center", justifyContent:"space-between",
              background: isLight ? "linear-gradient(135deg,#e8f9ee,#d8f5e2)" : "linear-gradient(135deg,#0a2418,#0d1f17)",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>💬</span>
                <span style={{ fontSize:14, fontWeight:900, color:textMain }}>למי לשלוח ווטסאפ?</span>
              </div>
              <button onClick={() => setShowRecipient(false)} style={{ background:"none", border:"none", color:textSub, fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ padding:"16px 18px" }}>
              <div style={{ fontSize:12, color:textSub, marginBottom:12 }}>
                בחר את המספר שאליו תישלח ההודעה:
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                {phoneOptions.map(opt => {
                  const active = opt.idx === recipientIdx;
                  return (
                    <label key={opt.idx} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"11px 13px",
                      borderRadius:9, cursor:"pointer",
                      background: active ? `${WA}18` : (isLight ? "#f4f6ff" : "#16162c"),
                      border:`1px solid ${active ? WA : cardBdr}`, transition:"all .12s",
                    }}>
                      <input
                        type="radio" name="wa-recipient" checked={active}
                        onChange={() => setRecipientIdx(opt.idx)}
                        style={{ width:16, height:16, accentColor:WA, cursor:"pointer" }}
                      />
                      <div style={{ display:"flex", flexDirection:"column", minWidth:0 }}>
                        <span style={{ fontSize:13, fontWeight:800, color:textMain }}>{opt.ownerName || "—"}</span>
                        <span style={{ fontSize:12, color:textSub, direction:"ltr", textAlign:"right" }}>{opt.number}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <button
                onClick={doSend}
                style={{
                  width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  background:`linear-gradient(135deg,${WA},#1eb858)`, color:"#fff",
                  border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:800,
                  cursor:"pointer", fontFamily:"inherit",
                }}
              >
                <span style={{ fontSize:16 }}>💬</span> שלח עכשיו
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── DropboxField — קישור לתיקיית מסמכי הלקוח ב-Dropbox ─────────────────────
   פתוח לעריכה לכל המשתמשים (יועץ + מתפעל).
   נשמר ב-Supabase בעמודת dropbox_url (text).
   ────────────────────────────────────────────────────────────────────────── */
function DropboxField({ value, onChange, clientId, theme:TH={}, DC, DBR, DT, DS, DI }) {
  const isLight = TH.name === "Light Mode";
  const txtColor = isLight ? "#1a1a3a" : (DT || "#e0e0f8");
  const ACCENT = "#0061ff"; // כחול Dropbox
  const [editing, setEditing] = useState(() => !value);
  const [draft,   setDraft]   = useState(value || "");
  const [saving,  setSaving]  = useState(false);
  const [flash,   setFlash]   = useState(false);

  useEffect(() => {
    setDraft(value || "");
    setEditing(!value);
  }, [value]);

  const normalizeUrl = (u) => {
    const t = (u || "").trim();
    if (!t) return "";
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };

  const handleSave = async () => {
    if (saving) return;
    const url = normalizeUrl(draft);
    setSaving(true);
    try {
      if (supabase && clientId) {
        const { error } = await supabase
          .from("clients")
          .update({ dropbox_url: url })
          .eq("id", clientId);
        if (error) { console.error("שגיאת DB בשמירת קישור Dropbox:", error.message); alert(`שגיאה בשמירה:\n${error.message}`); return; }
      }
      onChange && onChange(url);
      setEditing(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    } catch(err) {
      console.error("שגיאה לא צפויה בשמירת Dropbox:", err);
    } finally {
      setSaving(false);
    }
  };

  const openDropbox = () => {
    const url = normalizeUrl(value);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{
      marginTop:36,
      marginBottom:36,
      background: DC,
      border:`1px solid ${DBR}`,
      borderRadius:12, overflow:"hidden",
    }}>
      {/* כותרת */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"12px 16px", borderBottom:`1px solid ${DBR}`,
        background: isLight ? "linear-gradient(135deg,#eef4ff,#e8f0ff)" : "linear-gradient(135deg,#0a1428,#0e1830)",
      }}>
        <span style={{ fontSize:14, fontWeight:900, color:ACCENT, display:"flex", alignItems:"center", gap:7 }}>
          📂 מסמכים
        </span>
        {/* כפתור ערוך — כשיש קישור שמור ולא במצב עריכה */}
        {value && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              background:"transparent", border:`1px solid ${ACCENT}66`,
              color:ACCENT, borderRadius:6, padding:"4px 12px",
              fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background=ACCENT; e.currentTarget.style.color="#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=ACCENT; }}
          >📝 ערוך קישור</button>
        )}
        {flash && (
          <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700, animation:"fadeUp .2s ease" }}>
            ✓ נשמר בהצלחה
          </span>
        )}
      </div>

      {/* תוכן */}
      <div style={{ padding:"14px 16px" }}>
        {value && !editing ? (
          /* מצב צפייה — כפתור פתיחה קומפקטי */
          <button
            onClick={openDropbox}
            style={{
              display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7,
              padding:"8px 16px",
              background:`linear-gradient(135deg,${ACCENT},#0046c0)`,
              color:"#fff", border:"none", borderRadius:8,
              fontSize:13, fontWeight:700, cursor:"pointer",
              boxShadow:`0 2px 10px ${ACCENT}40`, transition:"opacity .15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity=".88"}
            onMouseLeave={e => e.currentTarget.style.opacity="1"}
          >
            <span style={{ fontSize:15 }}>📂</span>
            פתח תיקיית לקוח ב-Dropbox
          </button>
        ) : (
          /* מצב עריכה — שדה קלט */
          <div>
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key==="Enter" && handleSave()}
              placeholder="הדבק כאן קישור לתיקיית הדרופבוקס של הלקוח…"
              dir="ltr"
              style={{
                width:"100%", boxSizing:"border-box", padding:"10px 12px",
                background: DI, border:`1.5px solid ${ACCENT}55`, borderRadius:9,
                color: txtColor, WebkitTextFillColor: txtColor, opacity:1,
                fontSize:13, outline:"none", fontFamily:"inherit", marginBottom:10,
                textAlign:"left",
              }}
              onFocus={e => e.target.style.borderColor=ACCENT}
              onBlur={e => e.target.style.borderColor=ACCENT+"55"}
            />
            <button
              onClick={handleSave}
              disabled={saving || !draft.trim()}
              style={{
                background: (saving || !draft.trim()) ? "#888" : `linear-gradient(135deg,${ACCENT},#0046c0)`,
                color:"#fff", border:"none", borderRadius:7,
                padding:"9px 22px", fontSize:12, fontWeight:800,
                cursor: (saving || !draft.trim()) ? "default" : "pointer",
                boxShadow:`0 3px 12px ${ACCENT}44`, transition:"opacity .15s",
              }}
              onMouseEnter={e => { if (!saving && draft.trim()) e.currentTarget.style.opacity=".85"; }}
              onMouseLeave={e => e.currentTarget.style.opacity="1"}
            >{saving ? "שומר…" : "💾 שמור קישור"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── כרטיסיית ביטחונות ──────────────────────────────────────────────────── */
const SEC_FIELDS = [
  { key:"approval",      label:"נשלח WhatsApp", icon:"💬", placeholder:"תאריך / פרטים…", dateKey:"collateral_approval_date",  doneKey:"collateral_approval_completed" },
  { key:"appraisal",     label:"נשלח Email",    icon:"✉️", placeholder:"תאריך / פרטים…", dateKey:"collateral_appraisal_date", doneKey:"collateral_appraisal_completed" },
];

/* ─── צ'ק-ליסט לאחר צירוף הלקוח — 7 שלבי תהליך מכירת נכס ──────────────────
   משתמש באותו רכיב SecuritiesCard בדיוק (אותה חוויית checkbox אינטראקטיבית),
   רק עם מערך שדות שונה ו-data/checks המגיעים מ-client.post_onboarding_checks
   במקום client.securities. אין כאן dateKey כי השלבים האלה הם milestones
   בינאריים (בוצע/לא בוצע) ולא דורשים תאריך ביצוע נפרד כמו הצ'ק-ליסט הראשון.
   ──────────────────────────────────────────────────────────────────────── */
const ONBOARDING_FIELDS = [
  { key:"agent_found",       label:"אותר מתווך מתאים",                  icon:"🔍", placeholder:"פרטים…", dateKey:"po_agent_found_date",       doneKey:"po_agent_found" },
  { key:"meeting_scheduled", label:"נקבעה פגישה עם המתווך והבעלים",     icon:"🤝", placeholder:"פרטים…", dateKey:"po_meeting_scheduled_date", doneKey:"po_meeting_scheduled" },
  { key:"wants_other_agent", label:"רוצים מתווך אחר",                   icon:"🔄", placeholder:"פרטים…", dateKey:"po_wants_other_agent_date", doneKey:"po_wants_other_agent" },
  { key:"buyer_found",       label:"המתווך מצא קונה",                   icon:"🎯", placeholder:"פרטים…", dateKey:"po_buyer_found_date",       doneKey:"po_buyer_found" },
  { key:"with_lawyer",       label:"הנכס בטיוטות אצל עו״ד",             icon:"⚖️", placeholder:"פרטים…", dateKey:"po_with_lawyer_date",       doneKey:"po_with_lawyer" },
  { key:"property_sold",     label:"הנכס נמכר",                         icon:"🏡", placeholder:"פרטים…", dateKey:"po_property_sold_date",     doneKey:"po_property_sold" },
  { key:"fee_paid",          label:"העמלה שלנו שולמה",                  icon:"💵", placeholder:"פרטים…", dateKey:"po_fee_paid_date",          doneKey:"po_fee_paid" },
];

function SecuritiesCard({ data, onChange, dates={}, onDateChange, checks={}, onCheckChange, isAdvisor=false, theme:TH={}, readOnly=false, fields=SEC_FIELDS, title="צ׳ק-ליסט שלבי התיק", titleIcon="🛡️" }) {
  const [activeField, setActiveField] = useState(null);
  const [draft,       setDraft]       = useState("");
  const [flash,       setFlash]       = useState(null);

  const isLight  = TH.name === "Light Mode";
  const cardBg   = TH.drawerCard    || "#12122a";
  const cardBdr  = TH.drawerBorder  || "#2a2a48";
  const inputBg  = TH.drawerInput   || "#1a1a2e";
  const textMain = TH.drawerText    || "#d8d8f0";
  const textSub  = TH.drawerSubText || "#8080b0";
  const hoverBg  = isLight ? "#f0f4ff" : "#1a1a35";
  const editBg   = isLight ? "#eef2ff" : "#0e0e28";
  const footBg   = isLight ? "#edf0f8" : "#0d0d1e";
  const rowBdr   = isLight ? "#d8ddf0" : "#1e1e3a";
  const emptyDot = isLight ? "#c8d0e8" : "#2a2a50";
  const GOLD     = "#22a060";   // ירוק במקום צהוב-זהב

  const fmtDate = (d) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("he-IL", { day:"2-digit", month:"2-digit", year:"2-digit" }).replace(/\//g, ".");
    } catch { return d; }
  };

  const startEdit = (key) => { if (readOnly) return; setActiveField(key); setDraft(data[key] || ""); };
  const commit = (key) => {
    onChange(key, draft.trim());
    setActiveField(null);
    setFlash(key);
    setTimeout(() => setFlash(null), 1400);
  };
  const cancel = () => setActiveField(null);

  return (
    <div style={{
      background:cardBg, borderRadius:12,
      border:`1px solid ${GOLD}66`, marginTop:36, marginBottom:36, overflow:"hidden",
    }}>
      {/* כותרת */}
      <div style={{
        background: isLight ? "linear-gradient(135deg,#e8f8ef,#d8f4e8)" : "linear-gradient(135deg,#0a2a18,#0d2020)",
        borderBottom:`1px solid ${GOLD}55`,
        padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
      }}>
        <span style={{ fontSize:16 }}>{titleIcon}</span>
        <span style={{ fontSize:13, fontWeight:900, color:GOLD, letterSpacing:.5, textTransform:"uppercase" }}>{title}</span>
      </div>

      {/* שורות */}
      <div style={{ padding:"4px 0" }}>
        {fields.map((f, idx) => {
          const isEditing = activeField === f.key;
          const hasValue  = data[f.key]?.trim();
          const isFlash   = flash === f.key;
          const isLast    = idx === fields.length - 1;

          return (
            <div key={f.key} style={{ borderBottom: isLast ? "none" : `1px solid ${rowBdr}`, padding:0 }}>
              {/* ── שדה כפול (ביטוחים) — כותרת עם V ראשי + תתי-שדות טקסט+תאריך ── */}
              {f.dual ? (
                <div style={{ padding:0 }}>
                  {/* כותרת השורה — זהה לשאר השורות, עם V ראשי בצד ימין */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px" }}>
                    <span style={{ fontSize:14, flexShrink:0 }}>{f.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:textSub, minWidth:100, flexShrink:0 }}>{f.label}</span>
                    <span style={{ flex:1 }} />
                    {/* V ראשי — insurance_completed */}
                    {(() => {
                      const done = !!checks[f.doneKey];
                      return (
                        <span
                          onClick={() => { if (!isAdvisor) onCheckChange && onCheckChange(f.doneKey, !done); }}
                          title={done ? "בוצע" : "טרם בוצע"}
                          style={{
                            width:20, height:20, borderRadius:6, flexShrink:0,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            background: done ? "#22a060" : "transparent",
                            border:`2px solid ${done ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                            color:"#fff", fontSize:13, fontWeight:900,
                            cursor: isAdvisor ? "default" : "pointer",
                            transition:"all .15s",
                            boxShadow: done ? "0 0 8px #22a06066" : "none",
                          }}
                        >{done ? "✓" : ""}</span>
                      );
                    })()}
                  </div>

                  {/* תתי-שדות — ביטוח חיים / ביטוח נכס */}
                  <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"0 16px 12px 16px", marginRight:8 }}>
                    {f.subFields.map(sf => (
                      <div key={sf.notesKey} style={{
                        paddingRight:16, borderRight:`2px solid ${rowBdr}`,
                        display:"flex", flexDirection:"column", gap:6,
                      }}>
                        <span style={{ fontSize:11, fontWeight:700, color:textSub }}>{sf.label}</span>
                        <input
                          type="text"
                          value={dates[sf.notesKey] || ""}
                          onChange={e => onDateChange && onDateChange(sf.notesKey, e.target.value)}
                          placeholder={`פרטי ${sf.label}…`}
                          dir="rtl"
                          disabled={isAdvisor}
                          style={{
                            width:"100%", boxSizing:"border-box",
                            fontSize:12, color:textMain, WebkitTextFillColor:textMain, opacity:1,
                            background:inputBg, border:`1px solid ${rowBdr}`, borderRadius:7,
                            padding:"7px 10px", outline:"none", fontFamily:"inherit",
                          }}
                        />
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:11, color:textSub, opacity:.8, flexShrink:0 }}>התבצע בתאריך:</span>
                          <input
                            type="date"
                            value={dates[sf.dateKey] || ""}
                            onChange={e => onDateChange && onDateChange(sf.dateKey, e.target.value)}
                            dir="rtl"
                            disabled={isAdvisor}
                            style={{
                              fontSize:11,
                              color: dates[sf.dateKey] ? textMain : textSub,
                              WebkitTextFillColor: dates[sf.dateKey] ? textMain : textSub,
                              opacity:1,
                              background:"transparent", border:`1px solid ${rowBdr}`, borderRadius:6,
                              padding:"4px 7px", outline:"none", fontFamily:"inherit",
                              cursor: isAdvisor ? "default" : "pointer",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (<>
              {!isEditing && (
                <div onClick={() => startEdit(f.key)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", cursor:"pointer", transition:"background .12s" }}
                  onMouseEnter={e => e.currentTarget.style.background=hoverBg}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:14, flexShrink:0 }}>{f.icon}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:textSub, minWidth:100, flexShrink:0 }}>{f.label}</span>
                  <span style={{
                    fontSize:13, flex:1, textAlign:"right",
                    color: hasValue ? textMain : (isLight ? "#b0b8cc" : "#3a3a60"),
                    fontStyle: hasValue ? "normal" : "italic", transition:"color .15s",
                  }}>
                    {hasValue || "לחץ למילוי…"}
                  </span>
                  {/* תיבת סימון — V ירוק, מתפעל בלבד */}
                  {(() => {
                    const done = !!checks[f.doneKey];
                    return (
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          if (isAdvisor) return;
                          onCheckChange && onCheckChange(f.doneKey, !done);
                        }}
                        title={done ? "בוצע" : "טרם בוצע"}
                        style={{
                          width:20, height:20, borderRadius:6, flexShrink:0,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          background: done ? "#22a060" : "transparent",
                          border:`2px solid ${done ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                          color:"#fff", fontSize:13, fontWeight:900,
                          cursor: isAdvisor ? "default" : "pointer",
                          transition:"all .15s",
                          boxShadow: done ? "0 0 8px #22a06066" : "none",
                        }}
                      >{done ? "✓" : ""}</span>
                    );
                  })()}
                  {isFlash && <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700 }}>✓</span>}
                </div>
              )}

              {/* שדה תאריך ביצוע — עדין, מתפעל בלבד */}
              {!isEditing && (
                <div style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"0 16px 9px 16px", marginTop:-4,
                }}>
                  <span style={{ fontSize:11, color:textSub, opacity:.8, flexShrink:0 }}>התבצע בתאריך:</span>
                  {isAdvisor ? (
                    /* יועץ — תצוגה בלבד בפורמט עברי DD.MM.YY */
                    <span style={{ fontSize:11, color: dates[f.dateKey] ? textMain : textSub, fontWeight:600 }}>
                      {dates[f.dateKey] ? fmtDate(dates[f.dateKey]) : "—"}
                    </span>
                  ) : (
                    /* מתפעל — בחירת תאריך + כפתור מחיקה */
                    <>
                      <input
                        type="date"
                        value={dates[f.dateKey] || ""}
                        onChange={e => onDateChange && onDateChange(f.dateKey, e.target.value)}
                        dir="rtl"
                        style={{
                          fontSize:11,
                          color: dates[f.dateKey] ? textMain : textSub,
                          WebkitTextFillColor: dates[f.dateKey] ? textMain : textSub,
                          opacity:1,
                          background:"transparent",
                          border:`1px solid ${rowBdr}`,
                          borderRadius:5, padding:"3px 7px",
                          outline:"none", fontFamily:"inherit",
                          cursor:"pointer",
                        }}
                      />
                      {dates[f.dateKey] && (
                        <button
                          onClick={() => onDateChange && onDateChange(f.dateKey, "")}
                          title="נקה תאריך"
                          style={{
                            background:"none", border:"none", color:"#c04444",
                            fontSize:13, fontWeight:700, cursor:"pointer",
                            padding:"0 2px", lineHeight:1, flexShrink:0,
                          }}
                        >✕</button>
                      )}
                    </>
                  )}
                </div>
              )}

              {isEditing && (
                <div style={{ padding:"10px 14px", background:editBg }}>
                  <div style={{ fontSize:11, color:GOLD, fontWeight:700, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                    <span>{f.icon}</span><span>{f.label}</span>
                  </div>
                  <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                    placeholder={f.placeholder} dir="rtl" rows={2}
                    style={baseInput({ resize:"none", lineHeight:1.6, border:`1px solid ${GOLD}66`,
                      background:inputBg, color:textMain, fontSize:13 })}
                    onKeyDown={e => {
                      if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); commit(f.key); }
                      if (e.key==="Escape") cancel();
                    }}
                  />
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <button onClick={() => commit(f.key)} style={{
                      background:"linear-gradient(135deg,#8a6914,#d4a827)",
                      color:"#fff", border:"none", borderRadius:6,
                      padding:"6px 18px", fontSize:12, fontWeight:800, cursor:"pointer",
                    }}>✓ שמור</button>
                    <button onClick={cancel} style={{
                      background:inputBg, color:textSub,
                      border:`1px solid ${cardBdr}`, borderRadius:6,
                      padding:"6px 12px", fontSize:12, cursor:"pointer",
                    }}>ביטול</button>
                    <span style={{ fontSize:10, color:textSub, alignSelf:"center", marginRight:4 }}>Enter לשמירה · Esc לביטול</span>
                  </div>
                </div>
              )}
              </>)}
            </div>
          );
        })}
      </div>

      {/* סיכום */}
      <div style={{
        borderTop:`1px solid ${rowBdr}`, padding:"7px 16px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:footBg,
      }}>
        <span style={{ fontSize:11, color:textSub }}>
          {fields.filter(f => checks[f.doneKey]).length} / {fields.length} שדות מולאו
        </span>
        <div style={{ display:"flex", gap:4 }}>
          {fields.map(f => (
            <div key={f.key} style={{
              width:20, height:4, borderRadius:2,
              background: checks[f.doneKey] ? "#22a060" : emptyDot,
              transition:"background .3s",
            }} title={f.label} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── כרטיסיית פרטי הנכס למכירה ──────────────────────────────────────────── */
/* ─── שדה הערות המוכר במודעה — Textarea מתרחב עם שמירה אוטומטית ב-blur ──────
   רכיב נפרד (לא inline) כדי למנוע איבוד פוקוס בזמן הקלדת פסקאות ארוכות:
   רכיב מוגדר-inline מקבל זהות חדשה בכל render ועלול לגרום ל-React למאונט מחדש
   את ה-textarea ולאבד את הסמן. כאן ה-state מקומי ונשמר רק ב-blur. */
function PropertyNotesField({ value, onSave, label, icon, inputBg, cardBdr, textMain, textSub }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  return (
    <div style={{ gridColumn:"1 / -1" }}>
      <label style={{ fontSize:11, fontWeight:700, color:textSub, marginBottom:5, display:"flex", alignItems:"center", gap:5 }}>
        <span>{icon}</span>{label}
      </label>
      <textarea
        className="wiseli-prop-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value || "")) onSave(draft); }}
        placeholder="הדבק כאן את תיאור המודעה המלא של המוכר…"
        dir="rtl"
        rows={3}
        style={{
          width:"100%", boxSizing:"border-box", fontSize:13, lineHeight:1.6,
          color:textMain,
          background:inputBg, border:`1px solid ${cardBdr}`, borderRadius:7,
          padding:"9px 11px", outline:"none", fontFamily:"inherit",
          resize:"vertical", minHeight:64,
        }}
      />
    </div>
  );
}

/* ─── שדה טקסט בודד בכרטיסיית הנכס — רכיב top-level (לא inline!) ────────────
   קריטי: הרכיב הזה חייב להיות מוגדר ברמת המודול ולא בתוך PropertyDetailsCard.
   כשהוא היה מוגדר inline, כל הקלדה גרמה ל-onUpdate→render→זהות-פונקציה-חדשה,
   ו-React מאונט מחדש את ה-<input> ומאבד פוקוס אחרי כל תו. כרכיב יציב ברמת
   המודול, ה-<input> נשאר ממואנט והפוקוס נשמר. */
function PropertyTextField({ value, onChange, label, icon, type="text", placeholder="", inputBg, cardBdr, textMain, textSub }) {
  const isDate = type === "date";
  // סגנון בסיס זהה לחלוטין לכל סוגי השדות — גובה, padding, גבול ויישור אנכי.
  // הערה: לא קובעים WebkitTextFillColor כאן — הוא דרס את צבע ה-::placeholder ב-WebKit
  // (Safari/iOS) וגרם ל-placeholder להיראות כהה כמו טקסט אמיתי.
  const baseInputStyle = {
    width:"100%", boxSizing:"border-box", fontSize:13, height:38, lineHeight:"20px",
    color: (isDate && !value) ? textSub : textMain,
    background:inputBg, border:`1px solid ${cardBdr}`, borderRadius:7,
    padding:"0 11px", outline:"none", fontFamily:"inherit",
    display:"block", margin:0, verticalAlign:"middle",
    // איפוס מראה ברירת-המחדל של input[type=date] בספארי/וובקיט כדי שיתנהג כמו שדה טקסט
    WebkitAppearance:"none", MozAppearance:"textfield", appearance:"none",
  };
  return (
    <div>
      <label style={{ fontSize:11, fontWeight:700, color:textSub, marginBottom:5, display:"flex", alignItems:"center", gap:5 }}>
        <span>{icon}</span>{label}
      </label>
      {isDate ? (
        // שדה תאריך — עטיפה בגובה קבוע זהה לשדות הטקסט, עם כפתור ניקוי
        <div style={{ position:"relative", width:"100%", height:38 }}>
          <input
            className="wiseli-prop-input"
            type="date"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            dir="rtl"
            style={{ ...baseInputStyle, paddingLeft: value ? 30 : 11 }}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              title="נקה תאריך"
              style={{
                position:"absolute", left:6, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:textSub, fontSize:15,
                cursor:"pointer", padding:"0 4px", lineHeight:1,
              }}
            >✕</button>
          )}
        </div>
      ) : (
        <input
          className="wiseli-prop-input"
          type={type}
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          dir={type==="number" ? "ltr" : "rtl"}
          style={baseInputStyle}
        />
      )}
    </div>
  );
}

function PropertyDetailsCard({ client, onUpdate, theme:TH={} }) {
  const isLight  = TH.name === "Light Mode";
  const cardBg   = TH.drawerCard    || "#12122a";
  const cardBdr  = TH.drawerBorder  || "#2a2a48";
  const inputBg  = TH.drawerInput   || "#1a1a2e";
  const textMain = TH.drawerText    || "#d8d8f0";
  const textSub  = TH.drawerSubText || "#8080b0";
  const TEAL     = "#1a8a8a";

  const set = (field, val) => onUpdate && onUpdate(client.id, field, val);

  // עזר ליצירת שדה — מעביר את כל ה-props היציבים לרכיב ה-top-level
  const fld = (field, label, icon, opts={}) => (
    <PropertyTextField
      value={client[field]}
      onChange={val => set(field, val)}
      label={label} icon={icon}
      type={opts.type || "text"} placeholder={opts.placeholder || ""}
      inputBg={inputBg} cardBdr={cardBdr} textMain={textMain} textSub={textSub}
    />
  );

  return (
    <div style={{
      background:cardBg, borderRadius:12,
      border:`1px solid ${TEAL}66`, marginTop:24, marginBottom:24, overflow:"hidden",
    }}>
      {/* צבע placeholder אחיד ועדין לכל שדות הכרטיסייה (input + textarea).
          !important מבטיח שהכלל ינצח כל צבע טקסט שמוגדר inline על השדה. */}
      <style>{`
        .wiseli-prop-input::placeholder{color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;opacity:1 !important;-webkit-text-fill-color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;}
        .wiseli-prop-input::-webkit-input-placeholder{color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;-webkit-text-fill-color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;}
      `}</style>
      {/* כותרת */}
      <div style={{
        background: isLight ? "linear-gradient(135deg,#e8f6f6,#d8f0f0)" : "linear-gradient(135deg,#0a2424,#0d1f1f)",
        borderBottom:`1px solid ${TEAL}55`,
        padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
      }}>
        <span style={{ fontSize:16 }}>🏠</span>
        <span style={{ fontSize:13, fontWeight:900, color:TEAL, letterSpacing:.5, textTransform:"uppercase" }}>פרטי הנכס למכירה</span>
      </div>

      {/* גריד שדות — 2 עמודות, RTL (השדה הראשון בכל זוג מופיע מימין) */}
      <div style={{
        padding:"16px", display:"grid",
        gridTemplateColumns:"1fr 1fr", gap:16,
      }}>
        {/* שורה 1: רחוב + מספר בית */}
        {fld("property_street",       "רחוב",            "📍", { placeholder:"שם הרחוב…" })}
        {fld("property_house_number", "מספר בית",        "🔢", { placeholder:"מס׳…" })}
        {/* שורה 2: שכונה + עיר */}
        {fld("property_neighborhood", "שכונה",           "🏘️", { placeholder:"שם השכונה…" })}
        {fld("property_city",         "עיר",             "🏙️", { placeholder:"שם העיר…" })}
        {/* שורה 3: גודל בנוי במ״ר + מספר חדרים */}
        {fld("property_size_sqm",     "גודל בנוי במ״ר",  "📐", { type:"number", placeholder:"0" })}
        {fld("property_rooms",        "מספר חדרים",      "🛏️", { type:"number", placeholder:"0" })}
        {/* שורה 4: קומה + סוג הנכס */}
        {fld("property_floor",        "קומה",            "🏢", { placeholder:"קרקע / 1 / 2…" })}
        {fld("property_type",         "סוג הנכס",        "🏠", { placeholder:"דירה / פנטהאוז…" })}
        {/* שורה 5: מרפסת + ממ״ד */}
        {fld("property_balcony",      "מרפסת",           "🌿", { placeholder:"מרפסת שמש 12 מ״ר…" })}
        {fld("property_mamad",        "ממ״ד",            "🛡️", { placeholder:"יש / אין / תיאור…" })}
        {/* שורה 6: חניה + מעלית */}
        {fld("property_parking",      "חניה",            "🚗", { placeholder:"חניה כפולה מקורה…" })}
        {fld("property_elevator",     "מעלית",           "🛗", { placeholder:"יש מעלית / אין…" })}
        {/* שורה 7: מצב הנכס + מחיר מבוקש */}
        {fld("property_condition",    "מצב הנכס",        "🛠️", { placeholder:"חדש / משופץ…" })}
        {fld("property_price",        "מחיר מבוקש",      "💰", { type:"number", placeholder:"₪" })}
        {/* שורה 8: נמצאת בשוק מאז + פורסם ב- */}
        {fld("property_on_market_since", "נמצאת בשוק מאז", "📅", { type:"date" })}
        {fld("property_published_on", "פורסם ב-",        "📰", { placeholder:"יד2 / פייסבוק / מדלן…" })}
        {/* שורה 9: לינק למודעה — רוחב מלא */}
        <div style={{ gridColumn:"1 / -1" }}>
          <PropertyTextField
            value={client.property_ad_link}
            onChange={val => set("property_ad_link", val)}
            label="לינק למודעה" icon="🔗"
            placeholder="הדבק כאן קישור ישיר למודעה (יד2, פייסבוק, מדלן וכו')..."
            inputBg={inputBg} cardBdr={cardBdr} textMain={textMain} textSub={textSub}
          />
        </div>
        {/* שורה 10: הערות המוכר במודעה — רוחב מלא */}
        <PropertyNotesField
          value={client.property_seller_notes}
          onSave={val => set("property_seller_notes", val)}
          label="הערות המוכר במודעה"
          icon="📝"
          inputBg={inputBg} cardBdr={cardBdr} textMain={textMain} textSub={textSub}
        />
      </div>
    </div>
  );
}

/* ─── מגירת לוח זמנים + עריכת פרטים מלאה ───────────────────────────────── */
function TimelineDrawer({ client, onClose, onAddNote, onUpdate, onNotesUpdate, onDelete, onDuplicate, readOnly=false, isAdmin=false, advisors=[], waTemplates=[], myName="", phases=null, theme:TH={}, fontSizes={} }) {
  const phaseList = Array.isArray(phases) && phases.length ? phases : PHASES;
  const phaseMap = phaseList.reduce((m, p) => { m[p.id] = p; return m; }, {});
  const phase = phaseMap[client.phase] || phaseList[0] || PHASES[0];

  // צבעי פאנל
  const DB  = TH.drawerBg      || "#10101f";
  const DC  = TH.drawerCard    || "#16162c";
  const DBR = TH.drawerBorder  || "#2a2a48";
  const DT  = TH.drawerText    || "#e0e0f8";
  const DS  = TH.drawerSubText || "#6060a0";
  const DI  = TH.drawerInput   || "#1a1a2e";

  // גדלי כתב מותאמים אישית
  const dtSize  = fontSizes.drawerText || 13;
  const dsSize  = fontSizes.drawerSub  || 11;

  // ── מצב עריכה כללי ──
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState(null);   // עותק עריכה של הלקוח
  const [savedFlash, setSavedFlash] = useState(false);

  // ── עדכון טקסטואלי ──
  const [note, setNote] = useState("");

  /* פתיחת מצב עריכה – מעתיק את כל שדות הלקוח */
  const startEdit = () => {
    if (readOnly) return;
    const sp = (!(client.first_name||"").trim() && !(client.last_name||"").trim() && (client.name||"").trim())
      ? splitName(client.name) : { first_name: client.first_name||"", last_name: client.last_name||"" };
    setDraft({
      name:      client.name,
      first_name: sp.first_name,
      last_name:  sp.last_name,
      handler:   client.handler   || "",
      opFor:     client.opFor     || "",
      emails_list: client.emails_list?.length ? client.emails_list.map(e=>({...e})) : [{ name:"", email:"" }],
      fee:       client.fee       || "",
      case_type: client.case_type || "",
      banks:     Array.isArray(client.banks) ? [...client.banks] : [],
      phones:    client.phones?.length ? client.phones.map(p=>({...p})) : [{ number:"", ownerName:"" }],
      tids:      client.tids?.length   ? client.tids.map(t=>({...t}))   : [{ number:"", ownerName:"" }],
    });
    setEditing(true);
  };

  /* שמירת העריכה — עדכון אטומי אחד למניעת race conditions */
  const commitEdit = () => {
    try {
      if (!client?.id) { alert("שגיאה: מזהה לקוח חסר"); return; }
      const fn = (draft.first_name || "").trim();
      const ln = (draft.last_name  || "").trim();
      const patch = {
        first_name: fn,
        last_name:  ln,
        name:      [fn, ln].filter(Boolean).join(" ") || (draft.name || "").trim() || client.name,
        handler:   (draft.handler  || "").trim(),
        opFor:     (draft.opFor    || "").trim(),
        emails_list: (draft.emails_list || []).filter(e => (e?.email||"").trim()),
        fee:       (draft.fee      || "").trim(),
        case_type: (draft.case_type|| "").trim(),
        banks:     (draft.banks    || []).filter(b => (b||"").trim()),
        phones:    (draft.phones   || []).filter(p => (p?.number||"").trim()),
        tids:      (draft.tids     || []).filter(t => (t?.number||"").trim()),
      };
      if (typeof onUpdate === "function") {
        onUpdate(client.id, patch);
      }
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch(err) {
      console.error("שגיאה ב-commitEdit:", err);
      alert(`שגיאה בשמירת פרטי לקוח:\n${err?.message || err}`);
    }
  };

  const cancelEdit = () => setEditing(false);

  /* עדכון שדה בתוך draft */
  const setDraftField = (field, val) => setDraft(d => ({ ...d, [field]: val }));

  /* שמירת הערת ציר זמן */
  const saveNote = () => {
    try {
      const t = (note || "").trim();
      if (!t) return;
      if (typeof onAddNote !== "function") {
        console.error("onAddNote אינה פונקציה");
        return;
      }
      onAddNote(client?.id, t);
      setNote("");
    } catch(err) {
      console.error("שגיאה בשמירת עדכון:", err);
      alert("אירעה שגיאה בשמירה — " + (err?.message || err));
    }
  };

  /* תצוגת זוגות (view mode) */
  const renderPairs = (pairs=[]) =>
    (pairs.length===0) ? <span style={{ color:DS }}>—</span> :
    pairs.map((p,i) => (
      <div key={i} style={{ marginBottom:4 }}>
        <span style={{ color:DT, fontSize:dtSize }}>{p.number||"—"}</span>
        {p.ownerName && (
          <span style={{ color:DS, fontSize:dsSize, marginRight:7 }}>({p.ownerName})</span>
        )}
      </div>
    ));

  /* ─── סגנונות מקומיים ─── */
  const sectionBox = {
    background:DC, borderRadius:10, padding:16,
    marginBottom:36, border:`1px solid ${DBR}`,
  };
  const fieldRow = {
    display:"flex", justifyContent:"space-between",
    alignItems:"flex-start", padding:"9px 0",
    borderBottom:`1px solid ${DBR}`,
  };
  const fieldLabel = {
    fontSize:dsSize, color:DS, fontWeight:700,
    flexShrink:0, marginLeft:14, paddingTop:2, minWidth:72,
  };
  const fieldValue = {
    fontSize:dtSize, color:DT, flex:1, textAlign:"right", lineHeight:1.55,
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.65)",
      display:"flex", justifyContent:"flex-end", zIndex:900,
    }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div dir="rtl" style={{
        background:DB, width:500, maxWidth:"96vw", height:"100%",
        overflowY:"auto", borderRight:`2px solid ${DBR}`,
        padding:"26px 22px 40px", boxSizing:"border-box",
        animation:"slideIn .22s ease",
        color:DT,
      }}>

        {/* ── תווית עליונה קבועה ── */}
        <div style={{
          fontSize:11, fontWeight:800, letterSpacing:1, color:DS,
          textTransform:"uppercase", marginBottom:10, opacity:.85,
        }}>כרטיסיית מוכר</div>

        {/* ── כותרת + כפתורים ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div style={{ flex:1 }}>
            {/* שם המוכר — שם פרטי + משפחה זה לצד זה (עריכה), משולב בתצוגה */}
            {editing ? (
              <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                <input
                  value={draft.first_name}
                  onChange={e => setDraftField("first_name", e.target.value)}
                  placeholder="שם פרטי"
                  dir="rtl"
                  style={{
                    fontSize:16, fontWeight:900, padding:"5px 10px",
                    background:DI, border:`1px solid ${phase.color}66`, color:DT,
                    borderRadius:6, outline:"none", flex:1, minWidth:0,
                    boxSizing:"border-box", fontFamily:"inherit",
                  }}
                />
                <input
                  value={draft.last_name}
                  onChange={e => setDraftField("last_name", e.target.value)}
                  placeholder="שם משפחה"
                  dir="rtl"
                  style={{
                    fontSize:16, fontWeight:900, padding:"5px 10px",
                    background:DI, border:`1px solid ${phase.color}66`, color:DT,
                    borderRadius:6, outline:"none", flex:1, minWidth:0,
                    boxSizing:"border-box", fontFamily:"inherit",
                  }}
                />
              </div>
            ) : (
              <h2 style={{ margin:"0 0 8px", fontSize:20, fontWeight:900, color:DT }}>
                {fullName(client)}
              </h2>
            )}
            <span style={{ fontSize:14, fontWeight:600, color:DS, marginLeft:6 }}>שלב התיק:</span>
            <span style={{
              color:phase.color,
              fontSize:20, fontWeight:700,
            }}>{phase.label}</span>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
            {readOnly ? (
              <span style={{
                background:"#e8a83822", color:"#b07818",
                border:"1px solid #e8a83866",
                borderRadius:6, padding:"4px 10px",
                fontSize:11, fontWeight:700,
              }}>👁️ צפייה בלבד</span>
            ) : (
              !editing && (
                <button onClick={startEdit} title="ערוך פרטי לקוח" style={{
                  background:DI, border:`1px solid ${DBR}`,
                  color:DS, borderRadius:7, padding:"6px 14px",
                  fontSize:12, fontWeight:700, cursor:"pointer",
                }}>ערוך</button>
              )
            )}
            <button onClick={onClose} style={{
              background:"none", border:"none", color:DS, fontSize:22, cursor:"pointer",
            }}>✕</button>
          </div>
        </div>

        {/* ── סוג התיק — אלמנט כותרת עדין ── */}
        {client.case_type && (
          <div style={{
            display:"flex", flexDirection:"row", alignItems:"center", gap:8,
            padding:"10px 0 4px", marginBottom:2,
          }}>
            <span style={{ display:"flex", flexShrink:0 }}><BriefcaseIcon size={15} color={DS} /></span>
            <span style={{ fontSize:13, fontWeight:600, color:DS, flexShrink:0 }}>סוג התיק:</span>
            <span style={{ fontSize:13, fontWeight:700, color: TH.name==="Light Mode" ? "#1a1a3a" : (DT||"#e0e0f8") }}>
              {client.case_type}
            </span>
          </div>
        )}

        {/* ── הודעת "נשמר" ── */}
        {savedFlash && (
          <div style={{
            background:"#1a3a20", border:"1px solid #2d7a3a",
            borderRadius:8, padding:"8px 14px", marginBottom:14,
            color:"#3dba7e", fontSize:13, fontWeight:700,
            display:"flex", alignItems:"center", gap:8,
            animation:"fadeUp .2s ease",
          }}>✓ פרטי הלקוח עודכנו בהצלחה</div>
        )}

        {/* ══════════════════════════ VIEW MODE ══════════════════════════ */}
        {!editing && (
          <div style={sectionBox}>
            {/* כותרת "פרטי המוכר" — תואמת בסגנון לבאנר "פרטי הנכס למכירה" */}
            <div style={{
              background: TH.name==="Light Mode" ? "linear-gradient(135deg,#e8f6f6,#d8f0f0)" : "linear-gradient(135deg,#0a2424,#0d1f1f)",
              borderBottom:`1px solid #1a8a8a55`,
              padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
              margin:"-16px -16px 14px", borderRadius:"10px 10px 0 0",
            }}>
              <span style={{ fontSize:16 }}>👤</span>
              <span style={{ fontSize:13, fontWeight:900, color:"#1a8a8a", letterSpacing:.5, textTransform:"uppercase" }}>פרטי המוכר</span>
            </div>
            {/* שיוך לסוכן — נגיש לעריכה רק לאדמין/סופר-אדמין. תחת ה-RLS המעודכן,
                is_admin_or_super() מורשה במפורש לכתוב כל ערך advisor_email (כולל
                "לידים ולקוחות למיון" בעת הסרת סוכן) — לכן זה בטוח להציג ולערוך כאן
                רק כש-isAdmin===true. איש מכירות לא רואה את הבורר הזה כלל. */}
            {isAdmin && advisors.length > 0 && (
              <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                <span style={fieldLabel}>👤 משויך לסוכן</span>
                <select
                  value={client.advisor_email || ""}
                  onChange={e => onUpdate && onUpdate(client.id, "advisor_email", e.target.value)}
                  dir="rtl"
                  style={{
                    flex:1, background:DI, border:`1px solid ${DBR}`,
                    borderRadius:6, color:DT, padding:"6px 10px",
                    fontSize:dtSize, outline:"none", fontFamily:"inherit",
                    cursor:"pointer", maxWidth:200,
                  }}
                >
                  <option value="">— לא משויך —</option>
                  {advisors.map(a => (
                    <option key={a.email} value={a.email}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* טלפונים */}
            <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
              <span style={fieldLabel}>📱 טלפון</span>
              <div style={{ flex:1, textAlign:"right" }}>{renderPairs(client.phones)}</div>
            </div>
            {/* אימייל */}
            <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
              <span style={fieldLabel}>✉️ אימייל</span>
              <div style={{ flex:1, textAlign:"right" }}>
                {(() => {
                  const list = Array.isArray(client.emails_list) ? client.emails_list.filter(e => (e?.email||"").trim()) : [];
                  if (list.length === 0) return <span style={{ color:DS, fontSize:13 }}>—</span>;
                  return list.map((e, i) => (
                    <div key={i} style={{ marginBottom: i<list.length-1?4:0, direction:"ltr", textAlign:"right" }}>
                      {e.name && <span style={{ color:DS, fontSize:12, marginLeft:6 }}>{e.name}:</span>}
                      <a href={`mailto:${e.email}`} style={{ color: TH.name==="Light Mode" ? "#1a70c0" : "#6ab0f0", textDecoration:"none", fontSize:13 }}>{e.email}</a>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════ EDIT MODE ══════════════════════════ */}
        {editing && (
          <div style={{ ...sectionBox, border:`1px solid ${phase.color}55` }}>
            <div style={{
              fontSize:11, color:DS, fontWeight:700, marginBottom:14,
              letterSpacing:.5, display:"flex", alignItems:"center", gap:6,
            }}>
              <span>✏️</span> עריכת פרטי לקוח
            </div>

            {/* סוג התיק */}
            <div style={{ marginBottom:12 }}>
              <label style={{ ...lbl, color:DS, display:"flex", alignItems:"center", gap:5 }}>
                <BriefcaseIcon size={13} color={DS} /> סוג התיק
              </label>
              <input dir="rtl"
                value={draft.case_type || ""}
                onChange={e => setDraftField("case_type", e.target.value)}
                placeholder="מחזור / רכישה מקבלן / רכישה יד שנייה…"
                style={{ background:DI, border:`1px solid ${DBR}`, borderRadius:6, color:DT,
                  padding:"7px 10px", fontSize:12, outline:"none", width:"100%",
                  boxSizing:"border-box", fontFamily:"inherit" }}
              />
            </div>

            {/* ── טלפונים ── */}
            <div style={{ marginBottom:14 }}>
              <label style={{ ...lbl, fontSize:12, marginBottom:8, color:DS }}>📱 מספרי טלפון</label>
              <PairFields
                pairs={draft.phones}
                onChange={v => setDraftField("phones",v)}
                numPlaceholder="05X-XXXXXXX"
                namePlaceholder="שם בעל הטלפון"
                addLabel="+ הוסף מספר"
                inputBg={DI} inputBdr={DBR} inputColor={DT}
              />
            </div>

            {/* ── אימייל ── */}
            <div style={{ marginBottom:14 }}>
              <label style={{ ...lbl, fontSize:12, marginBottom:8, color:DS }}>✉️ אימייל</label>
              <PairFields
                pairs={draft.emails_list}
                onChange={v => setDraftField("emails_list",v)}
                keyA="email" keyB="name" dirA="ltr"
                numPlaceholder="client@email.com"
                namePlaceholder="שם בעל האימייל"
                addLabel="+ הוסף אימייל"
                inputBg={DI} inputBdr={DBR} inputColor={DT}
              />
            </div>

            {/* כפתורי שמירה/ביטול */}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={commitEdit} style={{
                background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
                color:"#fff", border:"none", borderRadius:8,
                padding:"9px 22px", fontSize:13, fontWeight:800, cursor:"pointer",
                flex:1,
              }}>✓ שמור שינויים</button>
              <button onClick={cancelEdit} style={{
                background:DI, color:DS,
                border:`1px solid ${DBR}`, borderRadius:8,
                padding:"9px 18px", fontSize:13, cursor:"pointer",
              }}>ביטול</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════ פרטי הנכס למכירה ════════════════════════ */}
        <PropertyDetailsCard
          client={client}
          onUpdate={onNotesUpdate || onUpdate}
          theme={TH}
        />

        {/* ══════════════════════════ תיאור התיק ══════════════════════════════ */}
        <DescriptionField
          value={client.description || ""}
          onChange={val => onNotesUpdate && onNotesUpdate(client.id, "description", val)}
          clientId={client.id}
          theme={TH}
          DB={DB} DC={DC} DBR={DBR} DT={DT} DS={DS} DI={DI}
          ACCENT={"#6c5ecf"}
        />

        {/* ══════════════════════════ מסמכי הלקוח (Dropbox) ════════════════════ */}
        <DropboxField
          value={client.dropbox_url || ""}
          onChange={val => onNotesUpdate && onNotesUpdate(client.id, "dropbox_url", val)}
          clientId={client.id}
          theme={TH}
          DC={DC} DBR={DBR} DT={DT} DS={DS} DI={DI}
        />

        {/* ══════════════════════════ שלח ווטסאפ ══════════════════════════ */}
        <WhatsAppCard
          client={client}
          onUpdate={onNotesUpdate || onUpdate}
          onAddNote={onAddNote}
          templates={waTemplates}
          myName={myName}
          theme={TH}
        />

        {/* ══════════════════════════ כרטיסיית ביטחונות (צ'ק-ליסט מכירה) ══════════════════════════ */}
        <SecuritiesCard
          data={client.securities || { approval:"", appraisal:"" }}
          onChange={(field, val) => {
            if (!onUpdate) return;
            const updated = { ...(client.securities || {}), [field]: val };
            onUpdate(client.id, "securities", updated);
          }}
          dates={{
            collateral_approval_date:  client.collateral_approval_date  || "",
            collateral_appraisal_date: client.collateral_appraisal_date || "",
          }}
          onDateChange={(dateKey, val) => onUpdate && onUpdate(client.id, dateKey, val)}
          checks={{
            collateral_approval_completed:  !!client.collateral_approval_completed,
            collateral_appraisal_completed: !!client.collateral_appraisal_completed,
          }}
          onCheckChange={(doneKey, val) => onUpdate && onUpdate(client.id, doneKey, val)}
          isAdvisor={readOnly}
          theme={TH}
          readOnly={readOnly}
        />

        {/* ══════════════════════════ צ'ק-ליסט לאחר צירוף הלקוח ══════════════════════════ */}
        <SecuritiesCard
          fields={ONBOARDING_FIELDS}
          title="צ׳ק ליסט לאחר צירוף הלקוח"
          titleIcon="🏡"
          data={(() => {
            // ONBOARDING_FIELDS לא משתמש בשדה data/notes חופשי (אין כפתור "ערוך טקסט" לכל שלב),
            // אבל SecuritiesCard מצפה לאובייקט data תקין — מעביר ריק כדי שלא ייקרא undefined
            const poc = client.post_onboarding_checks || {};
            return Object.fromEntries(ONBOARDING_FIELDS.map(f => [f.key, poc[f.key] || ""]));
          })()}
          onChange={(field, val) => {
            if (!onUpdate) return;
            const updated = { ...(client.post_onboarding_checks || {}), [field]: val };
            onUpdate(client.id, "post_onboarding_checks", updated);
          }}
          dates={(() => {
            const poc = client.post_onboarding_checks || {};
            return Object.fromEntries(ONBOARDING_FIELDS.map(f => [f.dateKey, poc[f.dateKey] || ""]));
          })()}
          onDateChange={(dateKey, val) => {
            if (!onUpdate) return;
            const updated = { ...(client.post_onboarding_checks || {}), [dateKey]: val };
            onUpdate(client.id, "post_onboarding_checks", updated);
          }}
          checks={(() => {
            const poc = client.post_onboarding_checks || {};
            return Object.fromEntries(ONBOARDING_FIELDS.map(f => [f.doneKey, !!poc[f.doneKey]]));
          })()}
          onCheckChange={(doneKey, val) => {
            if (!onUpdate) return;
            const updated = { ...(client.post_onboarding_checks || {}), [doneKey]: val };
            onUpdate(client.id, "post_onboarding_checks", updated);
          }}
          isAdvisor={readOnly}
          theme={TH}
          readOnly={readOnly}
        />

        {/* ══════════════════════════ היסטוריית התנהלות התיק ══════════════════ */}
        {(() => {
          const isLight = TH.name === "Light Mode";
          const cardBg  = TH.drawerCard   || "#11182a";
          const cardBdr = TH.drawerBorder || "#2a2a48";
          const footBg  = isLight ? "#edf0f8" : "#0c1020";
          const rowBdr  = isLight ? "#d0d8e8" : "#1e1e38";
          const ACCENT  = "#6c5ecf";

          return (
            <div style={{
              background:cardBg, borderRadius:12,
              border:`1px solid ${ACCENT}55`,
              marginBottom:36, overflow:"hidden",
            }}>
              {/* כותרת */}
              <div style={{
                background: isLight
                  ? "linear-gradient(135deg,#ede8ff,#f0eeff)"
                  : "linear-gradient(135deg,#1a1540,#120e30)",
                borderBottom:`1px solid ${ACCENT}44`,
                padding:"11px 16px",
                display:"flex", alignItems:"center", gap:9,
              }}>
                <span style={{ fontSize:15 }}>📋</span>
                <span style={{ fontSize:13, fontWeight:900, color:ACCENT, letterSpacing:.5 }}>
                  היסטוריית ההתנהלות
                </span>
                <span style={{
                  marginRight:"auto",
                  background: isLight ? "#ede8ff" : "#2a2040",
                  color:ACCENT, borderRadius:10, padding:"2px 9px",
                  fontSize:11, fontWeight:700,
                }}>
                  {(Array.isArray(client.timeline) ? client.timeline.length : 0)} עדכונים
                </span>
              </div>

              {/* הוסף עדכון חדש — מוסתר ביועץ */}
              {!readOnly && (
              <div style={{ borderBottom:`1px solid ${rowBdr}`, padding:"14px 16px", background:footBg }}>
                <label style={{ ...lbl, fontSize:12, marginBottom:6, color:DS }}>📝 הוסף עדכון חדש</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="כתוב עדכון לתיק… התאריך יצורף אוטומטית"
                  dir="rtl" rows={2}
                  style={{
                    background:DI, border:`1px solid ${DBR}`,
                    borderRadius:8, color:DT, padding:"9px 12px",
                    fontSize:13, outline:"none", width:"100%",
                    boxSizing:"border-box", fontFamily:"inherit",
                    resize:"vertical", lineHeight:1.6, marginBottom:8,
                  }}
                  onKeyDown={e => { if (e.ctrlKey && e.key==="Enter") saveNote(); }}
                />
                <button onClick={saveNote} style={{
                  background:"linear-gradient(135deg,#6c5ecf,#2d88d4)",
                  color:"#fff", border:"none", borderRadius:7,
                  padding:"8px 20px", fontSize:13, fontWeight:700, cursor:"pointer",
                }}>שמור ועדכן</button>
              </div>
              )}

              {/* שורות ציר זמן עם עריכה — למטה */}
              <TimelineEntries
                timeline={client.timeline}
                onUpdate={readOnly ? null : list => onUpdate(client.id, "timeline", list)}
                readOnly={readOnly}
                theme={TH}
                DB={DB} DC={DC} DBR={DBR} DT={DT} DS={DS} DI={DI}
                ACCENT={ACCENT}
              />
            </div>
          );
        })()}

        {/* ══════════════════════════ שכר טרחה ════════════════════════════════ */}
        {(() => {
          const isLight = TH.name === "Light Mode";
          const feeColor = isLight ? "#1a1a3a" : (DT || "#e0e0f8");
          const FEE_ACCENT = "#caa23a";
          return (
            <div style={{
              marginTop:36,
              background: DC,
              border:`1px solid ${DBR}`,
              borderRadius:12, overflow:"hidden",
            }}>
              {/* כותרת */}
              <div style={{
                padding:"12px 16px", borderBottom:`1px solid ${DBR}`,
                background: isLight ? "linear-gradient(135deg,#fffae8,#fff4e0)" : "linear-gradient(135deg,#2a2410,#1e1808)",
              }}>
                <span style={{ fontSize:14, fontWeight:900, color:FEE_ACCENT, display:"flex", alignItems:"center", gap:7 }}>
                  💰 שכר טרחה
                </span>
              </div>
              {/* תוכן */}
              <div style={{ padding:"14px 16px" }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:DS, marginBottom:6 }}>שכ"ט מבוקש:</label>
                {readOnly ? (
                  <div style={{ fontSize:15, fontWeight:800, color: client.fee ? feeColor : DS }}>
                    {client.fee || "— לא הוזן —"}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={client.fee || ""}
                    onChange={e => onNotesUpdate && onNotesUpdate(client.id, "fee", e.target.value)}
                    placeholder="הוסף סכום או אחוזים לשכר טרחה"
                    dir="rtl"
                    style={{
                      width:"100%", boxSizing:"border-box", padding:"10px 12px",
                      background: DI, border:`1px solid ${DBR}`, borderRadius:9,
                      color: feeColor, WebkitTextFillColor: feeColor, opacity:1,
                      fontSize:15, fontWeight:700, outline:"none", fontFamily:"inherit",
                    }}
                    onFocus={e => e.target.style.borderColor=FEE_ACCENT}
                    onBlur={e => e.target.style.borderColor=DBR}
                  />
                )}

                {/* שורת תשלום — שולם בתאריך + V ירוק */}
                <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${DBR}` }}>
                  <div
                    onClick={() => { if (!readOnly) onNotesUpdate && onNotesUpdate(client.id, "fee_paid", !client.fee_paid); }}
                    style={{ display:"flex", alignItems:"center", gap:9, cursor: readOnly ? "default" : "pointer" }}
                  >
                    <span style={{
                      width:20, height:20, borderRadius:6, flexShrink:0,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: client.fee_paid ? "#22a060" : "transparent",
                      border:`2px solid ${client.fee_paid ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                      color:"#fff", fontSize:13, fontWeight:900, transition:"all .15s",
                      boxShadow: client.fee_paid ? "0 0 8px #22a06066" : "none",
                    }}>{client.fee_paid ? "✓" : ""}</span>
                    <span style={{ fontSize:13, fontWeight:700, color: client.fee_paid ? feeColor : DS }}>שולם בתאריך:</span>
                  </div>

                  {/* שדות מותנים — נפתחים רק כש-fee_paid פעיל */}
                  {client.fee_paid && (
                    <div style={{ marginTop:10, paddingRight:29, display:"flex", flexDirection:"column", gap:8 }}>
                      <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
                        <input
                          type="date"
                          value={client.fee_paid_date || ""}
                          onChange={e => onNotesUpdate && onNotesUpdate(client.id, "fee_paid_date", e.target.value)}
                          placeholder="תאריך ששולם"
                          disabled={readOnly}
                          dir="rtl"
                          style={{
                            flex:1, boxSizing:"border-box",
                            fontSize:12, color:feeColor, WebkitTextFillColor:feeColor, opacity:1,
                            background:DI, border:`1px solid ${DBR}`, borderRadius:7,
                            padding: client.fee_paid_date ? "7px 28px 7px 10px" : "7px 10px",
                            outline:"none", fontFamily:"inherit", cursor: readOnly ? "default" : "pointer",
                          }}
                        />
                        {/* כפתור X — מאפס רק את fee_paid_date, לא נוגע ב-V הראשי */}
                        {!readOnly && client.fee_paid_date && (
                          <button
                            type="button"
                            onClick={() => onNotesUpdate && onNotesUpdate(client.id, "fee_paid_date", "")}
                            title="נקה תאריך"
                            style={{
                              position:"absolute", left:6, top:"50%", transform:"translateY(-50%)",
                              width:18, height:18, borderRadius:5, flexShrink:0,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              background:"transparent", border:"none",
                              color:"#c04444", fontSize:13, fontWeight:800, cursor:"pointer", lineHeight:1,
                            }}
                          >✕</button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={client.fee_paid_notes || ""}
                        onChange={e => onNotesUpdate && onNotesUpdate(client.id, "fee_paid_notes", e.target.value)}
                        placeholder="הערות לתשלום… (אופציונלי)"
                        disabled={readOnly}
                        dir="rtl"
                        style={{
                          width:"100%", boxSizing:"border-box",
                          fontSize:12, color:feeColor, WebkitTextFillColor:feeColor, opacity:1,
                          background:DI, border:`1px solid ${DBR}`, borderRadius:7,
                          padding:"7px 10px", outline:"none", fontFamily:"inherit",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── כפתורי מחק / שכפל לקוח — בתוך ה-panel הגולל, בסופו ── */}
        {(onDelete || onDuplicate) && (
          <div style={{
            marginTop:28,
            paddingTop:18,
            borderTop:`1px solid ${DBR}`,
            display:"flex",
            justifyContent:"flex-start",
            gap:10, flexWrap:"wrap",
          }}>
            {onDelete && (
            <button
              onClick={() => onDelete(client.id)}
              style={{
                background:"#c03030",
                border:"none",
                color:"#fff",
                borderRadius:8,
                padding:"10px 22px",
                fontSize:13, fontWeight:800,
                cursor:"pointer",
                transition:"all .15s",
                display:"inline-flex", alignItems:"center", gap:7,
                boxShadow:"0 2px 10px rgba(192,48,48,.35)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background="#a02020"; e.currentTarget.style.boxShadow="0 4px 16px rgba(192,48,48,.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.background="#c03030"; e.currentTarget.style.boxShadow="0 2px 10px rgba(192,48,48,.35)"; }}
            >
              🗑️ מחק לקוח
            </button>
            )}
            {onDuplicate && (
            <button
              onClick={() => {
                if (window.confirm("האם לשכפל נתוני לקוח?")) onDuplicate(client);
              }}
              style={{
                background: "#eef0fb",
                border:`1px solid #c8cdf0`,
                color: "#3a4488",
                borderRadius:8,
                padding:"10px 22px",
                fontSize:13, fontWeight:800,
                cursor:"pointer",
                transition:"all .15s",
                display:"inline-flex", alignItems:"center", gap:7,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#e2e6f8"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#eef0fb"; }}
            >
              📋 שכפל לקוח
            </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
function TimelineEntries({ timeline: timelineProp, onUpdate, DB, DC, DBR, DT, DS, DI, ACCENT, theme:TH={}, readOnly=false }) {
  const timeline = Array.isArray(timelineProp) ? timelineProp : [];
  const [editIdx,    setEditIdx]    = useState(null);
  const [editNote,   setEditNote]   = useState("");
  const [editDate,   setEditDate]   = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [expanded,   setExpanded]   = useState(false);

  const isLight = TH.name === "Light Mode";
  const rowBdr  = isLight ? "#d0d8e8" : "#1e1e38";
  const hoverBg = isLight ? "#f4f0ff" : "#1a1530";
  const PURPLE  = "#7c5ecf";

  // guard: onUpdate עשוי להיות null (יועץ) — לא לקרוס
  const safeUpdate = (next) => { if (onUpdate) onUpdate(next); };

  const startEdit = (i) => {
    setEditIdx(i);
    setEditNote(timeline[i].note);
    setEditDate(timeline[i].date);
  };
  const commitEdit = () => {
    if (editIdx === null) return;
    const next = timeline.map((e,i) => i===editIdx ? { ...e, date:editDate, note:editNote } : e);
    safeUpdate(next);
    setEditIdx(null);
  };
  const cancelEdit = () => setEditIdx(null);
  const deleteEntry = (i) => {
    safeUpdate(timeline.filter((_,j) => j!==i));
    setConfirmDel(null);
  };

  // ── הפיכת שורת עדכון למשימת לוח שנה (וההפך) ──
  const toggleCalendarTask = (i) => {
    const next = timeline.map((e,j) => {
      if (j !== i) return e;
      const turningOn = !e.is_calendar_task;
      return {
        ...e,
        is_calendar_task: turningOn,
        // אם מפעילים ואין תאריך/שעה יעד — ברירת מחדל להיום בשעה 09:00
        task_date: turningOn ? (e.task_date || todayStr2(e.date)) : e.task_date,
        task_time: turningOn ? (e.task_time || "09:00") : e.task_time,
        completed: turningOn ? !!e.completed : e.completed,
      };
    });
    safeUpdate(next);
  };
  const setTaskDate = (i, date) => {
    safeUpdate(timeline.map((e,j) => j===i ? { ...e, task_date: date } : e));
  };
  const setTaskTime = (i, time) => {
    safeUpdate(timeline.map((e,j) => j===i ? { ...e, task_time: time } : e));
  };
  const toggleCompleted = (i) => {
    safeUpdate(timeline.map((e,j) => j===i ? { ...e, completed: !e.completed } : e));
  };

  const VISIBLE_COUNT = 5;
  const displayedEntries = expanded ? timeline : timeline.slice(0, VISIBLE_COUNT);
  const hasMore = timeline.length > VISIBLE_COUNT;

  if (timeline.length === 0) {
    return (
      <div style={{ padding:"20px 16px", textAlign:"center", color:DS, fontSize:13 }}>
        אין עדיין עדכונים
      </div>
    );
  }

  return (
    <div style={{ position:"relative" }}>
      {/* דיאלוג אישור מחיקה */}
      {confirmDel !== null && (
        <div style={{
          position:"absolute", inset:0, zIndex:10,
          background:"rgba(0,0,0,.6)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div dir="rtl" style={{
            background: isLight ? "#fff" : "#1a1a2e",
            border:`1px solid ${isLight ? "#d0d8f0" : "#4a3a5a"}`,
            borderRadius:12, padding:"22px 24px", maxWidth:270,
            textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,.6)",
          }}>
            <div style={{ fontSize:22, marginBottom:10 }}>🗑️</div>
            <div style={{ fontSize:14, fontWeight:800, color:DT, marginBottom:8 }}>מחיקת עדכון</div>
            <div style={{ fontSize:12, color:DS, marginBottom:18, lineHeight:1.6 }}>
              האם אתה בטוח שברצונך למחוק עדכון זה?
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => deleteEntry(confirmDel)} style={{
                background:"linear-gradient(135deg,#c03030,#e04444)",
                color:"#fff", border:"none", borderRadius:8,
                padding:"8px 20px", fontSize:13, fontWeight:800, cursor:"pointer",
              }}>כן, מחק</button>
              <button onClick={() => setConfirmDel(null)} style={{
                background:DI, color:DS,
                border:`1px solid ${DBR}`, borderRadius:8,
                padding:"8px 14px", fontSize:13, cursor:"pointer",
              }}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {displayedEntries.map((entry, i) => {
        const isTask = !!entry.is_calendar_task;
        const isDone = !!entry.completed;
        return (
        <div key={i} style={{
          borderBottom: i<displayedEntries.length-1 || hasMore ? `1px solid ${rowBdr}` : "none",
          padding:"12px 16px",
        }}>
          {editIdx === i ? (
            /* ── מצב עריכה ── */
            <div>
              <div style={{ marginBottom:6 }}>
                <label style={{ ...lbl, color:DS }}>תאריך</label>
                <input
                  type="text"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  dir="rtl"
                  placeholder="dd/mm/yy"
                  style={{
                    background:DI, border:`1px solid ${DBR}`, borderRadius:6,
                    color:DT, padding:"6px 10px", fontSize:12, outline:"none",
                    width:"100%", boxSizing:"border-box", fontFamily:"inherit",
                    marginBottom:6,
                  }}
                />
                <label style={{ ...lbl, color:DS }}>עדכון</label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  dir="rtl" rows={2}
                  style={{
                    background:DI, border:`1px solid ${DBR}`, borderRadius:6,
                    color:DT, padding:"7px 10px", fontSize:13, outline:"none",
                    width:"100%", boxSizing:"border-box", fontFamily:"inherit",
                    resize:"vertical", lineHeight:1.6,
                  }}
                  onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key==="Escape") cancelEdit(); }}
                />
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={commitEdit} style={{
                  background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
                  color:"#fff", border:"none", borderRadius:6,
                  padding:"6px 16px", fontSize:12, fontWeight:800, cursor:"pointer",
                }}>✓ שמור</button>
                <button onClick={cancelEdit} style={{
                  background:DI, color:DS, border:`1px solid ${DBR}`,
                  borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer",
                }}>ביטול</button>
                <span style={{ fontSize:10, color:DS, alignSelf:"center" }}>Enter לשמירה · Esc לביטול</span>
              </div>
            </div>
          ) : (
            /* ── מצב תצוגה ── */
            <div style={{ display:"flex", gap:12, alignItems:"stretch" }}>
              {/* צד ימין — עיגול + קו + תיבת V (למשימות לוח שנה) */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, marginTop:3 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background: isTask ? PURPLE : ACCENT }} />
                <div style={{ width:2, flex:1, minHeight:20, background:DBR, marginTop:4 }} />
                {/* תיבת V — מתחת לנקודה ולקו, רק למשימות לוח שנה */}
                {isTask && !readOnly && (
                  <span
                    onClick={() => toggleCompleted(i)}
                    title={isDone ? "בוצע" : "סמן כבוצע"}
                    style={{
                      width:24, height:24, borderRadius:6, marginTop:6,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: isDone ? "#22a060" : "transparent",
                      border:`2px solid ${isDone ? "#22a060" : DBR}`,
                      color:"#fff", fontSize:14, fontWeight:900, cursor:"pointer",
                    }}
                  >{isDone ? "✓" : ""}</span>
                )}
              </div>

              {/* תוכן */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, color: isTask ? PURPLE : ACCENT, fontWeight:700, marginBottom:4 }}>
                  {[entry.author_name, entry.time, entry.date].filter(Boolean).join(" • ")}
                </div>
                <div style={{
                  fontSize:13, color: isDone ? DS : DT, lineHeight:1.65,
                  textDecoration: isDone ? "line-through" : "none",
                }}>{entry.note}</div>
                {/* שורת משימת לוח שנה — תאריך + שעה ביומן */}
                {isTask && !readOnly && (
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:PURPLE }}>📅 תאריך ביומן:</span>
                    <input
                      type="date"
                      value={(entry.task_date || "").split("T")[0]}
                      onChange={e => setTaskDate(i, e.target.value)}
                      dir="rtl"
                      style={{
                        fontSize:11, color:DT, WebkitTextFillColor:DT, opacity:1,
                        background:DI, border:`1px solid ${PURPLE}66`, borderRadius:6,
                        padding:"5px 8px", outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    />
                    <span style={{ fontSize:11, fontWeight:700, color:PURPLE }}>🕐 שעה:</span>
                    <input
                      type="time"
                      value={entry.task_time || "09:00"}
                      onChange={e => setTaskTime(i, e.target.value)}
                      dir="ltr"
                      required
                      style={{
                        fontSize:11, color:DT, WebkitTextFillColor:DT, opacity:1,
                        background:DI, border:`1px solid ${PURPLE}66`, borderRadius:6,
                        padding:"5px 8px", outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    />
                  </div>
                )}
                {isTask && readOnly && entry.task_date && (
                  <div style={{ fontSize:11, fontWeight:700, color:PURPLE, marginTop:6 }}>
                    📅 ביומן: {fmtDate2(entry.task_date)} {entry.task_time ? `· 🕐 ${entry.task_time}` : ""}
                  </div>
                )}
              </div>

              {/* צד שמאל — פעולות: עריכה+מחיקה למעלה, לוח שנה הכי למטה */}
              {!readOnly && (
              <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0, alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"center" }}>
                  <button
                    onClick={() => startEdit(i)}
                    title="ערוך עדכון"
                    style={{
                      background:"none", border:`1px solid ${DBR}`,
                      color:DS, borderRadius:5, padding:"3px 8px",
                      fontSize:12, cursor:"pointer", transition:"all .12s",
                    }}
                  >✏️</button>
                  <button
                    onClick={() => setConfirmDel(i)}
                    title="מחק עדכון"
                    style={{
                      background:"none", border:`1px solid ${isLight?"#e0b0b0":"#5a2020"}`,
                      color: isLight?"#c04444":"#e06060", borderRadius:5, padding:"3px 8px",
                      fontSize:12, cursor:"pointer", transition:"all .12s",
                    }}
                  >🗑️</button>
                </div>
                {/* כפתור הפיכה למשימת לוח שנה — הכי למטה */}
                <button
                  onClick={() => toggleCalendarTask(i)}
                  title={isTask ? "בטל משימת לוח שנה" : "הפוך למשימה בלוח השנה"}
                  style={{
                    background: isTask ? PURPLE : "none", border:`1px solid ${isTask ? PURPLE : DBR}`,
                    color: isTask ? "#fff" : DS, borderRadius:5, padding:"3px 8px",
                    fontSize:12, cursor:"pointer", transition:"all .12s", marginTop:8,
                  }}
                >📅</button>
              </div>
              )}
            </div>
          )}
        </div>
        );
      })}

      {/* כפתור הצג עוד / הסתר — מוצג רק כשיש יותר מ-5 */}
      {hasMore && (
        <button
          onClick={() => setExpanded(x => !x)}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            width:"100%", padding:"10px 16px",
            background: isLight ? "#f0eeff" : "#1a1530",
            border:"none", borderTop:`1px solid ${rowBdr}`,
            color:ACCENT, fontSize:12, fontWeight:700,
            cursor:"pointer", transition:"background .12s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = isLight ? "#e8e0ff" : "#221840"}
          onMouseLeave={e => e.currentTarget.style.background = isLight ? "#f0eeff" : "#1a1530"}
        >
          {expanded
            ? <><span>▲</span> הסתר ישן ({timeline.length - VISIBLE_COUNT} עדכונים)</>
            : <><span>▼</span> הצג עוד {timeline.length - VISIBLE_COUNT} עדכונים ישנים</>
          }
        </button>
      )}
    </div>
  );
}


const td = { padding:"10px 12px", fontSize:13, color:"#c8c8e0", verticalAlign:"middle", textAlign:"right" };

/* ─── הגדרת עמודות ─────────────────────────────────────────────────────────
   key  = מזהה ייחודי
   label = כותרת
   w     = רוחב ברירת מחדל (px)
   render(client, phase, T) = תוכן התא
*/
/* ─── אייקון תיק עבודה (💼) — שימוש חוזר ─────────────────────────────────── */
const BriefcaseIcon = ({ size=14, color }) => (
  <span style={{ fontSize:size, lineHeight:1, display:"inline-flex", verticalAlign:"middle" }}>💼</span>
);

const COLUMN_DEFS = [
  {
    key:"name", label:"שם הלקוח", w:170,
    render:(c,ph,T,_,fs=13) => {
      const banks = Array.isArray(c.banks) ? c.banks.filter(b=>b?.trim()) : [];
      const strong = T.textPrimary || "#1a1a3a";  // אותו שחור של השם
      const divider = T.name==="Light Mode" ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.12)";
      return (
        <div>
          {/* שורה 1: שם הלקוח */}
          <span style={{ color:strong, fontSize:fs, fontWeight:700 }}>{fullName(c)}</span>
          {/* שורה 2: סוג התיק — שחור מלא + אייקון תיק */}
          {c.case_type && (
            <div style={{
              display:"flex", alignItems:"center", gap:5,
              fontSize:Math.max(9,fs-3), color:strong, fontWeight:600,
              marginTop:3, lineHeight:1.5,
            }}>
              <span style={{ color:strong, display:"flex" }}><BriefcaseIcon size={Math.max(11,fs-2)} /></span>
              <span style={{ wordBreak:"break-word" }}>{c.case_type}</span>
            </div>
          )}
          {/* קו מפריד דק לפני שורת הבנק */}
          {c.case_type && banks.length > 0 && (
            <div style={{ height:1, background:divider, margin:"5px 0" }} />
          )}
          {/* שורה 3: בנק וסניף */}
          {banks.length > 0 && (
            <div>
              {banks.map((b,i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:5,
                  fontSize:Math.max(9,fs-3), color:T.textSecondary||"#6060a0", lineHeight:1.6,
                }}>
                  <span style={{ flexShrink:0 }}>🏦</span>
                  <span style={{ wordBreak:"break-word" }}>{b}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
  },
  {
    key:"handler", label:"מטופל על ידי", w:140,
    render:(c,_,T,__,fs=13) => <span style={{ color:T.textPrimary||"#c8c8e0", fontSize:fs }}>{c.handler||"—"}</span>,
  },
  {
    key:"timeline", label:"התנהלות התיק", w:200,
    render:(c,ph,T,__,fs=13) => {
      const sub = T.textSecondary||"#6060a0";
      const tl = Array.isArray(c.timeline) ? c.timeline : [];
      return tl.length>0 ? (
        <div>
          <div style={{ fontSize:Math.max(9,fs-2), color:ph.color, fontWeight:700, marginBottom:2 }}>{tl[0].date}</div>
          <div style={{ fontSize:fs, color:sub, lineHeight:1.5, wordBreak:"break-word" }}>{tl[0].note}</div>
          {tl.length>1 && <div style={{ fontSize:Math.max(9,fs-2), color:sub, opacity:.7, marginTop:2 }}>+{tl.length-1} עדכונים</div>}
        </div>
      ) : <span style={{ color:sub, fontSize:fs, opacity:.5 }}>אין עדכונים</span>;
    },
  },
  {
    key:"phone", label:"טלפון", w:155,
    render:(c,_,T,__,fs=13) => (
      <div>{(c.phones||[]).map((p,i)=>(
        <div key={i} style={{ marginBottom:2, lineHeight:1.5 }}>
          <span style={{ fontSize:fs, color:T.textPrimary||"#c8c8e0" }}>{p.number||"—"}</span>
          {p.ownerName && <span style={{ color:T.textSecondary||"#6060a0", fontSize:Math.max(9,fs-2), marginRight:5 }}> ({p.ownerName})</span>}
        </div>
      ))}</div>
    ),
  },
  {
    key:"opFor", label:"תפעול ע״י", w:130,
    render:(c,_,T,__,fs=13) => <span style={{ color:T.textPrimary||"#c8c8e0", fontSize:fs }}>{c.opFor||"—"}</span>,
  },
  {
    key:"phase", label:"שלב", w:160,
    render:(c,ph,T,onPhaseChange,fs=13) => (
      <div onClick={e=>e.stopPropagation()}>
        <select
          value={c.phase}
          onChange={e=>onPhaseChange && onPhaseChange(c.id,e.target.value)}
          disabled={!onPhaseChange}
          dir="rtl"
          style={{
            background:T.rowBg||"#1a1a30", border:`1px solid ${T.border||"#3a3a60"}`,
            borderRadius:5, color:ph.color, fontSize:Math.max(10,fs-1),
            padding:"3px 6px", cursor:onPhaseChange?"pointer":"default",
            fontFamily:"inherit", outline:"none",
            opacity: onPhaseChange ? 1 : 0.7,
          }}
        >
          {PHASES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
    ),
  },
  {
    key:"fee", label:"שכר טרחה", w:120,
    render:(c,_,T,__,fs=13) => <span style={{ color:T.textPrimary||"#c8c8e0", fontSize:fs }}>{c.fee||"—"}</span>,
  },
];

/* ─── Hook: ניהול עמודות (סדר + רוחב) ──────────────────────────────────── */
function useColumns() {
  const STORAGE_KEY_ORDER  = "onyx_col_order";
  const STORAGE_KEY_WIDTHS = "onyx_col_widths";
  const DEFAULT_COL_ORDER  = ["name","timeline","phase","phone","handler","opFor","fee"];

  const [order,  setOrder]  = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_ORDER);
      let arr = v ? JSON.parse(v) : DEFAULT_COL_ORDER;
      // הסר מפתחות שכבר לא קיימים (למשל "bank" שהוסר)
      arr = arr.filter(k => k !== "bank" && COLUMN_DEFS.some(c => c.key === k));
      // הוסף עמודות חדשות שטרם קיימות אצל המשתמש (למשל "fee")
      DEFAULT_COL_ORDER.forEach(k => { if (!arr.includes(k)) arr.push(k); });
      return arr;
    } catch { return DEFAULT_COL_ORDER; }
  });
  const [widths, setWidths] = useState(() => {
    try { const v = localStorage.getItem(STORAGE_KEY_WIDTHS); return v ? JSON.parse(v) : Object.fromEntries(COLUMN_DEFS.map(c=>[c.key, c.w])); } catch { return Object.fromEntries(COLUMN_DEFS.map(c=>[c.key, c.w])); }
  });
  const [dragSrc,  setDragSrc]  = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const cols = order.map(k => COLUMN_DEFS.find(c=>c.key===k)).filter(Boolean);

  const persistOrder  = (o) => { try { localStorage.setItem(STORAGE_KEY_ORDER,  JSON.stringify(o)); } catch{} };
  const persistWidths = (w) => { try { localStorage.setItem(STORAGE_KEY_WIDTHS, JSON.stringify(w)); } catch{} };

  /* ── גרירת עמודות — Pointer Events (מחשב + מובייל) ── */
  const dragState = useRef({ active:false, key:null, startX:0, startOrder:[] });

  const startColDrag = (key, e) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    dragState.current = { active:true, key, startX:clientX, startOrder:[...order] };
    setDragSrc(key);

    const onMove = (mv) => {
      if (!dragState.current.active) return;
      const x = mv.touches ? mv.touches[0].clientX : mv.clientX;
      // מצא את האלמנט מתחת לאצבע/סמן
      const el = document.elementFromPoint(x, mv.clientY || (mv.touches?.[0]?.clientY ?? 0));
      const th = el?.closest("[data-colkey]");
      if (th) {
        const overKey = th.getAttribute("data-colkey");
        if (overKey && overKey !== dragState.current.key) setDragOver(overKey);
      }
    };
    const onUp = () => {
      if (dragState.current.active) {
        const { key: src } = dragState.current;
        setDragOver(prev => {
          if (prev && prev !== src) {
            setOrder(prevOrder => {
              const next = [...prevOrder];
              const si = next.indexOf(src);
              const ti = next.indexOf(prev);
              if (si !== -1 && ti !== -1) { next.splice(si,1); next.splice(ti,0,src); }
              persistOrder(next);
              return next;
            });
          }
          return null;
        });
      }
      dragState.current.active = false;
      setDragSrc(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onUp);
    };
    document.addEventListener("mousemove", onMove, { passive:true });
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove", onMove, { passive:true });
    document.addEventListener("touchend",  onUp);
  };

  const endDrag = () => { setDragSrc(null); setDragOver(null); };

  /* ── שינוי רוחב — Pointer Events (מחשב + מובייל) ── */
  const startResize = (key, startX, startW, e) => {
    e.stopPropagation();
    e.preventDefault();

    const onMove = mv => {
      const cx = mv.touches ? mv.touches[0].clientX : mv.clientX;
      const newW = Math.max(50, startW + cx - startX);
      setWidths(w => {
        const next = { ...w, [key]: newW };
        persistWidths(next);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove", onMove, { passive:false });
    document.addEventListener("touchend",  onUp);
  };

  return { cols, widths, dragSrc, dragOver, startColDrag, endDrag, startResize };
}

/* ─── שורת לקוח — memo למניעת re-render מיותר ──────────────────────────────── */
const ClientRow = memo(function ClientRow({ client, phase, onOpen, onPhaseChange, theme:T={}, cols, widths, fontSizes={}, onReorder, dragId, setDragId, dragOverId, setDragOverId, selecting=false, selectionActive=false, isSelected=false, onToggleSelect }) {
  const [hovered, setHovered] = useState(false);
  const rowNormal = T.rowBg    || "#0f0f22";
  const rowHov    = T.rowHover || "#181830";

  // הגנה על נתוני הלקוח
  const safe = useMemo(() => ({
    ...client,
    name:     client?.name     || "—",
    handler:  client?.handler  || "",
    opFor:    client?.opFor    || "",
    banks:    Array.isArray(client?.banks)    ? client.banks    : [],
    phones:   Array.isArray(client?.phones)   ? client.phones   : [],
    tids:     Array.isArray(client?.tids)     ? client.tids     : [],
    timeline: Array.isArray(client?.timeline) ? client.timeline : [],
    securities: client?.securities || {},
  }), [client]);

  const safePhase = phase || PHASES[0];
  const canDrag   = !!onReorder;
  const isDragging = dragId && dragId === client.id;
  const isDragOver = dragOverId && dragOverId === client.id && dragId !== client.id;

  // ── גרירה מבוססת Pointer Events (אחיד לעכבר ולמגע) ──
  const startPointerDrag = (e) => {
    if (!canDrag) return;
    e.stopPropagation();
    e.preventDefault();
    setDragId && setDragId(client.id);

    const getXY = (ev) => {
      if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      if (ev.changedTouches && ev.changedTouches[0]) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
      return { x: ev.clientX, y: ev.clientY };
    };
    const locate = (x, y) => {
      if (x == null || y == null) return null;
      const el = document.elementFromPoint(x, y);
      const row = el && el.closest("[data-clientid]");
      return row ? row.getAttribute("data-clientid") : null;
    };
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault(); // מניעת גלילה תוך כדי גרירה במובייל
      const { x, y } = getXY(ev);
      const overId = locate(x, y);
      if (overId) setDragOverId && setDragOverId(overId);
    };
    const end = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      const { x, y } = getXY(ev);
      const overId = locate(x, y);
      if (overId && overId !== client.id) onReorder(client.id, overId);
      setDragId && setDragId(null);
      setDragOverId && setDragOverId(null);
    };
    window.addEventListener("pointermove", move, { passive:false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", move, { passive:false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  };

  return (
    <tr
      data-clientid={client.id}
      onClick={() => { if (dragId) return; if (selecting) { onToggleSelect && onToggleSelect(client.id); } else { onOpen(safe); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isSelected ? (safePhase.dim || "#181830") : (isDragOver ? (T.rowHover || "#181830") : (hovered ? rowHov : rowNormal)),
        cursor: dragId ? "grabbing" : "pointer", transition:"background .12s",
        borderBottom:`1px solid ${T.border||"#1a1a38"}`,
        borderTop: isDragOver ? "2px solid #7c5ecf" : undefined,
        opacity: isDragging ? .45 : 1,
        boxShadow: isDragging ? "0 4px 16px rgba(124,94,207,.35)" : "none",
      }}
    >
      <td style={{ width:4, padding:0, background:safePhase.color, flexShrink:0 }} />
      {/* תא checkbox — נשמר בכל העמודות כשמצב בחירה פעיל, כדי לשמור יישור עמודות.
          ה-checkbox עצמו מוצג רק בעמודה שבמצב בחירה (selecting); באחרות תא ריק. */}
      {selectionActive && (
        <td style={{ width:40, padding:"0 0 0 4px", textAlign:"center", verticalAlign:"middle" }}>
          {selecting && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); onToggleSelect && onToggleSelect(client.id); }}
              onClick={(e) => e.stopPropagation()}
              style={{ width:17, height:17, cursor:"pointer", accentColor:safePhase.color }}
            />
          )}
        </td>
      )}
      {(cols||[]).map((col, ci) => {
        const fs = fontSizes[col.key] || 13;
        return (
          <td key={col.key} style={{
            ...td,
            fontSize: fs,
            width: widths[col.key],
            minWidth: widths[col.key],
            maxWidth: widths[col.key],
            overflow:"hidden",
          }}>
            {/* ידית גרירה בתא הראשון */}
            {ci === 0 && canDrag && (
              <span
                onClick={(e) => e.stopPropagation()}
                onPointerDown={startPointerDrag}
                onTouchStart={startPointerDrag}
                title="גרור לשינוי סדר"
                style={{ display:"inline-block", color: dragId===client.id ? "#7c5ecf" : (T.textSecondary||"#666"), fontSize:18, cursor:"grab", marginLeft:6, userSelect:"none", touchAction:"none", WebkitUserSelect:"none" }}
              >⠿</span>
            )}
            {col.render(safe, safePhase, T, onPhaseChange, fs)}
          </td>
        );
      })}
    </tr>
  );
});

/* ─── קבוצת שלב — מחזירה tbody בלבד לתוך הטבלה המאוחדת ──────────────────── */
function PhaseGroupRows({ phase, clients, onOpen, onPhaseChange, onAddClient, theme:T={}, cols, widths, fontSizes={}, isFirst=false, onReorder, advisors=[], isAdmin=false, myName="", selectionPhase=null, selectedIds=new Set(), onToggleSelectionMode, onToggleSelectId, onSelectAll, selectionActive=false }) {
  const [open,      setOpen]      = useState(true);
  const [addingRow, setAddingRow] = useState(false);
  const [dragId,     setDragId]     = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // מצב בחירה פעיל עבור עמודה זו בלבד
  const selecting = selectionPhase === phase.id;
  const phaseIds  = clients.map(c => c.id);
  const selectedInPhase = phaseIds.filter(id => selectedIds.has(id)).length;
  const allSelected = phaseIds.length > 0 && selectedInPhase === phaseIds.length;

  // שינוי סדר בתוך הקבוצה — בונה את רשימת ה-ids המסודרת ושולח החוצה
  const handleReorder = (fromId, toId) => {
    if (!onReorder || !fromId || !toId || fromId === toId) return;
    const ids = clients.map(c => c.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onReorder(phase.id, next);
  };

  const handleSave = (c) => { onAddClient(c); setAddingRow(false); };

  const bg     = T.groupBg   || "#0f0f20";
  const border = T.border    || "#2a2a48";
  const textMain = T.textPrimary || "#d8d8f0";

  const numCols = cols.length + 1 + (selectionActive ? 1 : 0); // +1 color bar, +1 checkbox col when selection active anywhere

  return (
    <>
      {/* ── שורת כותרת קבוצה ── */}
      <tbody>
        <tr>
          <td colSpan={numCols} style={{ padding:0 }}>
            <div
              onClick={() => setOpen(o => !o)}
              style={{
                display:"flex", alignItems:"center", gap:10, padding:"10px 16px",
                background:bg, borderTop:`3px solid ${phase.color}`,
                cursor:"pointer", userSelect:"none",
              }}
            >
              <span style={{ color:phase.color, fontSize:12 }}>{open ? "▼" : "▶"}</span>
              <span style={{ width:12, height:12, borderRadius:3, background:phase.color, flexShrink:0 }} />
              <span style={{ fontSize:14, fontWeight:800, color:textMain }}>{phase.label}</span>
              <span style={{
                background:phase.dim, color:phase.color,
                borderRadius:12, padding:"1px 9px", fontSize:12, fontWeight:700, marginRight:4,
              }}>{clients.length}</span>
              {/* כפתור מצב בחירה מרובה — ליד מונה הפריטים */}
              {onToggleSelectionMode && clients.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelectionMode(phase.id); }}
                  title={selecting ? "בטל בחירה מרובה" : "בחירה מרובה"}
                  style={{
                    display:"inline-flex", alignItems:"center", gap:4,
                    background: selecting ? phase.color : "transparent",
                    color: selecting ? "#fff" : phase.color,
                    border:`1px solid ${phase.color}`, borderRadius:6,
                    padding:"2px 9px", fontSize:11, fontWeight:700,
                    cursor:"pointer", fontFamily:"inherit",
                  }}
                >{selecting ? "✕ סיום" : "☑ בחירה"}</button>
              )}
            </div>
          </td>
        </tr>
      </tbody>

      {/* ── שורת "בחר הכל" — רק במצב בחירה ── */}
      {open && selecting && clients.length > 0 && (
        <tbody>
          <tr>
            <td colSpan={numCols} style={{ padding:0, background:T.rowBg||"#0f0f22" }}>
              <label style={{
                display:"flex", alignItems:"center", gap:9, padding:"7px 18px",
                cursor:"pointer", fontSize:12.5, fontWeight:700, color:textMain,
                borderBottom:`1px solid ${border}`,
              }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(phaseIds, e.target.checked)}
                  style={{ width:16, height:16, cursor:"pointer", accentColor:phase.color }}
                />
                {allSelected ? "בטל סימון הכל" : "בחר הכל"}
                {selectedInPhase > 0 && (
                  <span style={{ color:phase.color, fontWeight:800 }}>· {selectedInPhase} נבחרו</span>
                )}
              </label>
            </td>
          </tr>
        </tbody>
      )}

      {/* ── שורות לקוחות ── */}
      {open && (
        <tbody>
          {clients.length === 0 && !addingRow && (
            <tr>
              <td colSpan={numCols} style={{ padding:"14px 16px", textAlign:"center", color:T.textSecondary||"#404060", fontSize:13 }}>
                אין לקוחות בשלב זה
              </td>
            </tr>
          )}

          {clients.map(c => (
            <ClientRow
              key={c.id}
              client={c}
              phase={phase}
              onOpen={onOpen}
              onPhaseChange={onPhaseChange}
              theme={T}
              cols={cols}
              widths={widths}
              fontSizes={fontSizes}
              onReorder={onReorder ? handleReorder : undefined}
              dragId={dragId}
              setDragId={setDragId}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              selecting={selecting}
              selectionActive={selectionActive}
              isSelected={selectedIds.has(c.id)}
              onToggleSelect={onToggleSelectId}
            />
          ))}

          {/* הוסף לקוח — רק בשלב הראשון ורק למתפעל */}
          {isFirst && onAddClient && addingRow && (
            <InlineAddRow
              phaseId={phase.id}
              onSave={handleSave}
              onCancel={() => setAddingRow(false)}
              theme={T}
              advisors={advisors}
              isAdmin={isAdmin}
              myName={myName}
            />
          )}

          {isFirst && onAddClient && !addingRow && (
            <tr>
              <td colSpan={numCols} style={{ padding:0, borderTop:`1px solid ${border}` }}>
                <div
                  onClick={() => setAddingRow(true)}
                  style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"9px 20px", color:T.textSecondary||"#50508a", fontSize:13,
                    cursor:"pointer", transition:"all .14s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background=bg; e.currentTarget.style.color=phase.color; }}
                  onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=T.textSecondary||"#50508a"; }}
                >
                  <span style={{
                    width:20, height:20, borderRadius:"50%",
                    border:"1.5px solid currentColor",
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    fontSize:15, lineHeight:1, flexShrink:0,
                  }}>+</span>
                  הוסף לקוח חדש
                </div>
              </td>
            </tr>
          )}
        </tbody>
      )}
    </>
  );
}

/* ─── טבלה מאוחדת עם כותרת sticky ─────────────────────────────────────────── */
function UnifiedTable({ grouped, onOpen, onPhaseChange, onAddClient, theme:T={}, cols, widths, colControls, fontSizes={}, onReorder, advisors=[], isAdmin=false, myName="", selectionPhase=null, selectedIds=new Set(), onToggleSelectionMode, onToggleSelectId, onSelectAll }) {
  const { startColDrag, endDrag, startResize, dragSrc, dragOver } = colControls;

  // סנכרון גלילה אופקית
  const headerScrollRef = useRef(null);
  const bodyScrollRef   = useRef(null);

  const syncFromBody   = () => { if (headerScrollRef.current && bodyScrollRef.current) headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft; };
  const syncFromHeader = () => { if (bodyScrollRef.current && headerScrollRef.current) bodyScrollRef.current.scrollLeft = headerScrollRef.current.scrollLeft; };

  const colHdr      = T.colHeader || "#60608a";
  const border      = T.border    || "#2a2a48";
  const hdrBg       = T.headerBg  || T.rowBg || "#0e0e20";
  const firstPhase  = grouped[0]?.phase || PHASES[0];
  const totalW      = cols.reduce((s,c) => s + (widths[c.key]||120), 4);
  const colHdrFSize = fontSizes.colHeader || 11;

  const renderHeaderRow = () => (
    <table style={{ borderCollapse:"collapse", tableLayout:"fixed", width:totalW + (selectionPhase ? 40 : 0), minWidth:totalW + (selectionPhase ? 40 : 0) }}>
      <colgroup>
        <col style={{ width:4 }} />
        {selectionPhase && <col style={{ width:40 }} />}
        {cols.map(col => <col key={col.key} style={{ width:widths[col.key] }} />)}
      </colgroup>
      <thead>
        <tr style={{ background:hdrBg }}>
          <th style={{ width:4, padding:0, background:hdrBg }} />
          {selectionPhase && <th style={{ width:40, padding:0, background:hdrBg }} />}
          {cols.map(col => {
            const isDragSrc  = dragSrc  === col.key;
            const isDragOver = dragOver === col.key;
            return (
              <th
                key={col.key}
                data-colkey={col.key}
                style={{
                  padding:"9px 16px 9px 8px",
                  fontSize:colHdrFSize, fontWeight:800,
                  color: isDragSrc ? firstPhase.color : (isDragOver ? T.textPrimary||"#fff" : colHdr),
                  textAlign:"right", letterSpacing:.5,
                  borderBottom:`2px solid ${firstPhase.color}55`,
                  borderLeft: isDragOver ? `2px solid ${firstPhase.color}` : "2px solid transparent",
                  userSelect:"none",
                  background: isDragSrc ? firstPhase.color+"22" : hdrBg,
                  transition:"background .12s, color .12s",
                  position:"relative",
                  width: widths[col.key], minWidth: widths[col.key], maxWidth: widths[col.key],
                  overflow:"hidden", whiteSpace:"nowrap",
                  touchAction:"none",
                }}
              >
                {/* ⠿ ידית גרירה — לחיצה/נגיעה מתחילה גרירה */}
                <span
                  onMouseDown={e => startColDrag(col.key, e)}
                  onTouchStart={e => startColDrag(col.key, e)}
                  style={{
                    display:"inline-block", opacity:.4, fontSize:13,
                    marginLeft:6, cursor:"grab", verticalAlign:"middle",
                    touchAction:"none", userSelect:"none",
                    padding:"0 2px",
                  }}
                  title="גרור לשינוי סדר עמודות"
                >⠿</span>
                {col.label}

                {/* ידית resize — שמאל ל-RTL, רחבה יותר לנייד */}
                <span
                  onMouseDown={e => {
                    const startX = e.clientX;
                    startResize(col.key, startX, widths[col.key], e);
                  }}
                  onTouchStart={e => {
                    const startX = e.touches[0].clientX;
                    startResize(col.key, startX, widths[col.key], e);
                  }}
                  onClick={e => e.stopPropagation()}
                  title="גרור להרחבת/כיווץ עמודה"
                  style={{
                    position:"absolute", left:0, top:0, bottom:0,
                    width:12,
                    cursor:"col-resize",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    zIndex:10, touchAction:"none",
                  }}
                >
                  <span style={{
                    width:3, height:18, borderRadius:2,
                    background: isDragOver ? firstPhase.color : border,
                    display:"block", transition:"background .12s, width .1s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background=firstPhase.color; e.currentTarget.style.width="4px"; }}
                    onMouseLeave={e => { e.currentTarget.style.background=border; e.currentTarget.style.width="3px"; }}
                  />
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
    </table>
  );

  return (
    <div style={{ position:"relative" }}>

      {/* ── כותרת נדבקת — overflow hidden, מסונכרנת עם גוף ── */}
      <div
        ref={headerScrollRef}
        onScroll={syncFromHeader}
        style={{
          position:"sticky", top:60, zIndex:150,
          overflowX:"auto", overflowY:"hidden",
          boxShadow:"0 3px 10px rgba(0,0,0,.18)",
          /* מסתיר את scrollbar של ה-header */
          scrollbarWidth:"none",
          msOverflowStyle:"none",
        }}
      >
        <style>{`.onyx-hdr::-webkit-scrollbar{display:none}`}</style>
        <div className="onyx-hdr" style={{ width:totalW, minWidth:totalW }}>
          {renderHeaderRow()}
        </div>
      </div>

      {/* ── גוף הטבלה — גולל אופקית ומסנכרן ── */}
      <div
        ref={bodyScrollRef}
        onScroll={syncFromBody}
        style={{ overflowX:"auto", overflowY:"visible" }}
      >
        <table style={{ borderCollapse:"collapse", tableLayout:"fixed", width:totalW + (selectionPhase ? 40 : 0), minWidth:totalW + (selectionPhase ? 40 : 0) }}>
          <colgroup>
            <col style={{ width:4 }} />
            {selectionPhase && <col style={{ width:40 }} />}
            {cols.map(col => <col key={col.key} style={{ width:widths[col.key] }} />)}
          </colgroup>
          {grouped.map(({ phase, clients:gc }, idx) => (
            <PhaseGroupRows
              key={phase.id}
              phase={phase}
              clients={gc}
              onOpen={onOpen}
              onPhaseChange={onPhaseChange}
              onAddClient={onAddClient}
              theme={T}
              cols={cols}
              widths={widths}
              fontSizes={fontSizes}
              isFirst={idx === 0}
              onReorder={onReorder}
              advisors={advisors}
              isAdmin={isAdmin}
              myName={myName}
              selectionPhase={selectionPhase}
              selectedIds={selectedIds}
              onToggleSelectionMode={onToggleSelectionMode}
              onToggleSelectId={onToggleSelectId}
              onSelectAll={onSelectAll}
              selectionActive={!!selectionPhase}
            />
          ))}
        </table>
      </div>

    </div>
  );
}

/* ─── ערכות צבעים מוגדרות מראש ───────────────────────────────────────────── */
const PRESETS = [
  {
    name:"Dark Classic", emoji:"🌑",
    bg:"#0a0a18", headerBg:"#0e0e20", cardBg:"#111122",
    groupBg:"#0f0f20", rowBg:"#0f0f22", rowHover:"#181830",
    textPrimary:"#d8d8f0", textSecondary:"#50508a",
    border:"#2a2a48", colHeader:"#60608a",
    drawerBg:"#10101f", drawerCard:"#16162c", drawerBorder:"#2a2a48",
    drawerText:"#e0e0f8", drawerSubText:"#6060a0", drawerInput:"#1a1a2e",
    phases:["#7c6fcd","#e8a838","#2d88d4","#3dba7e","#d4704a","#6abf6a"],
  },
  {
    name:"Light Mode", emoji:"☀️",
    bg:"#f0f2f8", headerBg:"#ffffff", cardBg:"#ffffff",
    groupBg:"#e8eaf4", rowBg:"#f8f8ff", rowHover:"#eeeef8",
    textPrimary:"#1a1a3a", textSecondary:"#6070a0",
    border:"#d0d4e8", colHeader:"#6070a0",
    drawerBg:"#f4f6ff", drawerCard:"#ffffff", drawerBorder:"#d0d4e8",
    drawerText:"#1a1a3a", drawerSubText:"#6070a0", drawerInput:"#eef0f8",
    phases:["#6c5ecf","#d4921a","#1a70c0","#1a9a5a","#c0501a","#2a9a2a"],
  },
];

const LIGHT_PRESET   = PRESETS[1]; // Light Mode
const DEFAULT_THEME  = LIGHT_PRESET;

// snapshot קפוא של ערכי Light Mode המקוריים — לשחזור מהימן
const LIGHT_ORIGINAL = JSON.parse(JSON.stringify(LIGHT_PRESET));

/* ── כתיבת ברירות המחדל ל-localStorage בפעם הראשונה ──
   אם אין שמירה קיימת, שמור את Light Mode + גדלי טקסט ברירת מחדל.
   כך בכל פתיחה ראשונה (או לאחר ניקוי) נטענת Light Mode. */
(function seedDefaults() {
  try {
    if (!localStorage.getItem("onyx_theme")) {
      localStorage.setItem("onyx_theme",        JSON.stringify(LIGHT_ORIGINAL));
      localStorage.setItem("onyx_phase_colors",  JSON.stringify(LIGHT_ORIGINAL.phases));
    }
    // תמיד כתוב את גדלי הכתב הקבועים — שם לקוח 18px, התנהלות התיק 17px
    const savedFonts = (() => { try { return JSON.parse(localStorage.getItem("onyx_font_sizes")||"{}"); } catch{return {};} })();
    localStorage.setItem("onyx_font_sizes", JSON.stringify({
      ...savedFonts,
      name:     18,   // קבוע
      timeline: 17,   // קבוע
    }));
    // כתוב סדר עמודות רק אם לא קיים — כדי לשמור על סדר שהמשתמש הגדיר
    if (!localStorage.getItem("onyx_col_order")) {
      localStorage.setItem("onyx_col_order", JSON.stringify(
        ["name","timeline","phase","phone","handler","opFor","fee"]
      ));
    }
  } catch(e) {}
})();

/* ─── פאנל בחירת צבעים ───────────────────────────────────────────────────── */
function ColorPickerPanel({ theme, onThemeChange, onClose, phases, onPhasesChange }) {
  const [editingPreset, setEditingPreset] = useState(null);
  const [drafts, setDrafts] = useState(
    PRESETS.map(p => ({ ...p, phases: [...p.phases] }))
  );
  // גרירה
  const [panelPos, setPanelPos] = useState({ x: Math.max(0, window.innerWidth - 320), y: 60 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x:0, y:0 });

  const phaseNames = ["צריך להתקשר","לאחר שיחה","פולואו אפ","מעוניינים - התחילו התאמה","חתמו מול מתווך","לא מעוניינים"];

  const COLOR_FIELDS = [
    { key:"bg",           label:"רקע הדף",           group:"כללי" },
    { key:"headerBg",     label:"פס עליון",           group:"כללי" },
    { key:"cardBg",       label:"כרטיסי סטטיסטיקות", group:"כללי" },
    { key:"groupBg",      label:"כותרת קבוצה",        group:"כללי" },
    { key:"rowBg",        label:"רקע שורה",           group:"טבלה" },
    { key:"rowHover",     label:"שורה (Hover)",       group:"טבלה" },
    { key:"colHeader",    label:"כותרות עמודות",      group:"טבלה" },
    { key:"border",       label:"קווי גבול",          group:"טבלה" },
    { key:"textPrimary",  label:"טקסט ראשי",          group:"טקסט" },
    { key:"textSecondary",label:"טקסט משני",           group:"טקסט" },
    { key:"drawerBg",     label:"רקע פאנל לקוח",     group:"פאנל לקוח" },
    { key:"drawerCard",   label:"כרטיס פרטים",        group:"פאנל לקוח" },
    { key:"drawerBorder", label:"גבול פאנל",          group:"פאנל לקוח" },
    { key:"drawerText",   label:"טקסט פאנל",          group:"פאנל לקוח" },
    { key:"drawerSubText",label:"תוויות פאנל",        group:"פאנל לקוח" },
    { key:"drawerInput",  label:"שדות קלט",           group:"פאנל לקוח" },
  ];
  const groups = ["כללי","טבלה","טקסט","פאנל לקוח"];

  /* ── גרירה ── */
  const startDrag = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y };
    const onMove = (ev) => {
      if (!isDragging.current) return;
      setPanelPos({
        x: Math.max(0, Math.min(window.innerWidth  - 290, ev.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 80,  ev.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  /* ── עדכון צבע live ── */
  const applyLive = (nextDraft, pi) => {
    if (nextDraft.name === theme.name) {
      onThemeChange({ ...nextDraft });
      onPhasesChange([...nextDraft.phases]);
    }
  };
  const updateDraft = (pi, key, val) => {
    setDrafts(prev => {
      const next = prev.map((d,i) => i===pi ? { ...d, [key]: val } : d);
      applyLive(next[pi], pi);
      return next;
    });
  };
  const updateDraftPhase = (pi, phaseIdx, val) => {
    setDrafts(prev => {
      const next = prev.map((d,i) => i===pi
        ? { ...d, phases: d.phases.map((c,j) => j===phaseIdx ? val : c) }
        : d
      );
      applyLive(next[pi], pi);
      return next;
    });
  };

  const saveDraft = (pi) => {
    const saved = { ...drafts[pi], phases: [...drafts[pi].phases] };
    PRESETS[pi] = saved;
    onThemeChange({ ...saved });
    onPhasesChange([...saved.phases]);
    setEditingPreset(null);
  };
  const cancelDraft = (pi) => {
    const orig = { ...PRESETS[pi], phases: [...PRESETS[pi].phases] };
    setDrafts(prev => prev.map((d,i) => i===pi ? orig : d));
    if (drafts[pi].name === theme.name) { onThemeChange({...orig}); onPhasesChange([...orig.phases]); }
    setEditingPreset(null);
  };
  const activatePreset = (pi) => { onThemeChange({...drafts[pi]}); onPhasesChange([...drafts[pi].phases]); };

  /* ── ColorRowWithConfirm ── שורת צבע עם popup אישור ── */
  function ColorRowWithConfirm({ label, currentValue, onConfirm, bgColor, bdColor, txtColor }) {
    const [localVal, setLocalVal] = useState(currentValue);
    const [open, setOpen]         = useState(false);

    // כשהvalue החיצוני משתנה (ביטול וכו') — סנכרן
    useEffect(() => { setLocalVal(currentValue); }, [currentValue]);

    const confirm = () => { onConfirm(localVal); setOpen(false); };
    const cancel  = () => { setLocalVal(currentValue); setOpen(false); };

    return (
      <div style={{ position:"relative", marginBottom:3 }}>
        <div style={{
          display:"flex", alignItems:"center",
          padding:"5px 10px", borderRadius:6,
          background: bgColor || "#16162c",
          border:`1px solid ${bdColor || "#2a2a48"}`,
        }}>
          <span style={{ fontSize:11, color:txtColor||"#9090b0", fontWeight:600, flex:1, marginLeft:8 }}>{label}</span>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {/* ריבוע צבע — לחיצה פותחת popup */}
            <div
              onClick={() => setOpen(o => !o)}
              style={{
                width:26, height:26, borderRadius:5,
                background: currentValue,
                border:`2px solid ${bdColor||"#3a3a60"}`,
                cursor:"pointer",
                boxShadow:"0 0 0 1px rgba(0,0,0,.2)",
                flexShrink:0,
              }}
            />
            <span style={{ fontSize:9, color:txtColor||"#6060a0", fontFamily:"monospace", minWidth:52 }}>{currentValue}</span>
          </div>
        </div>

        {/* Popup עם input צבע + אישור/ביטול */}
        {open && (
          <div style={{
            position:"absolute", left:0, top:"calc(100% + 4px)",
            zIndex:9999,
            background:"#ffffff",
            border:"1px solid #c8d0e8",
            borderRadius:10,
            padding:"12px",
            boxShadow:"0 8px 32px rgba(80,80,160,.22)",
            display:"flex", flexDirection:"column", alignItems:"center", gap:8,
            minWidth:160,
          }}>
            <div style={{ fontSize:10, color:"#5050a0", fontWeight:700 }}>בחר צבע</div>
            <input
              type="color"
              value={localVal}
              onChange={e => setLocalVal(e.target.value)}
              style={{
                width:110, height:70, border:"none",
                borderRadius:6, cursor:"pointer",
                background:"none", padding:2,
              }}
            />
            <div style={{ fontSize:10, color:"#6060a0", fontFamily:"monospace" }}>{localVal}</div>
            <div style={{ display:"flex", gap:6, width:"100%" }}>
              <button
                onClick={confirm}
                style={{
                  flex:1, background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
                  color:"#fff", border:"none", borderRadius:6,
                  padding:"6px", fontSize:11, fontWeight:800, cursor:"pointer",
                }}
              >✓ אישור</button>
              <button
                onClick={cancel}
                style={{
                  background:"#eef0f8", color:"#5060a0",
                  border:"1px solid #c8d0e8", borderRadius:6,
                  padding:"6px 10px", fontSize:11, cursor:"pointer",
                }}
              >ביטול</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── PreviewCard ── */
  function PreviewCard({ d, pi }) {
    const isActive  = theme.name === d.name;
    const isEditing = editingPreset === pi;
    return (
      <div style={{
        borderRadius:10, overflow:"hidden",
        border: isActive ? "2px solid #7c6fcd" : "2px solid #2a2a48",
        boxShadow: isActive ? "0 0 16px #7c6fcd44" : "none",
        transition:"all .15s",
      }}>
        <div
          onClick={() => !isEditing && activatePreset(pi)}
          style={{ background:d.bg, padding:"10px 12px", cursor: isEditing?"default":"pointer" }}
        >
          <div style={{ background:d.headerBg, borderRadius:5, padding:"5px 8px", marginBottom:5, display:"flex", gap:5, alignItems:"center" }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:d.phases[0] }} />
            <div style={{ flex:1,height:3,background:d.textSecondary,borderRadius:2,opacity:.35 }} />
          </div>
          <div style={{ display:"flex", gap:2, marginBottom:5 }}>
            {d.phases.map((c,i)=><div key={i} style={{ flex:1,height:4,borderRadius:2,background:c }} />)}
          </div>
          <div style={{ background:d.cardBg, borderRadius:4, padding:"5px 8px", border:`1px solid ${d.border}` }}>
            <div style={{ height:3,width:"60%",background:d.textPrimary,borderRadius:2,opacity:.5,marginBottom:3 }} />
            <div style={{ height:3,width:"40%",background:d.textSecondary,borderRadius:2,opacity:.4 }} />
          </div>
        </div>
        <div style={{ padding:"7px 10px", background:d.groupBg, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:12, fontWeight:800, color:d.textPrimary }}>{d.emoji} {d.name}</span>
          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
            {isActive && !isEditing && <span style={{ fontSize:10, color:"#7c6fcd", fontWeight:700 }}>✓ פעיל</span>}
            {!isEditing ? (
              <button onClick={e => { e.stopPropagation(); setEditingPreset(pi); activatePreset(pi); }} style={{
                background:"#2a2a4a", border:"1px solid #4a4a8a",
                color:"#b0b0e0", borderRadius:5, padding:"3px 10px",
                fontSize:10, fontWeight:700, cursor:"pointer",
              }}>✏️ ערוך</button>
            ) : (
              <div style={{ display:"flex", gap:5 }}>
                <button onClick={() => saveDraft(pi)} style={{
                  background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
                  color:"#fff", border:"none", borderRadius:5,
                  padding:"3px 10px", fontSize:10, fontWeight:800, cursor:"pointer",
                }}>✓ שמור</button>
                <button onClick={() => cancelDraft(pi)} style={{
                  background:"#1a1a38", color:"#888",
                  border:"1px solid #2a2a50", borderRadius:5,
                  padding:"3px 8px", fontSize:10, cursor:"pointer",
                }}>ביטול</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pi = editingPreset;
  const d  = pi !== null ? drafts[pi] : null;

  return (
    <>
      {/* ── פאנל עריכה ניתן לגרירה ── */}
      {pi !== null && d && (
        <div
          dir="rtl"
          style={{
            position:"fixed",
            left: panelPos.x,
            top:  panelPos.y,
            width:290,
            zIndex:2000,
            background: d.drawerBg || "#13132b",
            borderRadius:14,
            border:`2px solid ${d.drawerBorder||"#4a4a8a"}`,
            boxShadow:"0 12px 48px rgba(0,0,0,.75)",
            display:"flex", flexDirection:"column",
            maxHeight:"80vh",
          }}
        >
          {/* ─ כותרת / ידית גרירה ─ */}
          <div
            onMouseDown={startDrag}
            style={{
              padding:"11px 14px 8px",
              borderBottom:`1px solid ${d.drawerBorder||"#2020408a"}`,
              background: d.headerBg || "#111128",
              borderRadius:"12px 12px 0 0",
              cursor:"grab",
              flexShrink:0,
              userSelect:"none",
            }}
          >
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ fontSize:14, opacity:.4 }}>⠿</span>
                <span style={{ fontSize:14 }}>🎨</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:900, color:d.textPrimary }}>עריכת: {d.name}</div>
                  <div style={{ fontSize:9, color:d.textSecondary }}>גרור לשינוי מיקום · שינויים בזמן אמת</div>
                </div>
              </div>
              <button onMouseDown={e=>e.stopPropagation()} onClick={() => cancelDraft(pi)} style={{
                background:"none", border:"none", color:d.textSecondary, fontSize:16, cursor:"pointer",
              }}>✕</button>
            </div>
            <div style={{ display:"flex", gap:7 }}>
              <button onMouseDown={e=>e.stopPropagation()} onClick={() => saveDraft(pi)} style={{
                flex:1, background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
                color:"#fff", border:"none", borderRadius:6,
                padding:"6px", fontSize:11, fontWeight:800, cursor:"pointer",
              }}>✓ שמור שינויים</button>
              <button onMouseDown={e=>e.stopPropagation()} onClick={() => cancelDraft(pi)} style={{
                background: d.drawerInput||"#1a1a38", color:d.textSecondary,
                border:`1px solid ${d.drawerBorder||"#2a2a50"}`,
                borderRadius:6, padding:"6px 10px", fontSize:11, cursor:"pointer",
              }}>ביטול</button>
            </div>
          </div>

          {/* ─ רשימת צבעים ─ */}
          <div style={{ overflowY:"auto", flex:1, padding:"10px 12px" }}>
            {groups.map(grp => (
              <div key={grp} style={{ marginBottom:12 }}>
                <div style={{
                  fontSize:9, fontWeight:800, color:d.textSecondary,
                  letterSpacing:.9, marginBottom:6, textTransform:"uppercase",
                  paddingBottom:3, borderBottom:`1px solid ${d.border||"#2a2a48"}`,
                }}>{grp}</div>
                {COLOR_FIELDS.filter(f=>f.group===grp).map(field => (
                  <ColorRowWithConfirm
                    key={field.key}
                    label={field.label}
                    currentValue={d[field.key]||"#000000"}
                    onConfirm={val => updateDraft(pi, field.key, val)}
                    bgColor={d.rowBg}
                    bdColor={d.border}
                    txtColor={d.textSecondary}
                  />
                ))}
              </div>
            ))}

            {/* צבעי שלבים */}
            <div style={{
              fontSize:9, fontWeight:800, color:d.textSecondary,
              letterSpacing:.9, marginBottom:6, textTransform:"uppercase",
              paddingBottom:3, borderBottom:`1px solid ${d.border||"#2a2a48"}`,
            }}>צבעי שלבים</div>
            {phaseNames.map((name, idx) => (
              <ColorRowWithConfirm
                key={"ph_"+idx}
                label={name}
                currentValue={d.phases[idx]||"#888888"}
                onConfirm={val => updateDraftPhase(pi, idx, val)}
                bgColor={d.rowBg}
                bdColor={d.border}
                txtColor={d.textSecondary}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── מסך בחירת ערכה ── */}
      <div style={{
        position:"fixed", inset:0,
        background: pi !== null ? "rgba(0,0,0,.2)" : "rgba(0,0,0,.65)",
        display:"flex", alignItems:"center", justifyContent:"center",
        zIndex:1000,
        transition:"background .2s",
      }} onClick={e => { if (e.target===e.currentTarget && pi===null) onClose(); }}>
        <div dir="rtl" style={{
          background:"#13132b", borderRadius:16,
          border:"1px solid #3030608a",
          width:520, maxWidth:"96vw",
          display:"flex", flexDirection:"column",
          boxShadow:"0 32px 80px #000c",
          animation:"fadeUp .2s ease",
          overflow:"hidden",
          opacity: pi !== null ? 0.35 : 1,
          pointerEvents: pi !== null ? "none" : "auto",
          transition:"opacity .2s",
        }}>
          <div style={{
            padding:"14px 20px 10px", borderBottom:"1px solid #2020408a",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            background:"linear-gradient(135deg,#16163a,#111128)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18 }}>🎨</span>
              <div>
                <div style={{ fontSize:14, fontWeight:900, color:"#eeeeff" }}>בחירת צבעים</div>
                <div style={{ fontSize:10, color:"#6060a0" }}>לחץ ✏️ ערוך לפאנל גרירה עם תצוגה חיה · לחץ על ערכה להפעלה</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"#777", fontSize:22, cursor:"pointer" }}>✕</button>
          </div>

          <div style={{ padding:"16px 20px 20px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {PRESETS.map((_, pi2) => (
                <PreviewCard key={pi2} d={drafts[pi2]} pi={pi2} />
              ))}
            </div>
          </div>

          <div style={{
            padding:"10px 20px", borderTop:"1px solid #2020408a",
            display:"flex", gap:10, background:"#0f0f22", alignItems:"center",
          }}>
            <button onClick={onClose} style={{
              background:"linear-gradient(135deg,#6c5ecf,#2d88d4)",
              color:"#fff", border:"none", borderRadius:8,
              padding:"9px 22px", fontSize:13, fontWeight:800, cursor:"pointer",
            }}>✓ סגור</button>
            <span style={{ fontSize:11, color:"#40407a" }}>
              לחץ על ✏️ ערוך — פאנל הגרירה ייפתח ותראה שינויים בזמן אמת
            </span>
          </div>
        </div>
      </div>
    </>
  );
}



/* ─── פאנל גודל כתב ──────────────────────────────────────────────────────── */
const FONT_COLS = [
  { key:"name",       label:"שם הלקוח",          group:"עמודות טבלה" },
  { key:"handler",    label:"מטופל על ידי",       group:"עמודות טבלה" },
  { key:"timeline",   label:"התנהלות התיק",       group:"עמודות טבלה" },
  { key:"phone",      label:"טלפון",              group:"עמודות טבלה" },
  { key:"opFor",      label:"תפעול ע״י",          group:"עמודות טבלה" },
  { key:"fee",        label:"שכר טרחה",           group:"עמודות טבלה" },
  { key:"phase",      label:"שלב",                group:"עמודות טבלה" },
  { key:"colHeader",  label:"כותרת עמודות",       group:"כותרת טבלה" },
  { key:"drawerText", label:"טקסט כרטיס לקוח",   group:"כרטיס לקוח" },
  { key:"drawerSub",  label:"תוויות כרטיס לקוח", group:"כרטיס לקוח" },
];
const DEFAULT_FONT_SIZES = {
  name:       18,
  handler:    13,
  timeline:   17,
  bank:       13,
  phone:      13,
  tid:        13,
  opFor:      13,
  fee:        13,
  phase:      13,
  colHeader:  11,
  drawerText: 13,
  drawerSub:  11,
};

function FontSizePanel({ sizes, onChange, onClose, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const panelBg  = isLight ? "#ffffff" : "#13132b";
  const panelBdr = isLight ? "#d0d4e8" : "#4040708a";
  const rowBg    = isLight ? "#f4f6ff" : "#16162c";
  const rowBdr   = isLight ? "#d8ddf0" : "#2a2a48";
  const labelC   = isLight ? "#3a4060" : "#a0a0d0";
  const countC   = isLight ? "#6c5ecf" : "#7c6fcd";
  const hdrBg    = isLight ? "linear-gradient(135deg,#f0eeff,#e8f0ff)" : "linear-gradient(135deg,#16163a,#111128)";
  const hdrTxt   = isLight ? "#2a2050" : "#eeeeff";
  const hdrSub   = isLight ? "#7070b0" : "#6060a0";
  const btnBg    = isLight ? "#e8e0ff" : "#1a1a3a";
  const btnC     = isLight ? "#5050a0" : "#a0a0d0";
  const btnBdr   = isLight ? "#c0b8e8" : "#3a3a60";
  const footBg   = isLight ? "#eef0f8" : "#0f0f22";

  const reset = () => onChange(DEFAULT_FONT_SIZES);
  const groups = [...new Set(FONT_COLS.map(c=>c.group))];

  // גרירה
  const [pos, setPos] = useState({ x: Math.max(0, window.innerWidth - 300), y: 70 });
  const dragRef = useRef(null);

  const onDragStart = (e) => {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
    const startX = e.clientX - pos.x, startY = e.clientY - pos.y;
    const onMove = (mv) => setPos({
      x: Math.max(0, Math.min(window.innerWidth  - 270, mv.clientX - startX)),
      y: Math.max(0, Math.min(window.innerHeight - 80,  mv.clientY - startY)),
    });
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  return (
    <div
      ref={dragRef}
      dir="rtl"
      style={{
        position:"fixed",
        left: pos.x,
        top:  pos.y,
        width:270,
        zIndex:2000,
        background:panelBg,
        borderRadius:14,
        border:`2px solid ${panelBdr}`,
        boxShadow: isLight
          ? "0 8px 40px rgba(100,80,200,.22)"
          : "0 12px 48px rgba(0,0,0,.7)",
        display:"flex", flexDirection:"column",
        maxHeight:"82vh",
        userSelect:"none",
      }}
    >
      {/* ─ כותרת / ידית גרירה ─ */}
      <div
        onMouseDown={onDragStart}
        style={{
          padding:"10px 14px 8px",
          borderBottom:`1px solid ${rowBdr}`,
          background:hdrBg,
          borderRadius:"12px 12px 0 0",
          cursor:"grab",
          flexShrink:0,
        }}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <span style={{ fontSize:13, opacity:.4 }}>⠿</span>
            <span style={{ fontSize:14 }}>🔤</span>
            <span style={{ fontSize:13, fontWeight:900, color:hdrTxt }}>גודל כתב</span>
          </div>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            style={{ background:"none", border:"none", color:hdrSub, fontSize:18, cursor:"pointer", lineHeight:1 }}
          >✕</button>
        </div>
        <div style={{ fontSize:9, color:hdrSub, marginTop:3 }}>גרור לשינוי מיקום · שינויים בזמן אמת</div>
      </div>

      {/* ─ שורות ─ */}
      <div style={{ overflowY:"auto", flex:1, padding:"10px 12px" }}>
        {groups.map(grp => (
          <div key={grp} style={{ marginBottom:12 }}>
            <div style={{
              fontSize:9, fontWeight:800, color:hdrSub,
              letterSpacing:.8, marginBottom:6, textTransform:"uppercase",
              paddingBottom:3, borderBottom:`1px solid ${rowBdr}`,
            }}>{grp}</div>
            {FONT_COLS.filter(c=>c.group===grp).map(col => {
              const sz = sizes[col.key] || DEFAULT_FONT_SIZES[col.key] || 13;
              return (
                <div key={col.key} style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"5px 8px", marginBottom:4,
                  background:rowBg, borderRadius:7,
                  border:`1px solid ${rowBdr}`,
                }}>
                  <span style={{ fontSize:11, fontWeight:700, color:labelC, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {col.label}
                  </span>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => onChange({...sizes,[col.key]:Math.max(9,sz-1)})}
                    style={{ background:btnBg, border:`1px solid ${btnBdr}`, color:btnC,
                      borderRadius:4, width:22, height:22, cursor:"pointer", fontSize:13,
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
                  <input
                    type="range" min={9} max={22} value={sz}
                    onMouseDown={e => e.stopPropagation()}
                    onChange={e => onChange({...sizes,[col.key]:Number(e.target.value)})}
                    style={{ width:60, accentColor:"#7c6fcd", cursor:"pointer", flexShrink:0 }}
                  />
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => onChange({...sizes,[col.key]:Math.min(22,sz+1)})}
                    style={{ background:btnBg, border:`1px solid ${btnBdr}`, color:btnC,
                      borderRadius:4, width:22, height:22, cursor:"pointer", fontSize:13,
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                  <span style={{ minWidth:24, textAlign:"center", fontSize:10, color:countC, fontWeight:800, flexShrink:0 }}>{sz}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ─ כפתורים ─ */}
      <div style={{
        padding:"8px 12px", display:"flex", gap:8,
        borderTop:`1px solid ${rowBdr}`, background:footBg,
        borderRadius:"0 0 12px 12px", flexShrink:0,
      }}>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
          style={{
            background:"linear-gradient(135deg,#6c5ecf,#2d88d4)",
            color:"#fff", border:"none", borderRadius:7,
            padding:"7px", fontSize:12, fontWeight:800, cursor:"pointer", flex:1,
          }}>✓ שמור</button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={reset}
          style={{
            background:btnBg, color:btnC, border:`1px solid ${btnBdr}`,
            borderRadius:7, padding:"7px 10px", fontSize:12, cursor:"pointer",
          }}>↺</button>
      </div>
    </div>
  );
}

/* ─── localStorage helpers ───────────────────────────────────────────────── */
const LS = {
  get: (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v)        => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  clear: (keys)      => { try { keys.forEach(k => localStorage.removeItem(k)); } catch {} },
};

/* ─── רישום יועצים ───────────────────────────────────────────────────────────
   רשימת היועצים נטענת מטבלת "advisors" ב-Supabase (ניהול דינמי).
   מנהל המערכת (אדמין) הוא כל אימייל שאינו ברשימת היועצים.
   הרשימה הקשיחה כאן משמשת רק כ-fallback אם הטבלה לא זמינה.
   ────────────────────────────────────────────────────────────────────────── */
const ADVISORS_FALLBACK = [
  { email: "tom@bereshit.biz", name: "תום" },
];

// ── אימייל ה-Super Admin היחיד במערכת — קשיח בקוד, לא ניתן לשינוי/הדחה ──
// כל בדיקת super_admin עוברת דרך הקבוע הזה, אף פעם לא רק לפי metadata,
// כך שגם אם מישהו ישנה בטעות (או בזדון) את ה-user_metadata שלו ב-Supabase,
// הבדיקה כאן עדיין תזהה אותו נכון לפי כתובת המייל הקבועה.
const SUPER_ADMIN_EMAIL = "bo4wiseli@gmail.com";

// קובע תפקיד לפי אובייקט המשתמש המלא מ-Supabase Auth (session.user) + רשימת advisors.
// היררכיה תלת-שכבתית, נבדקת בסדר עדיפויות קשיח:
//   1. super_admin  — רק bo4wiseli@gmail.com, תמיד, ללא יוצא מן הכלל, לא תלוי בשום טבלה
//   2. admin        — advisors.role==='admin' (המקור העיקרי, ניתן לעדכון מ"ניהול מוכרנים"),
//                      או user_metadata.role כגיבוי משני אם הוגדר ידנית ב-Supabase Dashboard
//   3. sales        — ברירת המחדל לכל משתמש אחר (מודל בעלות-סוכן מבודד, advisor_email===email)
const getUserRole = (user, advisorList = ADVISORS_FALLBACK) => {
  if (!user) return null;
  const email = (user.email || "").toLowerCase().trim();
  if (email === SUPER_ADMIN_EMAIL) return "super_admin";
  const meta = user.user_metadata || {};
  if (meta.role === "admin" || meta.role === "super_admin" || meta.is_admin === true) return "admin";
  const row = advisorList.find(a => (a.email || "").toLowerCase().trim() === email);
  if (row && (row.role === "admin" || row.role === "super_admin")) return "admin";
  return "sales";
};

// תאימות לאחור: גרסה ישנה שמקבלת אימייל בלבד (ללא metadata) — נשמרת למקרים שאין session מלא זמין
const getRoleByEmail = (email) =>
  (email || "").toLowerCase().trim() === SUPER_ADMIN_EMAIL ? "super_admin" : "sales";

// שם תצוגה של יועץ לפי אימייל
const getAdvisorName = (email, advisorList = ADVISORS_FALLBACK) =>
  advisorList.find(a => a.email === (email || "").toLowerCase().trim())?.name
  || email || "";

// טעינת רשימת יועצים מ-Supabase
const fetchAdvisors = async () => {
  if (!supabase) return ADVISORS_FALLBACK;
  try {
    const { data, error } = await supabase
      .from("advisors")
      .select("email, name, role")
      .order("name", { ascending: true });
    if (error || !data) return ADVISORS_FALLBACK;
    return data.map(a => ({ email: (a.email||"").toLowerCase().trim(), name: a.name || a.email, role: a.role || "sales" }));
  } catch {
    return ADVISORS_FALLBACK;
  }
};


/* ─── מסך התחברות — Supabase Auth ─────────────────────────────────────────── */
function LoginScreen({ onSuccess }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("נא להזין אימייל וסיסמה"); return; }
    if (!supabase) { setError("חיבור ל-Supabase לא מוגדר"); return; }
    setLoading(true); setError("");
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (authErr) {
      const msg =
        authErr.message.includes("Invalid login") ? "אימייל או סיסמה שגויים" :
        authErr.message.includes("Email not confirmed") ? "יש לאשר את כתובת המייל" :
        authErr.message;
      setError(msg);
    }
    // הצלחה — onAuthStateChange ב-CRMApp יטפל בהמשך
  };

  return (
    <div dir="rtl" style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#f0eeff 0%,#e8f0ff 50%,#f4f0ff 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Heebo',sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{
        background:"#ffffff", borderRadius:20,
        border:"1px solid #d8d0f0",
        padding:"40px 36px", width:360, maxWidth:"92vw",
        boxShadow:"0 16px 60px rgba(100,80,200,.18)",
        animation:"fadeUp .3s ease",
      }}>
        {/* לוגו */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{
            width:52, height:52, borderRadius:13,
            background:"linear-gradient(135deg,#7c6fcd,#2d88d4)",
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            fontWeight:900, fontSize:24, color:"#fff",
            boxShadow:"0 0 24px #6c5ecf44", marginBottom:12,
          }}>O</div>
          <div style={{ fontSize:19, fontWeight:900, color:"#1a1a3a", marginBottom:4 }}>Onyx Mortgages</div>
          <div style={{ fontSize:12, color:"#8080b0" }}>מערכת ניהול משכנתאות</div>
        </div>

        {/* שדה אימייל */}
        <div style={{ marginBottom:12 }}>
          <label style={{ display:"block", fontSize:11, color:"#7070a0", fontWeight:700, marginBottom:5 }}>אימייל</label>
          <input
            type="email" value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key==="Enter" && handleLogin()}
            placeholder="your@email.com"
            dir="ltr"
            disabled={loading}
            style={{
              width:"100%", padding:"11px 14px",
              background:"#f4f2ff", border:"2px solid #d0c8f0",
              borderRadius:10, fontSize:14, outline:"none",
              fontFamily:"inherit", color:"#2a2050",
            }}
            autoFocus
          />
        </div>

        {/* שדה סיסמה */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:11, color:"#7070a0", fontWeight:700, marginBottom:5 }}>סיסמה</label>
          <input
            type="password" value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => e.key==="Enter" && handleLogin()}
            placeholder="••••••••"
            disabled={loading}
            style={{
              width:"100%", padding:"11px 14px",
              background:"#f4f2ff", border:"2px solid #d0c8f0",
              borderRadius:10, fontSize:14, outline:"none",
              fontFamily:"inherit", color:"#2a2050",
            }}
          />
        </div>

        {/* שגיאה */}
        {error && (
          <div style={{
            background:"#fff0f0", border:"1px solid #f0b0b0",
            borderRadius:8, padding:"8px 12px", marginBottom:14,
            color:"#c03030", fontSize:13, fontWeight:700,
            display:"flex", alignItems:"center", gap:7,
          }}>⚠️ {error}</div>
        )}

        {/* כניסה */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width:"100%", padding:"12px",
            background: loading ? "#c0b8e8" : "linear-gradient(135deg,#7c6fcd,#2d88d4)",
            color:"#fff", border:"none", borderRadius:10,
            fontSize:15, fontWeight:900,
            cursor: loading ? "default" : "pointer",
            boxShadow:"0 4px 18px #6c5ecf33",
            transition:"background .2s",
          }}
        >{loading ? "מתחבר…" : "כניסה למערכת"}</button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:"#b0b0c8" }}>
          גישה לעובדי WISELI בלבד
        </div>
      </div>
    </div>
  );
}

/* ─── פאנל ניהול מוכרנים (אדמין/סופר-אדמין) ───────────────────────────────── */
const UNASSIGNED_POOL_EMAIL = "unassigned@wiseli.pool";
const UNASSIGNED_POOL_NAME  = "לידים ולקוחות למיון";

function AdvisorManagementPanel({ advisors, onReload, onClose, isSuperAdmin=false, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const [list,    setList]    = useState(advisors);
  const [email,   setEmail]   = useState("");
  const [name,    setName]    = useState("");
  const [busy,    setBusy]    = useState(false);
  const [msg,     setMsg]     = useState("");

  const panelBg = isLight ? "#ffffff" : "#13132b";
  const cardBg  = isLight ? "#f4f6ff" : "#16162c";
  const bdr     = isLight ? "#d8ddf0" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#7070a0" : "#8080b0";
  const inBg    = isLight ? "#f4f2ff" : "#1a1a35";

  const refresh = async () => {
    const fresh = await fetchAdvisors();
    setList(fresh);
    onReload && onReload();
  };

  // וודא שפרופיל "לידים ולקוחות למיון" קיים בטבלה — נדרש כיעד תקין ל-advisor_email
  // לפני שמסירים מוכרן, אחרת ה-FK/הלוגיקה הראשית עלולה להיתקל בערך לא קיים
  const ensurePoolProfileExists = async () => {
    if (!supabase) return;
    const exists = list.some(a => a.email === UNASSIGNED_POOL_EMAIL);
    if (exists) return;
    await supabase.from("advisors").insert([{ email: UNASSIGNED_POOL_EMAIL, name: UNASSIGNED_POOL_NAME, role: "sales" }]);
  };

  const addAdvisor = async () => {
    const e = email.trim().toLowerCase();
    const n = name.trim();
    if (!e || !n) { setMsg("נא למלא אימייל ושם"); return; }
    if (!e.includes("@")) { setMsg("אימייל לא תקין"); return; }
    if (!supabase) { setMsg("Supabase לא מחובר"); return; }
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.from("advisors").insert([{ email: e, name: n, role: "sales" }]);
      if (error) {
        setMsg(error.message.includes("duplicate") ? "מוכרן עם אימייל זה כבר קיים" : error.message);
      } else {
        setEmail(""); setName("");
        setMsg("✓ המוכרן נוסף לרשימה");
        await refresh();
        setTimeout(() => setMsg(""), 2500);
      }
    } catch(err) {
      setMsg(err?.message || "שגיאה");
    } finally {
      setBusy(false);
    }
  };

  // קידום לאדמין — מותר לכל admin (כולל super_admin)
  const promoteToAdmin = async (e) => {
    if (!supabase) return;
    if (!window.confirm(`לקדם את ${e} לדרגת אדמין?\nאדמין יכול לראות ולערוך לידים של כל המוכרנים.`)) return;
    const { error } = await supabase.from("advisors").update({ role: "admin" }).eq("email", e);
    if (error) { alert(error.message); return; }
    await refresh();
  };

  // הדחה מאדמין בחזרה לאיש מכירות — סופר-אדמין בלבד
  const demoteToSales = async (e) => {
    if (!isSuperAdmin) { alert("רק אדמין ראשי יכול להדיח אדמין."); return; }
    if (!supabase) return;
    if (!window.confirm(`להדיח את ${e} בחזרה לאיש מכירות רגיל?`)) return;
    const { error } = await supabase.from("advisors").update({ role: "sales" }).eq("email", e);
    if (error) { alert(error.message); return; }
    await refresh();
  };

  // הסרת מוכרן — לא מוחקת את הלקוחות שלו! מעבירה אותם לפרופיל "לידים ולקוחות למיון"
  const removeAdvisor = async (a) => {
    if (a.role === "admin" || a.role === "super_admin") {
      if (!isSuperAdmin) { alert("רק אדמין ראשי יכול להסיר אדמין מהמערכת."); return; }
    }
    if (a.email === UNASSIGNED_POOL_EMAIL) { alert('לא ניתן להסיר את פרופיל הסינון "לידים ולקוחות למיון" עצמו.'); return; }
    if (!window.confirm(`להסיר את ${a.name} (${a.email}) מהמערכת?\n\nכל הלידים/לקוחות ששויכו אליו יועברו אוטומטית לפרופיל "${UNASSIGNED_POOL_NAME}" — הם לא יימחקו.`)) return;
    if (!supabase) return;
    setBusy(true);
    try {
      await ensurePoolProfileExists();
      // שלב 1: העבר את כל הלקוחות של המוכרן המוסר לפרופיל הסינון, *לפני* מחיקתו —
      // כך נמנעים ממצב ביניים שבו ללקוחות יש advisor_email שכבר לא קיים בטבלת advisors
      const { error: reassignError } = await supabase
        .from("clients")
        .update({ advisor_email: UNASSIGNED_POOL_EMAIL })
        .eq("advisor_email", a.email);
      if (reassignError) { alert(`שגיאה בהעברת הלקוחות: ${reassignError.message}`); setBusy(false); return; }

      // שלב 2: מחק את רשומת המוכרן עצמו מטבלת advisors
      const { error: deleteError } = await supabase.from("advisors").delete().eq("email", a.email);
      if (deleteError) { alert(`שגיאה בהסרת המוכרן: ${deleteError.message}`); setBusy(false); return; }

      await refresh();
      setMsg(`✓ ${a.name} הוסר; הלידים שלו הועברו ל"${UNASSIGNED_POOL_NAME}"`);
      setTimeout(() => setMsg(""), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, fontFamily:"'Heebo',sans-serif", padding:16,
    }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{
        background:panelBg, borderRadius:16, border:`1px solid ${bdr}`,
        width:480, maxWidth:"95vw", maxHeight:"88vh",
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"0 24px 70px rgba(0,0,0,.5)",
      }}>
        {/* כותרת */}
        <div style={{
          padding:"16px 22px", borderBottom:`1px solid ${bdr}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background: isLight ? "linear-gradient(135deg,#f0eeff,#e8f0ff)" : "linear-gradient(135deg,#16163a,#111128)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:20 }}>👥</span>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:txt }}>ניהול מוכרנים</div>
              <div style={{ fontSize:11, color:sub }}>
                {list.filter(a => a.email !== UNASSIGNED_POOL_EMAIL).length} מוכרנים רשומים
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        {/* תוכן */}
        <div style={{ overflowY:"auto", flex:1, padding:"16px 22px" }}>
          {/* הסבר */}
          <div style={{
            background: isLight ? "#fff8e8" : "#2a2410",
            border:`1px solid ${isLight ? "#f0d890" : "#5a4a20"}`,
            borderRadius:9, padding:"10px 12px", marginBottom:16,
            fontSize:11, color: isLight ? "#8a6a10" : "#d8b860", lineHeight:1.6,
          }}>
            ⚠️ הוספת מוכרן כאן רק רושמת אותו ברשימה. כדי שהמוכרן יוכל להתחבר, יש ליצור לו משתמש ב-Supabase: Authentication → Add user → עם אותו אימייל בדיוק.
          </div>

          {/* טופס הוספה */}
          <div style={{ background:cardBg, borderRadius:11, padding:14, marginBottom:16, border:`1px solid ${bdr}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:txt, marginBottom:10 }}>➕ הוסף מוכרן חדש</div>
            <input
              value={name} onChange={e => { setName(e.target.value); setMsg(""); }}
              placeholder="שם המוכרן" dir="rtl"
              style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", marginBottom:8,
                background:inBg, border:`1px solid ${bdr}`, borderRadius:8, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }}
            />
            <input
              value={email} onChange={e => { setEmail(e.target.value); setMsg(""); }}
              placeholder="agent@email.com" dir="ltr"
              onKeyDown={e => e.key==="Enter" && addAdvisor()}
              style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", marginBottom:10,
                background:inBg, border:`1px solid ${bdr}`, borderRadius:8, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }}
            />
            <button
              onClick={addAdvisor} disabled={busy}
              style={{ width:"100%", padding:"10px", background: busy ? "#888" : "linear-gradient(135deg,#7c6fcd,#2d88d4)",
                color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:800, cursor: busy?"default":"pointer" }}
            >{busy ? "מוסיף…" : "הוסף מוכרן"}</button>
            {msg && (
              <div style={{ marginTop:10, fontSize:12, fontWeight:700,
                color: msg.startsWith("✓") ? "#2a9a50" : "#c03030" }}>{msg}</div>
            )}
          </div>

          {/* רשימת מוכרנים */}
          <div style={{ fontSize:11, fontWeight:800, color:sub, marginBottom:8, letterSpacing:.5 }}>מוכרנים רשומים</div>
          {list.filter(a => a.email !== UNASSIGNED_POOL_EMAIL).length === 0 ? (
            <div style={{ fontSize:13, color:sub, textAlign:"center", padding:20 }}>אין מוכרנים רשומים עדיין</div>
          ) : list.filter(a => a.email !== UNASSIGNED_POOL_EMAIL).map(a => {
            const isAdminRow = a.role === "admin" || a.role === "super_admin";
            const isThisSuperAdmin = a.email === SUPER_ADMIN_EMAIL;
            return (
            <div key={a.email} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              background:cardBg, border:`1px solid ${bdr}`, borderRadius:9,
              padding:"10px 14px", marginBottom:7, gap:8,
            }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:txt }}>{a.name}</span>
                  {isThisSuperAdmin ? (
                    <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:10,
                      background:"#e8a83822", color:"#b07818", border:"1px solid #e8a83866" }}>👑 אדמין ראשי</span>
                  ) : isAdminRow ? (
                    <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:10,
                      background:"#3dba7e22", color:"#2a8a5a", border:"1px solid #3dba7e66" }}>⚡ אדמין</span>
                  ) : null}
                </div>
                <div style={{ fontSize:11, color:sub, direction:"ltr", textAlign:"right" }}>{a.email}</div>
              </div>

              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                {/* קידום לאדמין — מותר לכל אדמין, רק על מוכרן רגיל */}
                {!isAdminRow && (
                  <button
                    onClick={() => promoteToAdmin(a.email)}
                    title="קדם לאדמין"
                    style={{ background:"none", border:`1px solid ${isLight?"#b0d0e0":"#205a5a"}`,
                      color:"#2a8a5a", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                  >קדם לאדמין</button>
                )}
                {/* הדחה — סופר-אדמין בלבד, ולא ניתן להדיח את עצמו (super_admin הקשיח) */}
                {isAdminRow && !isThisSuperAdmin && isSuperAdmin && (
                  <button
                    onClick={() => demoteToSales(a.email)}
                    title="הדח לאיש מכירות"
                    style={{ background:"none", border:`1px solid ${isLight?"#e0d0a0":"#5a4a20"}`,
                      color:"#b07818", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                  >הדח</button>
                )}
                {/* הסרה מהמערכת — חסומה לחלוטין על ה-super_admin הקשיח; על אדמין רגיל רק super_admin יכול */}
                {!isThisSuperAdmin && (
                  <button
                    onClick={() => removeAdvisor(a)}
                    disabled={busy}
                    style={{ background:"none", border:`1px solid ${isLight?"#e0b0b0":"#5a2020"}`,
                      color:"#c04444", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700,
                      cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
                  >הסר</button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard — כל לוגיקת ה-CRM (hooks + UI) ─────────────────────────── */
/* ─── שדה הערה מהירה (inline, שמירה ב-onBlur, מתרחב אוטומטית) ─────────────── */
function QuickNoteField({ initial, onSave, isLight, accent }) {
  const [val, setVal] = useState(initial || "");
  const ref = useRef(null);
  const txtColor = isLight ? "#1a1a3a" : "#e8e8f8";
  const bdrColor = isLight ? "#dcdcec" : "#2a2a48";

  // התאמת גובה אוטומטית לתוכן
  const autosize = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  useEffect(() => { setVal(initial || ""); }, [initial]);
  useEffect(() => { autosize(ref.current); }, [val]);

  return (
    <div style={{ display:"flex", flexDirection:"row", alignItems:"flex-start", gap:7, marginTop:8 }}>
      <span style={{ fontSize:15, flexShrink:0, marginTop:6, lineHeight:1 }}>✍️</span>
      <textarea
        ref={ref}
        value={val}
        onChange={(e) => { setVal(e.target.value); autosize(e.target); }}
        onBlur={() => { if ((val || "") !== (initial || "")) onSave(val); }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="הוסף הערה או עדכון מהיר לחלונית זו…"
        dir="rtl"
        rows={1}
        style={{
          flex:1, minWidth:0, boxSizing:"border-box",
          background: isLight ? "#fbfbff" : "#0f0f22",
          border:`1px solid ${bdrColor}`,
          borderRadius:7, padding:"7px 10px",
          color: txtColor, WebkitTextFillColor: txtColor, opacity:1,
          fontSize:12, lineHeight:1.5, fontFamily:"inherit",
          outline:"none", resize:"none", overflow:"hidden",
        }}
        onFocus={(e) => { e.target.style.borderColor = accent; }}
        onBlurCapture={(e) => { e.target.style.borderColor = bdrColor; }}
      />
    </div>
  );
}

/* ─── CalendarView — לוח שנה כללי לכל אירועי הלקוחות ───────────────────────── */
function CalendarView({ clients, onClose, onOpenClient, onToggleComplete, onReorder, onSaveNote, onReschedule, onSwapDay, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const bg     = isLight ? "#ffffff" : "#13132b";
  const cardBg = isLight ? "#f4f6ff" : "#16162c";
  const bdr    = isLight ? "#d8ddf0" : "#2a2a48";
  const txt    = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub    = isLight ? "#7070a0" : "#8080b0";

  const [view,   setView]   = useState("month"); // "month" | "week" | "day"
  const [anchor, setAnchor] = useState(() => new Date());

  // אסוף את כל האירועים מכל הלקוחות
  const allEvents = [];
  (clients || []).forEach(c => {
    (Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : []).forEach(ev => {
      if (ev?.date) allEvents.push({ date: ev.date, time: ev.time || "", text: ev.text || "", client: c, type:"custom", id: ev.id, completed: !!ev.completed, caseType: c.case_type || "", note: ev.notes || "", dayOrder: (ev.day_order === null || ev.day_order === undefined) ? null : Number(ev.day_order) });
    });
    // משימות לוח שנה מתוך היסטוריית התנהלות התיק (is_calendar_task)
    (Array.isArray(c.timeline) ? c.timeline : []).forEach((entry, ti) => {
      if (entry?.is_calendar_task && entry?.task_date) {
        allEvents.push({ date: entry.task_date, time: entry.task_time || "", text: entry.note || "", client: c, type:"custom", id:`tl-${c.id}-${ti}`, tlIndex: ti, completed: !!entry.completed, caseType: c.case_type || "", note:"", dayOrder: (entry.day_order === null || entry.day_order === undefined) ? null : Number(entry.day_order) });
      }
    });
  });
  const eventsByDate = {};
  allEvents.forEach(e => {
    const key = (e.date || "").split("T")[0];
    if (!key) return;
    (eventsByDate[key] = eventsByDate[key] || []).push(e);
  });
  // מיון כל יום לפי dayOrder (אירועים ללא סדר — בסוף, יציב)
  Object.keys(eventsByDate).forEach(key => {
    eventsByDate[key].forEach((e, i) => { if (e.dayOrder === null) e._fallback = i; });
    eventsByDate[key].sort((a, b) => {
      const oa = a.dayOrder === null ? (1e6 + (a._fallback||0)) : a.dayOrder;
      const ob = b.dayOrder === null ? (1e6 + (b._fallback||0)) : b.dayOrder;
      return oa - ob;
    });
  });

  const typeColor = (t) => "#7c5ecf"; // כל האירועים כעת מסוג "custom" בלבד
  const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  const dayNames = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  const pad = (n) => String(n).padStart(2,"0");
  const fmtKey = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  const todayKey = fmtKey(new Date());

  // חישוב טווח לפי תצוגה
  let headerLabel = "";
  let monthCells = [];   // לתצוגה חודשית (Date|null)
  let weekDays = [];     // לתצוגה שבועית/יומית (Date[])
  if (view === "month") {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    for (let i=0;i<firstDay;i++) monthCells.push(null);
    for (let d=1; d<=daysInMonth; d++) monthCells.push(new Date(y, m, d));
    headerLabel = `${monthNames[m]} ${y}`;
  } else if (view === "week") {
    const start = new Date(anchor); start.setDate(start.getDate() - start.getDay());
    for (let i=0;i<7;i++) { const d = new Date(start); d.setDate(start.getDate()+i); weekDays.push(d); }
    const end = new Date(start); end.setDate(start.getDate()+6);
    headerLabel = `${start.getDate()}.${pad(start.getMonth()+1)} – ${end.getDate()}.${pad(end.getMonth()+1)}.${end.getFullYear()}`;
  } else {
    weekDays = [new Date(anchor)];
    headerLabel = `${dayNames[anchor.getDay()]} ${anchor.getDate()}.${pad(anchor.getMonth()+1)}.${anchor.getFullYear()}`;
  }

  const nav = (dir) => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir*7);
    else d.setDate(d.getDate() + dir);
    setAnchor(d);
  };

  // לחיצה על יום → מעבר לתצוגה יומית
  const openDay = (dt) => { setAnchor(new Date(dt)); setView("day"); };

  const navBtn = { background:cardBg, border:`1px solid ${bdr}`, color:txt, borderRadius:7, padding:"6px 13px", fontSize:15, cursor:"pointer", fontWeight:700, lineHeight:1 };
  const toggleBtn = (active) => ({
    background: active ? "#7c5ecf" : "transparent",
    color: active ? "#fff" : sub,
    border:`1px solid ${active ? "#7c5ecf" : bdr}`,
    borderRadius:7, padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer",
  });

  // רכיב תגית אירוע
  const EventChip = ({ ev, big }) => (
    <div
      title={`${ev.client?.name || ""} - ${ev.text}`}
      style={{
        background: typeColor(ev.type)+"22",
        border:`1px solid ${typeColor(ev.type)}66`,
        color: typeColor(ev.type),
        borderRadius:5, padding: big ? "6px 10px" : "2px 5px",
        fontSize: big ? 13 : 10, fontWeight:700,
        lineHeight:1.4,
        display: big ? "block" : "-webkit-box",
        WebkitLineClamp: big ? undefined : 2, WebkitBoxOrient:"vertical",
        overflow: big ? "visible" : "hidden",
        height: big ? "auto" : undefined,
        overflowWrap:"break-word", wordBreak:"break-word",
        whiteSpace:"normal", minWidth:0, width: big ? "100%" : undefined, boxSizing:"border-box",
        flexShrink:0,
      }}
    >
      <span style={{ fontWeight:800 }}>{ev.client?.name || ""}</span>
      <span style={{ opacity:.85 }}> - {ev.text}</span>
    </div>
  );

  return (
    <div dir="rtl" style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, fontFamily:"'Heebo',sans-serif", padding:16,
    }}>
      <div style={{
        background:bg, borderRadius:16, border:`1px solid ${bdr}`,
        width:"100%", maxWidth:1040, height:"85vh",
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"0 24px 70px rgba(0,0,0,.5)",
      }}>
        {/* כותרת — שורה עליונה: X משמאל, כותרת מימין */}
        <div style={{
          padding:"12px 16px 10px", borderBottom:`1px solid ${bdr}`, flexShrink:0,
          background: isLight ? "linear-gradient(135deg,#f0eeff,#e8f0ff)" : "linear-gradient(135deg,#16163a,#111128)",
        }}>
          {/* שורה 1: X + כותרת */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <button onClick={onClose} title="סגור" style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer", lineHeight:1, order:0 }}>✕</button>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <span style={{ fontSize:16, fontWeight:900, color:txt }}>{headerLabel}</span>
              <span style={{ fontSize:19 }}>🗓️</span>
            </div>
          </div>
          {/* שורה 2: toggle + ניווט בשורה אחת קומפקטית */}
          <div style={{ display:"flex", flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:5 }}>
              <button onClick={() => setView("month")} style={toggleBtn(view==="month")}>חודשי</button>
              <button onClick={() => setView("week")}  style={toggleBtn(view==="week")}>שבועי</button>
              <button onClick={() => setView("day")}   style={toggleBtn(view==="day")}>יומי</button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {/* RTL: ‹ = הקודם, › = הבא — מיושרים כלפי חוץ */}
              <button onClick={() => nav(-1)} title="הקודם" style={navBtn}>‹</button>
              <button onClick={() => setAnchor(new Date())} style={{ ...navBtn, fontSize:11, color:sub, padding:"6px 11px" }}>היום</button>
              <button onClick={() => nav(1)} title="הבא" style={navBtn}>›</button>
            </div>
          </div>
        </div>

        {/* גוף */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"14px 18px", overflow:"hidden", minHeight:0 }}>

          {/* ─── תצוגה חודשית ─── */}
          {view === "month" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7, minmax(0, 1fr))", gap:6, marginBottom:6, flexShrink:0 }}>
                {dayNames.map(d => (
                  <div key={d} style={{ textAlign:"center", fontSize:12, fontWeight:800, color:sub, padding:"4px 0", minWidth:0 }}>{d}</div>
                ))}
              </div>
              <div style={{
                flex:1, display:"grid",
                gridTemplateColumns:"repeat(7, minmax(0, 1fr))",
                gridAutoRows:"minmax(82px, 1fr)",
                gap:6, width:"100%", minHeight:0, overflowY:"auto",
              }}>
                {monthCells.map((dt, i) => {
                  if (dt === null) return <div key={`e${i}`} style={{ minWidth:0 }} />;
                  const k = fmtKey(dt);
                  const evs = eventsByDate[k] || [];
                  const isToday = k === todayKey;
                  return (
                    <div key={k}
                      onClick={() => openDay(dt)}
                      style={{
                        minWidth:0, width:"100%", boxSizing:"border-box",
                        background: cardBg,
                        border:`1.5px solid ${isToday ? "#7c5ecf99" : bdr}`,
                        borderRadius:8, padding:"5px 6px",
                        display:"flex", flexDirection:"column", gap:3,
                        overflow:"hidden", cursor:"pointer",
                      }}>
                      <span style={{ fontSize:12, fontWeight:isToday?900:700, color:isToday?"#7c5ecf":sub, textAlign:"left", flexShrink:0 }}>{dt.getDate()}</span>
                      <div style={{ display:"flex", flexDirection:"column", gap:2, overflow:"hidden", flex:1 }}>
                        {evs.slice(0,2).map((ev, j) => <EventChip key={j} ev={ev} />)}
                        {evs.length > 2 && <span style={{ fontSize:9, color:sub, flexShrink:0 }}>+{evs.length-2} נוספים</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ─── תצוגה שבועית — שורות מלאות ─── */}
          {view === "week" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8, width:"100%", minHeight:0, overflowY:"auto" }}>
              {weekDays.map((dt, i) => {
                const k = fmtKey(dt);
                const evs = eventsByDate[k] || [];
                const isToday = k === todayKey;
                return (
                  <div key={k}
                    onClick={() => openDay(dt)}
                    style={{
                      display:"flex", flexDirection:"row", width:"100%",
                      minHeight:70, height:"auto",
                      background:cardBg, border:`1.5px solid ${isToday ? "#7c5ecf99" : bdr}`,
                      borderRadius:10, overflow:"hidden", cursor:"pointer",
                      alignItems:"stretch", flexShrink:0,
                    }}>
                    {/* צד ימין — שם היום ותאריך בסוגריים */}
                    <div style={{
                      flexShrink:0, width:92, padding:"10px 12px",
                      background: isToday ? "#7c5ecf18" : (isLight ? "#eceef8" : "#0f0f22"),
                      borderLeft:`1px solid ${bdr}`,
                      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3,
                    }}>
                      <span style={{ fontSize:13, fontWeight:900, color: isToday ? "#7c5ecf" : txt }}>{dayNames[dt.getDay()]}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:sub }}>({dt.getDate()}.{pad(dt.getMonth()+1)})</span>
                    </div>
                    {/* צד שמאל — אירועים, נערמים מלמעלה */}
                    <div style={{ flex:1, minWidth:0, padding:"8px 10px", display:"flex", flexDirection:"column", gap:5, justifyContent: evs.length ? "flex-start" : "center" }}>
                      {evs.length === 0
                        ? <span style={{ fontSize:12, color:sub, fontStyle:"italic" }}>אין אירועים</span>
                        : evs.map((ev, j) => <EventChip key={j} ev={ev} big />)
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── תצוגה יומית — מסך מלא ממוקד ─── */}
          {view === "day" && (() => {
            const k = fmtKey(weekDays[0]);
            const evs = eventsByDate[k] || [];

            // ── חלוקת אירועי היום לפי שעה ──
            // אירוע עם time "HH:MM" משויך לשעה המתאימה; אירוע ללא שעה נכנס לקבוצת "ללא שעה".
            const HOURS = Array.from({ length: 24 }, (_, h) => h); // 0..23
            const byHour = {};      // hour(int) -> [events]
            const noTime = [];      // אירועים בלי שעה מוגדרת
            evs.forEach(ev => {
              const t = (ev.time || "").trim();
              const m = /^(\d{1,2}):(\d{2})$/.exec(t);
              if (m) {
                const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
                (byHour[h] = byHour[h] || []).push(ev);
              } else {
                noTime.push(ev);
              }
            });
            // הצג רק שעות שיש בהן אירועים (גריד נקי, לא 24 שורות ריקות)
            const activeHours = HOURS.filter(h => (byHour[h] || []).length > 0);

            // כרטיסיית אירוע בודדת — נשמרת זהה לוגית, ללא חצי סדר ידני (הסדר נקבע לפי שעה)
            const renderEventCard = (ev, key) => {
              const done = !!ev.completed;
              return (
                <div key={ev.id || key}
                  style={{
                    position:"relative",
                    display:"flex", alignItems:"flex-start", gap:12,
                    background:cardBg,
                    border:`1px solid ${typeColor(ev.type)}55`,
                    borderRight:`4px solid ${typeColor(ev.type)}`,
                    borderRadius:9, padding:"12px 16px",
                    opacity: done ? .55 : 1,
                    transition:"opacity .15s",
                  }}>
                  {/* תיבת סימון בוצע */}
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
                    <span
                      onClick={(e) => { e.stopPropagation(); onToggleComplete && onToggleComplete(ev.client, ev); }}
                      title={done ? "בוצע" : "סמן כבוצע"}
                      style={{
                        width:22, height:22, borderRadius:6,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        background: done ? "#22a060" : "transparent",
                        border:`2px solid ${done ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                        color:"#fff", fontSize:14, fontWeight:900, cursor:"pointer",
                      }}
                    >{done ? "✓" : ""}</span>
                  </div>
                  {/* טקסט — שם, סוג תיק, תיאור */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontSize:15, fontWeight:800, color:txt,
                      textDecoration: done ? "line-through" : "none",
                      textDecorationColor: done ? sub : undefined,
                    }}>{ev.client?.name || ""}</div>
                    {ev.caseType && (
                      <div style={{ fontSize:12, color:sub, marginTop:2, fontWeight:500, display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:12, lineHeight:1 }}>💼</span>{ev.caseType}
                      </div>
                    )}
                    <div style={{
                      fontSize:13, color: isLight ? "#4a4a6a" : "#b0b0d0", marginTop:3,
                      textDecoration: done ? "line-through" : "none",
                    }}>{ev.text}</div>
                    {/* שדה הערה מהירה — שמירה אוטומטית ב-onBlur */}
                    <QuickNoteField
                      initial={ev.note}
                      isLight={isLight}
                      accent={typeColor(ev.type)}
                      onSave={(val) => onSaveNote && onSaveNote(ev.client, ev, val)}
                    />
                    {/* שורה תחתונה — תגית+תאריך מימין, כפתור משמאל */}
                    <div style={{ display:"flex", flexDirection:"row", alignItems:"center", justifyContent:"space-between", width:"100%", marginTop:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {/* תגית שעה */}
                        {ev.time && (
                          <span style={{ fontSize:11, fontWeight:800, color: typeColor(ev.type), display:"flex", alignItems:"center", gap:3 }}>
                            🕐 {ev.time}
                          </span>
                        )}
                        {/* אייקון לוח שנה דינמי — מציג את מספר היום + בורר תאריך */}
                        <label
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          title="העבר לתאריך אחר"
                          style={{
                            position:"relative", cursor:"pointer", flexShrink:0,
                            width:28, height:28, borderRadius:6, overflow:"hidden",
                            background:"#ffffff", border:"1px solid #e2e2ec",
                            boxShadow:"0 1px 2px rgba(0,0,0,.08)",
                            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                          }}
                        >
                          <span style={{ position:"absolute", top:0, left:0, right:0, height:6, background: typeColor(ev.type) }} />
                          <span style={{ fontSize:12, fontWeight:800, color:"#2a2a3a", marginTop:5, lineHeight:1 }}>
                            {(() => { const d = new Date((ev.date || "").split("T")[0]); return isNaN(d) ? "" : d.getDate(); })()}
                          </span>
                          <input
                            type="date"
                            defaultValue={(ev.date || "").split("T")[0]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { if (e.target.value) onReschedule && onReschedule(ev.client, ev, e.target.value); }}
                            style={{
                              position:"absolute", inset:0, width:"100%", height:"100%",
                              opacity:0, cursor:"pointer", border:"none", padding:0,
                            }}
                          />
                        </label>
                      </div>
                      {/* כפתור כרטיסיית לקוח */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenClient && onOpenClient(ev.client); onClose(); }}
                        style={{
                          display:"inline-flex", alignItems:"center", gap:4,
                          background:"transparent", border:`1px solid ${typeColor(ev.type)}55`,
                          color: typeColor(ev.type), borderRadius:5, padding:"2px 8px",
                          fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                        }}
                      >👤 כרטיסיית לקוח</button>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10, minHeight:0, overflowY:"auto", overflowX:"hidden", touchAction:"pan-y" }}>
                <div style={{ fontSize:14, fontWeight:900, color:"#7c5ecf", flexShrink:0 }}>
                  {evs.length} אירועים ביום זה
                </div>
                {evs.length === 0 ? (
                  <div style={{
                    flex:1, display:"flex", alignItems:"center", justifyContent:"center",
                    color:sub, fontSize:15, fontStyle:"italic",
                  }}>אין אירועים מתוכננים ליום זה</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {/* שורות שעתיות — רק שעות עם אירועים */}
                    {activeHours.map(h => (
                      <div key={h} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderTop:`1px solid ${isLight ? "#e4e8f4" : "#1c1c34"}` }}>
                        {/* תווית שעה */}
                        <div style={{
                          flexShrink:0, width:54, textAlign:"center", paddingTop:14,
                          fontSize:13, fontWeight:800, color:"#7c5ecf",
                        }}>
                          {String(h).padStart(2,"0")}:00
                        </div>
                        {/* אירועי השעה */}
                        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:8 }}>
                          {(byHour[h] || []).map((ev, idx) => renderEventCard(ev, `${h}-${idx}`))}
                        </div>
                      </div>
                    ))}
                    {/* אירועים ללא שעה מוגדרת */}
                    {noTime.length > 0 && (
                      <div style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderTop:`1px solid ${isLight ? "#e4e8f4" : "#1c1c34"}` }}>
                        <div style={{
                          flexShrink:0, width:54, textAlign:"center", paddingTop:14,
                          fontSize:10, fontWeight:700, color:sub,
                        }}>
                          ללא שעה
                        </div>
                        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:8 }}>
                          {noTime.map((ev, idx) => renderEventCard(ev, `nt-${idx}`))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* מקרא */}
          <div style={{ display:"flex", gap:14, marginTop:10, fontSize:10, color:sub, flexWrap:"wrap", flexShrink:0 }}>
            <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:10, height:10, borderRadius:3, background:"#7c5ecf66", border:"1px solid #7c5ecf" }} /> אירוע מותאם</span>
            {view !== "day" && <span style={{ marginRight:"auto", color:sub, fontSize:10 }}>💡 לחץ על יום לפתיחת התצוגה היומית</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── מיגרציה: מזג משימות ישנות מ-custom_calendar_events לתוך ה-timeline ───────
   מופרד לפונקציה משותפת כדי שגם שאילתת ה-fallback (כש-sort_order חסר בטבלה)
   תעבור את אותה מיגרציה בלי לשכפל קוד.
   ──────────────────────────────────────────────────────────────────────── */
function migrateClientRows(rows) {
  return (rows || []).map(r => {
    let base = { ...r, requestedMix: r.requested_mix || r.requestedMix || "" };
    // השלמת first_name/last_name מרשומות ישנות שיש בהן רק name (לתצוגה/עריכה).
    // לא דורסים ערכים קיימים; לא כותבים חזרה ל-DB (יישמר בעריכה הבאה).
    if (!((r.first_name || "").trim()) && !((r.last_name || "").trim()) && (r.name || "").trim()) {
      const sp = splitName(r.name);
      base = { ...base, first_name: sp.first_name, last_name: sp.last_name };
    }
    const oldEvents = Array.isArray(r.custom_calendar_events) ? r.custom_calendar_events : [];
    if (oldEvents.length === 0) return base;
    const asTasks = oldEvents
      .filter(ev => ev && (ev.text || ev.date))
      .map(ev => ({
        date: ev.date ? fmtDate2(ev.date) : todayStr(),
        note: ev.text || "",
        is_calendar_task: true,
        task_date: ev.date || "",
        completed: !!ev.completed,
        _migrated: true,
      }));
    const existingTl = Array.isArray(r.timeline) ? r.timeline : [];
    const alreadyMigrated = existingTl.some(e => e._migrated);
    const newTl = alreadyMigrated ? existingTl : [...asTasks, ...existingTl];
    if (!alreadyMigrated && supabase) {
      supabase.from("clients").update({ timeline: newTl, custom_calendar_events: [] }).eq("id", r.id)
        .then(({ error }) => { if (error) console.error("שגיאת מיגרציה:", error.message); });
    }
    return { ...base, timeline: newTl, custom_calendar_events: [] };
  });
}

/* ─── מודל יבוא לידים מקובץ Excel/CSV ──────────────────────────────────────
   ממפה כותרות בעברית או אנגלית בצורה גמישה לשדות הלקוח. הפרסור מתבצע בצד
   הלקוח (XLSX / PapaParse). המודל רק מפרסר וממפה — ההטבעה של advisor_email
   ושלב "לידים חדשים" + ה-insert עצמו מתבצעים ב-MainDashboard (onImport),
   כדי שכל לוגיקת ה-RLS והשיוך תהיה במקום אחד מרכזי.
   ──────────────────────────────────────────────────────────────────────── */

// ── שדות היעד של Wiseli שאליהם ממפים עמודות מהקובץ ──
// order = סדר התצוגה באשף. required = שדה חובה. numeric = יומר ל-null אם ריק/לא-תקין.
// הערה: המפתחות הם שמות העמודות האמיתיים ב-DB. שלושה שמות שביקש המשתמש שונו
// לשמות הקיימים בפועל: house_number (לא property_number), property_price
// (לא property_asking_price), property_on_market_since (לא property_market_since).
const IMPORT_TARGET_FIELDS = [
  { key:"name",                  label:"שם ליד",            required:true,  match:["שם","שמות","name","לקוח"] },
  { key:"phone",                 label:"טלפון ליד",         required:false, match:["טלפון","נייד","סלולרי","פלאפון","phone","mobile","tel"] },
  { key:"property_city",         label:"עיר",               required:false, match:["עיר","יישוב","ישוב","city"] },
  { key:"property_street",       label:"רחוב",              required:false, match:["רחוב","כתובת","street","address"] },
  { key:"property_house_number", label:"מספר בית",          required:false, match:["מספר בית","מס' בית","house","number","no"] },
  { key:"property_neighborhood", label:"שכונה",             required:false, match:["שכונה","neighborhood","neighbourhood"] },
  { key:"property_type",         label:"סוג הנכס",          required:false, match:["סוג","type","property type"] },
  { key:"property_condition",    label:"מצב הנכס",          required:false, match:["מצב","condition"] },
  { key:"property_size_sqm",     label:"גודל בנוי במ״ר",    required:false, numeric:true, match:["גודל","שטח","מ\"ר","מ״ר","מטר","size","sqm","area"] },
  { key:"property_rooms",        label:"מספר חדרים",        required:false, numeric:true, match:["חדרים","חדר","rooms","room"] },
  { key:"property_floor",        label:"קומה",              required:false, match:["קומה","floor"] },
  { key:"property_balcony",      label:"מרפסת",             required:false, match:["מרפסת","balcony"] },
  { key:"property_mamad",        label:"ממ״ד",              required:false, match:["ממ\"ד","ממ״ד","ממד","mamad","safe room"] },
  { key:"property_parking",      label:"חניה",              required:false, match:["חניה","חנייה","parking"] },
  { key:"property_elevator",     label:"מעלית",             required:false, match:["מעלית","elevator","lift"] },
  { key:"property_price",        label:"מחיר מבוקש",        required:false, numeric:true, match:["מחיר","price","מבוקש","asking"] },
  { key:"property_on_market_since", label:"נמצאת בשוק מאז", required:false, isDate:true, match:["בשוק","תאריך","since","market","date"] },
  { key:"property_published_on", label:"פורסם ב-",          required:false, match:["פורסם","publish","platform"] },
  { key:"lead_source",           label:"מהיכן הגיע הליד",    required:false, match:["מקור","source","קמפיין","campaign"] },
  { key:"property_ad_link",      label:"לינק למודעה",       required:false, match:["לינק","קישור","link","url","מודעה"] },
  { key:"property_seller_notes", label:"הערות המוכר במודעה", required:false, match:["הערות","תיאור","notes","description","comments"] },
];

// שדות מספריים — לסניטציה (ריק/לא-תקין → null) בעת היבוא
const IMPORT_NUMERIC_FIELDS = IMPORT_TARGET_FIELDS.filter(f => f.numeric).map(f => f.key);

// נרמול מחרוזת להשוואה (trim + lowercase)
const normHeader = (h) => String(h ?? "").trim().toLowerCase();

// היוריסטיקת התאמה: בהינתן רשימת כותרות מהקובץ, מנסה לנחש לכל שדה יעד את
// אינדקס העמודה המתאימה (לפי הכלה של אחת ממילות ה-match). מחזיר { fieldKey: headerIndex }.
function autoMatchHeaders(headers) {
  const normalized = headers.map(normHeader);
  const used = new Set();
  const mapping = {};
  IMPORT_TARGET_FIELDS.forEach(f => {
    const idx = normalized.findIndex((h, i) =>
      !used.has(i) && h && f.match.some(m => h.includes(normHeader(m)))
    );
    if (idx !== -1) { mapping[f.key] = idx; used.add(idx); }
    else mapping[f.key] = ""; // לא נמצאה התאמה — המשתמש יבחר ידנית
  });
  return mapping;
}

function ImportLeadsModal({ onClose, onImport, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const [step,     setStep]     = useState("upload"); // "upload" | "map"
  const [dragOver, setDragOver] = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [fileName, setFileName] = useState("");
  const [headers,  setHeaders]  = useState([]);   // כותרות הקובץ (שורה ראשונה)
  const [matrix,   setMatrix]   = useState([]);   // כל השורות (כולל כותרות)
  const [mapping,  setMapping]  = useState({});   // { fieldKey: headerIndex | "" }
  const fileInputRef = useRef(null);

  const panelBg = isLight ? "#ffffff" : "#13132b";
  const cardBg  = isLight ? "#f4f6ff" : "#16162c";
  const bdr     = isLight ? "#d8ddf0" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#7070a0" : "#8080b0";
  const inputBg = isLight ? "#f4f2ff" : "#1a1a35";

  // ── שלב 1: קריאת הקובץ, חילוץ כותרות, התאמה אוטומטית, מעבר לשלב המיפוי ──
  const handleFile = async (file) => {
    setError("");
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setError("פורמט קובץ לא נתמך. השתמש ב-CSV, XLSX או XLS בלבד.");
      return;
    }
    setBusy(true);
    try {
      let rows;
      if (ext === "csv") {
        const text = await file.text();
        const parsed = Papa.parse(text, { skipEmptyLines: true });
        if (parsed.errors?.length) console.warn("אזהרות פרסור CSV:", parsed.errors);
        rows = parsed.data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      }
      if (!rows || rows.length < 2) {
        setError("הקובץ ריק או חסר שורות נתונים מתחת לכותרות.");
        setBusy(false);
        return;
      }
      const hdrs = (rows[0] || []).map(h => String(h ?? "").trim());
      if (hdrs.every(h => h === "")) {
        setError("לא זוהתה שורת כותרות תקינה בקובץ.");
        setBusy(false);
        return;
      }
      setFileName(file.name);
      setHeaders(hdrs);
      setMatrix(rows);
      setMapping(autoMatchHeaders(hdrs)); // התאמה חכמה אוטומטית
      setStep("map");
    } catch (err) {
      console.error("שגיאת פרסור קובץ:", err);
      setError(err?.message || "שגיאה בקריאת הקובץ.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const resetAll = () => {
    setStep("upload"); setError(""); setFileName("");
    setHeaders([]); setMatrix([]); setMapping({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── שלב 4: ביצוע — קריאת כל השורות לפי המיפוי שנבחר, ושליחה ל-onImport ──
  const finishImport = async () => {
    setError("");
    // ולידציה: שם ליד הוא חובה
    if (mapping.name === "" || mapping.name === undefined) {
      setError('חובה למפות עמודה לשדה "שם ליד".');
      return;
    }
    // בנה את רשימת הלידים מתוך כל שורות הנתונים, לפי אינדקסי העמודות שנבחרו
    const valAt = (row, fieldKey) => {
      const idx = mapping[fieldKey];
      return (idx === "" || idx === undefined) ? "" : String(row[idx] ?? "").trim();
    };
    const leads = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      if (!row || row.every(c => String(c ?? "").trim() === "")) continue;
      const name = valAt(row, "name");
      if (!name) continue; // דלג על שורות ללא שם
      // בנה את אובייקט הליד דינמית מכל שדות היעד הממופים (כל 21 השדות)
      const lead = {};
      IMPORT_TARGET_FIELDS.forEach(f => { lead[f.key] = valAt(row, f.key); });
      leads.push(lead);
    }
    if (leads.length === 0) {
      setError("לא נמצאו שורות תקינות (כל שורה חייבת ערך בעמודת שם הליד).");
      return;
    }
    setBusy(true);
    try {
      await onImport(leads); // ההטבעה (advisor_email + שלב) + insert ב-MainDashboard
      // סגירה/ניקוי/טוסט מתבצעים ע"י ה-parent לאחר הצלחה
    } catch (err) {
      console.error("שגיאת יבוא:", err);
      setError(err?.message || "שגיאה ביבוא הלידים.");
      setBusy(false);
    }
  };

  // ספירת שורות נתונים (ללא כותרת) לתצוגה
  const dataRowCount = Math.max(0, matrix.length - 1);

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
        display:"flex", alignItems:"center", justifyContent:"center", padding:16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        dir="rtl"
        style={{
          background:panelBg, borderRadius:16, width:"100%", maxWidth:520,
          maxHeight:"90vh", overflowY:"auto",
          border:`1px solid ${bdr}`, boxShadow:"0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        {/* כותרת */}
        <div style={{
          padding:"16px 22px", borderBottom:`1px solid ${bdr}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background: isLight ? "linear-gradient(135deg,#e8f6f6,#e8f0ff)" : "linear-gradient(135deg,#0d2424,#111128)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:20 }}>📥</span>
            <div style={{ fontSize:15, fontWeight:900, color:txt }}>
              {step === "upload" ? "יבוא לידים מקובץ" : "התאמת עמודות"}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:"18px 22px" }}>
          {/* ═══════════ שלב 1: העלאת קובץ ═══════════ */}
          {step === "upload" && (
            <>
              <div style={{
                background:cardBg, border:`1px solid ${bdr}`, borderRadius:9,
                padding:"11px 13px", marginBottom:16, fontSize:11.5, color:sub, lineHeight:1.7,
              }}>
                <div style={{ fontWeight:800, color:txt, marginBottom:5 }}>📋 איך זה עובד:</div>
                העלה קובץ עם שורת כותרות בשורה הראשונה. בשלב הבא תוכל להתאים כל עמודה
                מהקובץ לשדה המתאים ב-Wiseli — לא חובה שהכותרות יהיו בשם מסוים.
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border:`2px dashed ${dragOver ? "#14b8a6" : bdr}`,
                  borderRadius:12, padding:"34px 20px", textAlign:"center",
                  cursor:"pointer", transition:"all .15s",
                  background: dragOver ? (isLight ? "#e8f6f6" : "#0d2424") : "transparent",
                }}
              >
                <div style={{ fontSize:34, marginBottom:8 }}>📄</div>
                <div style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:4 }}>
                  {busy ? "מעבד קובץ…" : "גרור קובץ לכאן או לחץ לבחירה"}
                </div>
                <div style={{ fontSize:11, color:sub }}>CSV · XLSX · XLS</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => handleFile(e.target.files?.[0])}
                  style={{ display:"none" }}
                />
              </div>
            </>
          )}

          {/* ═══════════ שלב 2+3: מיפוי עמודות ═══════════ */}
          {step === "map" && (
            <>
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                marginBottom:14, fontSize:11.5, color:sub,
              }}>
                <span>📄 <span style={{ fontWeight:700, color:txt }}>{fileName}</span></span>
                <span>{dataRowCount} שורות נתונים</span>
              </div>

              <div style={{ fontSize:11.5, color:sub, marginBottom:12, lineHeight:1.6 }}>
                התאם כל שדה ב-Wiseli (מימין) לעמודה מהקובץ שלך (משמאל). התאמות שזוהו
                אוטומטית כבר נבחרו — אפשר לשנות. שדה ללא התאמה יישאר ריק.
              </div>

              {/* שורות מיפוי */}
              <div style={{ display:"flex", flexDirection:"column", gap:9, marginBottom:16 }}>
                {IMPORT_TARGET_FIELDS.map(f => (
                  <div key={f.key} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {/* שדה יעד Wiseli — ימין */}
                    <div style={{ flex:"0 0 38%", fontSize:13, fontWeight:700, color:txt, display:"flex", alignItems:"center", gap:5 }}>
                      {f.label}
                      {f.required && <span style={{ color:"#e05555", fontSize:11 }}>*</span>}
                    </div>
                    {/* חץ */}
                    <span style={{ color:sub, fontSize:13, flexShrink:0 }}>←</span>
                    {/* בורר עמודה מהקובץ — שמאל */}
                    <select
                      value={mapping[f.key] === "" || mapping[f.key] === undefined ? "" : String(mapping[f.key])}
                      onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                      dir="rtl"
                      style={{
                        flex:1, minWidth:0, background:inputBg, border:`1px solid ${mapping[f.key] !== "" && mapping[f.key] !== undefined ? "#14b8a6" : bdr}`,
                        borderRadius:7, color:txt, padding:"8px 10px", fontSize:12.5,
                        outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    >
                      <option value="">— ללא —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `עמודה ${i+1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* כפתורי פעולה */}
              <div style={{ display:"flex", gap:9, justifyContent:"space-between" }}>
                <button
                  onClick={finishImport} disabled={busy}
                  style={{
                    flex:1, background: busy ? "#888" : "linear-gradient(135deg,#14b8a6,#0d9488)",
                    color:"#fff", border:"none", borderRadius:8,
                    padding:"11px 24px", fontSize:13.5, fontWeight:800,
                    cursor: busy ? "default" : "pointer",
                  }}
                >{busy ? "מייבא…" : "סיום יבוא"}</button>
                <button
                  onClick={resetAll} disabled={busy}
                  style={{
                    background:"transparent", color:sub,
                    border:`1px solid ${bdr}`, borderRadius:8,
                    padding:"11px 16px", fontSize:13, cursor:"pointer",
                  }}
                >קובץ אחר</button>
              </div>
            </>
          )}

          {/* שגיאה */}
          {error && (
            <div style={{
              marginTop:14, padding:"10px 13px", borderRadius:8,
              background:"#c0303018", border:"1px solid #c0303055",
              color:"#e06464", fontSize:12, fontWeight:600, lineHeight:1.6,
            }}>⚠️ {error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── סרגל פעולות מרובות צף ─────────────────────────────────────────────── */
function BulkActionBar({ count, phases, advisors, isAdmin, onMoveStage, onDelete, onReassign, onCancel, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const barBg   = isLight ? "#ffffff" : "#16162c";
  const bdr     = isLight ? "#d0d4e8" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#6070a0" : "#8080b0";
  const inputBg = isLight ? "#f4f2ff" : "#1a1a35";

  const selStyle = {
    background:inputBg, border:`1px solid ${bdr}`, borderRadius:8,
    color:txt, padding:"8px 10px", fontSize:12.5, outline:"none",
    fontFamily:"inherit", cursor:"pointer", maxWidth:160,
  };

  return (
    <div style={{
      position:"fixed", bottom:18, left:"50%", transform:"translateX(-50%)",
      zIndex:1050, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
      justifyContent:"center", maxWidth:"94vw",
      background:barBg, border:`1px solid ${bdr}`, borderRadius:14,
      padding:"12px 18px", boxShadow:"0 12px 40px rgba(0,0,0,.4)",
    }} dir="rtl">
      {/* מונה נבחרים */}
      <span style={{ fontSize:13, fontWeight:900, color:txt, whiteSpace:"nowrap" }}>
        {count} נבחרו
      </span>

      {/* A: העברת שלב — לכולם */}
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onMoveStage(e.target.value); e.target.value=""; } }}
        style={selStyle}
        title="העבר לשלב אחר"
      >
        <option value="">↪ העבר לשלב…</option>
        {phases.filter(p => p.id !== "archive").map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      {/* C: שיוך מחדש — אדמין בלבד */}
      {isAdmin && (
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) { onReassign(e.target.value); e.target.value=""; } }}
          style={selStyle}
          title="שייך לאיש מכירות"
        >
          <option value="">👤 שייך למוכרן…</option>
          {(advisors||[]).map(a => (
            <option key={a.email} value={a.email}>{a.name || a.email}</option>
          ))}
        </select>
      )}

      {/* B: מחיקה — אדמין בלבד */}
      {isAdmin && (
        <button
          onClick={onDelete}
          style={{
            background:"#c0303018", color:"#e05555",
            border:"1px solid #c0303055", borderRadius:8,
            padding:"8px 14px", fontSize:12.5, fontWeight:800,
            cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
          }}
        >🗑 מחק נבחרים</button>
      )}

      {/* ביטול */}
      <button
        onClick={onCancel}
        style={{
          background:"transparent", color:sub,
          border:`1px solid ${bdr}`, borderRadius:8,
          padding:"8px 14px", fontSize:12.5, cursor:"pointer", fontFamily:"inherit",
        }}
      >ביטול</button>
    </div>
  );
}

/* ─── מנהל תבניות ווטסאפ — עריכת 5 תבניות גלובליות ───────────────────────── */
function WhatsAppTemplatesPanel({ templates, onSave, onClose, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const panelBg = isLight ? "#ffffff" : "#13132b";
  const cardBg  = isLight ? "#f4f6ff" : "#16162c";
  const bdr     = isLight ? "#d8ddf0" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#7070a0" : "#8080b0";
  const inputBg = isLight ? "#f4f2ff" : "#1a1a35";
  const WA = "#25d366";

  // טיוטה מקומית — נשמרת רק בלחיצה על "שמור"
  const [draft, setDraft] = useState(() => templates.map(t => ({ ...t })));
  const setField = (id, field, val) =>
    setDraft(d => d.map(t => t.id === id ? { ...t, [field]: val } : t));

  const handleSave = () => {
    // נקה כותרות ריקות לברירת מחדל; תבנית 1 תמיד "רישום חופשי" (נעולה)
    const cleaned = draft.map(t =>
      t.id === 1
        ? { ...t, title: "רישום חופשי" }
        : { ...t, title: (t.title || "").trim() || `תבנית ${t.id}` }
    );
    onSave(cleaned);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
        display:"flex", alignItems:"center", justifyContent:"center", padding:16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        dir="rtl"
        style={{
          background:panelBg, borderRadius:16, width:"100%", maxWidth:560,
          maxHeight:"90vh", overflowY:"auto",
          border:`1px solid ${bdr}`, boxShadow:"0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        {/* כותרת */}
        <div style={{
          padding:"16px 22px", borderBottom:`1px solid ${bdr}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background: isLight ? "linear-gradient(135deg,#e8f9ee,#e8f0ff)" : "linear-gradient(135deg,#0d2418,#111128)",
          position:"sticky", top:0, zIndex:1,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:20 }}>💬</span>
            <div style={{ fontSize:15, fontWeight:900, color:txt }}>הגדרת תבניות ווטסאפ</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:"18px 22px" }}>
          <div style={{ fontSize:12, color:sub, marginBottom:16, lineHeight:1.6 }}>
            ערוך עד 5 תבניות הודעה לשליחה מהירה בווטסאפ. כל תבנית מזוהה לפי המספר שלה והכותרת שתבחר.
          </div>

          {draft.map(t => (
            <div key={t.id} style={{
              background:cardBg, border:`1px solid ${bdr}`, borderRadius:11,
              padding:"13px 15px", marginBottom:13,
            }}>
              {/* כותרת: {מספר} - {כותרת} */}
              <label style={{ fontSize:11, fontWeight:700, color:sub, marginBottom:5, display:"block" }}>
                כותרת תבנית {t.id}
              </label>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{
                  fontSize:14, fontWeight:900, color:WA, flexShrink:0,
                  width:26, height:26, borderRadius:6, background:`${WA}22`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>{t.id}</span>
                <span style={{ color:sub, fontSize:14 }}>-</span>
                {t.id === 1 ? (
                  <div style={{
                    flex:1, boxSizing:"border-box", fontSize:13, fontWeight:700, color:txt,
                    background: isLight ? "#eef0fa" : "#15152a", border:`1px solid ${bdr}`,
                    borderRadius:7, padding:"8px 11px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", gap:6,
                  }} title="כותרת קבועה — לא ניתנת לעריכה">
                    <span>רישום חופשי</span>
                    <span style={{ fontSize:12, opacity:.6 }}>🔒</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={t.title}
                    onChange={e => setField(t.id, "title", e.target.value)}
                    placeholder="שם התבנית (למשל: הודעת פתיחה)"
                    dir="rtl"
                    style={{
                      flex:1, boxSizing:"border-box", fontSize:13, color:txt,
                      background:inputBg, border:`1px solid ${bdr}`, borderRadius:7,
                      padding:"8px 11px", outline:"none", fontFamily:"inherit",
                    }}
                  />
                )}
              </div>
              {/* גוף ההודעה */}
              <label style={{ fontSize:11, fontWeight:700, color:sub, marginBottom:5, display:"block" }}>
                תוכן ההודעה
              </label>
              <textarea
                value={t.body}
                onChange={e => setField(t.id, "body", e.target.value)}
                placeholder="כתוב כאן את גוף הודעת הווטסאפ המלא…"
                dir="rtl" rows={4}
                style={{
                  width:"100%", boxSizing:"border-box", fontSize:13, lineHeight:1.6,
                  color:txt, background:inputBg, border:`1px solid ${bdr}`, borderRadius:7,
                  padding:"9px 11px", outline:"none", fontFamily:"inherit",
                  resize:"vertical", minHeight:80,
                }}
              />
            </div>
          ))}

          {/* כפתורי פעולה */}
          <div style={{ display:"flex", gap:9, marginTop:6, position:"sticky", bottom:0, paddingTop:6, background:panelBg }}>
            <button
              onClick={handleSave}
              style={{
                flex:1, background:`linear-gradient(135deg,${WA},#1eb858)`, color:"#fff",
                border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:800,
                cursor:"pointer", fontFamily:"inherit",
              }}
            >✓ שמור תבניות</button>
            <button
              onClick={onClose}
              style={{
                background:"transparent", color:sub, border:`1px solid ${bdr}`,
                borderRadius:9, padding:"12px 18px", fontSize:13, cursor:"pointer", fontFamily:"inherit",
              }}
            >ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PipelineStageManager — ניהול שלבי מכירות (אדמין בלבד) ─────────────────
   הוספה/עריכה/מחיקה/סידור/החלפת ארכיון. כל פעולה עוברת דרך ה-handlers ב-
   MainDashboard (שמכילים גם הגנת isAdmin וגם שמירה ל-pipeline_stages).
   ──────────────────────────────────────────────────────────────────────── */
function PipelineStageManager({ stages, onAdd, onUpdate, onDelete, onReorder, onClose, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const panelBg = isLight ? "#ffffff" : "#13132b";
  const cardBg  = isLight ? "#f4f6ff" : "#16162c";
  const bdr     = isLight ? "#d8ddf0" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#7070a0" : "#8080b0";
  const inputBg = isLight ? "#f4f2ff" : "#1a1a35";

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#7c6fcd");

  const sorted = [...stages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1100, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
    }}>
      <div onClick={e => e.stopPropagation()} dir="rtl" style={{
        background:panelBg, borderRadius:16, width:"100%", maxWidth:560, maxHeight:"90vh",
        overflowY:"auto", border:`1px solid ${bdr}`, boxShadow:"0 20px 60px rgba(0,0,0,.5)",
      }}>
        <div style={{
          padding:"16px 22px", borderBottom:`1px solid ${bdr}`, display:"flex",
          alignItems:"center", justifyContent:"space-between",
          background: isLight ? "linear-gradient(135deg,#eef0fa,#e8f0ff)" : "linear-gradient(135deg,#1a1a3a,#111128)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:20 }}>📋</span>
            <span style={{ fontSize:15, fontWeight:900, color:txt }}>ניהול שלבי מכירות</span>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:"18px 22px" }}>
          {/* רשימת שלבים קיימים */}
          <div style={{ display:"flex", flexDirection:"column", gap:9, marginBottom:20 }}>
            {sorted.map((s, i) => (
              <div key={s.id} style={{
                display:"flex", alignItems:"center", gap:9, padding:"10px 12px",
                background:cardBg, border:`1px solid ${bdr}`, borderRadius:10,
              }}>
                {/* חצי סידור */}
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  <button onClick={() => onReorder(s.id, "up")} disabled={i===0}
                    style={{ background:"none", border:"none", color:sub, cursor:i===0?"default":"pointer", fontSize:11, opacity:i===0?.3:1, padding:0 }}>▲</button>
                  <button onClick={() => onReorder(s.id, "down")} disabled={i===sorted.length-1}
                    style={{ background:"none", border:"none", color:sub, cursor:i===sorted.length-1?"default":"pointer", fontSize:11, opacity:i===sorted.length-1?.3:1, padding:0 }}>▼</button>
                </div>
                {/* בורר צבע */}
                <input type="color" value={s.color || "#7c6fcd"}
                  onChange={e => onUpdate(s.id, { color: e.target.value })}
                  style={{ width:32, height:32, padding:0, border:`1px solid ${bdr}`, borderRadius:6, cursor:"pointer", background:"none", flexShrink:0 }}
                  title="צבע השלב"
                />
                {/* שם השלב */}
                <input type="text" value={s.label}
                  onChange={e => onUpdate(s.id, { label: e.target.value })}
                  dir="rtl" placeholder="שם השלב"
                  style={{ flex:1, minWidth:0, background:inputBg, border:`1px solid ${bdr}`, borderRadius:7, color:txt, padding:"8px 10px", fontSize:13, outline:"none", fontFamily:"inherit" }}
                />
                {/* טוגל ארכיון */}
                <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:sub, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }} title="שלב ארכיון — מסונן מהמדדים">
                  <input type="checkbox" checked={!!s.is_archive}
                    onChange={e => onUpdate(s.id, { is_archive: e.target.checked })}
                    style={{ width:15, height:15, cursor:"pointer", accentColor:s.color }}
                  />
                  ארכיון
                </label>
                {/* מחיקה */}
                <button onClick={() => onDelete(s.id)} title="מחק שלב"
                  style={{ background:"none", border:"none", color:"#e05555", fontSize:15, cursor:"pointer", flexShrink:0, padding:"0 2px" }}>🗑</button>
              </div>
            ))}
          </div>

          {/* הוספת שלב חדש */}
          <div style={{ borderTop:`1px solid ${bdr}`, paddingTop:16 }}>
            <div style={{ fontSize:12, fontWeight:800, color:txt, marginBottom:9 }}>➕ הוסף שלב חדש</div>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                style={{ width:38, height:38, padding:0, border:`1px solid ${bdr}`, borderRadius:7, cursor:"pointer", background:"none", flexShrink:0 }}
                title="צבע"
              />
              <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="שם השלב החדש" dir="rtl"
                onKeyDown={e => { if (e.key==="Enter" && newLabel.trim()) { onAdd(newLabel, newColor); setNewLabel(""); } }}
                style={{ flex:1, minWidth:0, background:inputBg, border:`1px solid ${bdr}`, borderRadius:8, color:txt, padding:"10px 12px", fontSize:13, outline:"none", fontFamily:"inherit" }}
              />
              <button
                onClick={() => { if (newLabel.trim()) { onAdd(newLabel, newColor); setNewLabel(""); } }}
                style={{ background:"linear-gradient(135deg,#7c6fcd,#5d4fb0)", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" }}
              >הוסף</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainDashboard({ userRole, userEmail, advisors = ADVISORS_FALLBACK, onReloadAdvisors, onLogout }) {
  // ── מודל 3 רמות: super_admin (קשיח, bo4wiseli@gmail.com בלבד) / admin (metadata) / sales (ברירת מחדל) ──
  const isSuperAdmin = userRole === "super_admin";
  const isAdmin       = userRole === "admin" || isSuperAdmin; // super_admin הוא תמיד גם admin לצורך הרשאות
  const isSales        = !isAdmin; // "איש מכירות" — מבודד לחלוטין ללידים שלו (advisor_email===email)

  // רשימת מוכרנים "נקייה" לתפריטים/דרופדאונים — לא כוללת את פרופיל הסינון
  // "לידים ולקוחות למיון", שהוא יעד מערכתי טכני ולא מוכרן אמיתי לבחירה
  const selectableAdvisors = useMemo(
    () => advisors.filter(a => a.email !== UNASSIGNED_POOL_EMAIL),
    [advisors]
  );

  // פאנל ניהול מוכרנים — נגיש רק לאדמין/סופר-אדמין (לא לאנשי מכירות רגילים)
  const [showAdvisorMgmt, setShowAdvisorMgmt] = useState(false);

  // בורר "כל המוכרנים" — רלוונטי ופועל רק לאדמין/סופר-אדמין; איש מכירות תמיד נעול על עצמו
  const myEmailNorm = (userEmail || "").toLowerCase().trim();
  const [selectedAdvisor, setSelectedAdvisor] = useState(isAdmin ? "all" : myEmailNorm);

  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [dbError,      setDbError]      = useState(null);
  const [dbErrorVisible, setDbErrorVisible] = useState(false);
  const [activeClient, setActiveClient] = useState(null);

  // ── שמירת הבאנר בתצוגה רגע נוסף אחרי שdbError מתאפס, כדי לאפשר אנימציית fade-out חלקה ──
  useEffect(() => {
    if (dbError) { setDbErrorVisible(true); return; }
    if (!dbErrorVisible) return; // כבר מוסתר — אין צורך בטיימר
    const t = setTimeout(() => setDbErrorVisible(false), 350); // תואם למשך dbErrorOut
    return () => clearTimeout(t);
  }, [dbError]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [toast,        setToast]        = useState(null); // {msg, type}
  const [refreshTick,  setRefreshTick]  = useState(0);    // הגדלה → רענון ידני של הנתונים
  const [refreshing,   setRefreshing]   = useState(false);// אנימציית סיבוב בזמן רענון
  const [showWaTemplates, setShowWaTemplates] = useState(false); // מנהל תבניות ווטסאפ

  // 5 תבניות ווטסאפ גלובליות — נשמרות ב-localStorage (קונפיג ברמת-אפליקציה כמו ערכת צבעים).
  // מבנה: { id, title, body }. ה-title נשמר/מוצג כ-"{מספר} - {כותרת}".
  // נרמול תבניות: בדיוק 6, תבנית 1 תמיד "רישום חופשי" (כותרת נעולה).
  const normalizeWaTemplates = (arr) => {
    const base = [
      { id: 1, title: "רישום חופשי", body: "" },
      { id: 2, title: "תזכורת",       body: "" },
      { id: 3, title: "מעקב",          body: "" },
      { id: 4, title: "הצעת מחיר",     body: "" },
      { id: 5, title: "סגירה",         body: "" },
      { id: 6, title: "תבנית 6",       body: "" },
    ];
    const src = Array.isArray(arr) ? arr : [];
    return base.map(def => {
      const existing = src.find(t => Number(t.id) === def.id);
      if (def.id === 1) return { id: 1, title: "רישום חופשי", body: existing?.body || "" }; // כותרת נעולה
      return existing ? { id: def.id, title: existing.title || def.title, body: existing.body || "" } : def;
    });
  };

  const [waTemplates, setWaTemplates] = useState(() =>
    normalizeWaTemplates(LS.get("wiseli_wa_templates", null))
  );
  const saveWaTemplates = useCallback((next) => {
    const normalized = normalizeWaTemplates(next);
    setWaTemplates(normalized);
    LS.set("wiseli_wa_templates", normalized);
  }, []);

  // רענון ידני — מפעיל מחדש את שליפת הלקוחות + טעינת המוכרנים
  // ── שלבי הצנרת — מקור האמת הדינמי מטבלת pipeline_stages ב-Supabase ──
  // PHASES משמש כ-seed/נפילה-אחורה בלבד אם הטבלה לא נטענת (מונע דשבורד ריק).
  // חשוב: מוצהר לפני ה-handlers של ניהול השלבים, שמפנים אליו במערכי התלות.
  const [pipelineStages, setPipelineStages] = useState(() =>
    PHASES.map((p, i) => ({ id: p.id, label: p.label, color: p.color, sort_order: i, is_archive: p.id === "archive" }))
  );
  const [stagesTick, setStagesTick] = useState(0);
  const [showStageManager, setShowStageManager] = useState(false);

  const loadPipelineStages = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("pipeline_stages").select("*").order("sort_order", { ascending: true });
    if (error) {
      console.warn("טעינת pipeline_stages נכשלה — משתמש בברירת מחדל מקומית:", error.message);
      return;
    }
    if (Array.isArray(data) && data.length) setPipelineStages(data);
  }, []);
  useEffect(() => { loadPipelineStages(); }, [loadPipelineStages, stagesTick]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshTick(t => t + 1);          // מפעיל מחדש את useEffect של שליפת הלקוחות
    try { if (onReloadAdvisors) await onReloadAdvisors(); } catch (e) { console.error(e); }
    // השאר את הסיבוב לפחות 600ms לחיווי ויזואלי נעים
    setTimeout(() => setRefreshing(false), 700);
  }, [onReloadAdvisors]);

  // ════════════════ ניהול שלבי מכירות (אדמין/סופר-אדמין בלבד) ════════════════
  // כל הפעולות מוגנות בבדיקת isAdmin בנוסף ל-RLS ברמת ה-DB.
  const persistStages = useCallback(async (nextStages) => {
    setPipelineStages(nextStages); // עדכון אופטימי
    if (!supabase) return { error: null };
    // upsert מלא של כל השורות (פשוט ועמיד לשינויי סדר/צבע/שם/ארכיון)
    const rows = nextStages.map(s => ({
      id: s.id, label: s.label, color: s.color,
      sort_order: s.sort_order, is_archive: !!s.is_archive,
    }));
    const { error } = await supabase.from("pipeline_stages").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("שגיאת שמירת שלבים:", error.message);
      // זיהוי שגיאת סכמה (טבלה/עמודה חסרה) — הודעה ברורה ופעולתית
      if (/schema cache|could not find|does not exist|relation .* does not exist/i.test(error.message || "")) {
        return { error: { ...error, message: "טבלת pipeline_stages חסרה או לא מעודכנת ב-Supabase. הרץ את קובץ ה-SQL (wiseli_pipeline_stages_FIX.sql) ב-SQL Editor, ואז רענן." } };
      }
    }
    return { error };
  }, []);

  const addStage = useCallback(async (label, color) => {
    if (!isAdmin) return;
    const name = (label || "").trim();
    if (!name) { alert("יש להזין שם לשלב."); return; }
    // מזהה יציב ייחודי (לא תלוי בשם — שינוי שם בעתיד לא ישבור לידים)
    const id = `stage_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const maxOrder = pipelineStages.reduce((m, s) => Math.max(m, s.sort_order ?? 0), -1);
    const next = [...pipelineStages, { id, label: name, color: color || "#7c6fcd", sort_order: maxOrder + 1, is_archive: false }];
    const { error } = await persistStages(next);
    if (error) setToast({ msg: `שגיאה בהוספת שלב: ${error.message}`, type: "error" });
    else setToast({ msg: `השלב "${name}" נוסף`, type: "success" });
  }, [isAdmin, pipelineStages, persistStages]);

  const updateStage = useCallback(async (id, patch) => {
    if (!isAdmin) return;
    // שינוי שם = שינוי label בלבד. clients.phase שומר id יציב — אין צורך ב-cascade.
    const next = pipelineStages.map(s => s.id === id ? { ...s, ...patch } : s);
    const { error } = await persistStages(next);
    if (error) setToast({ msg: `שגיאה בעדכון שלב: ${error.message}`, type: "error" });
  }, [isAdmin, pipelineStages, persistStages]);

  const deleteStage = useCallback(async (id) => {
    if (!isAdmin) return;
    // הגנת בטיחות: אסור למחוק שלב עם לקוחות פעילים
    const count = clients.filter(c => c.phase === id).length;
    if (count > 0) {
      alert("לא ניתן למחוק שלב זה כיוון שיש בו לקוחות פעילים. העבר אותם שלב תחילה.");
      return;
    }
    if (!window.confirm("למחוק את השלב? פעולה זו אינה ניתנת לביטול.")) return;
    const next = pipelineStages.filter(s => s.id !== id).map((s, i) => ({ ...s, sort_order: i }));
    setPipelineStages(next);
    if (supabase) {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) { setToast({ msg: `שגיאה במחיקה: ${error.message}`, type: "error" }); return; }
      await persistStages(next); // עדכון sort_order לשאר
    }
    setToast({ msg: "השלב נמחק", type: "success" });
  }, [isAdmin, clients, pipelineStages, persistStages]);

  const reorderStage = useCallback(async (id, dir) => {
    if (!isAdmin) return;
    const sorted = [...pipelineStages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapWith = dir === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    [sorted[idx], sorted[swapWith]] = [sorted[swapWith], sorted[idx]];
    const next = sorted.map((s, i) => ({ ...s, sort_order: i }));
    const { error } = await persistStages(next);
    if (error) setToast({ msg: `שגיאה בשינוי סדר: ${error.message}`, type: "error" });
  }, [isAdmin, pipelineStages, persistStages]);

  // טוסט הצלחה/שגיאה — נעלם אוטומטית
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // נעילת גלילת הרקע כשלוח השנה פתוח
  useEffect(() => {
    if (showCalendar) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [showCalendar]);

  const [showColors,   setShowColors]   = useState(false);
  const [showFont,     setShowFont]     = useState(false);
  const [theme,        setTheme]        = useState(() => LS.get("onyx_theme", DEFAULT_THEME));
  const [phaseColors,  setPhaseColors]  = useState(() => LS.get("onyx_phase_colors", DEFAULT_THEME.phases));
  const [fontSizes,    setFontSizes]    = useState(() => LS.get("onyx_font_sizes", DEFAULT_FONT_SIZES));

  const colControls = useColumns();

  /* ── טעינת לקוחות מ-Supabase ──
     מודל 3 רמות:
       • איש מכירות (sales) — תמיד מסונן אך ורק ללידים שלו (advisor_email===email).
       • admin/super_admin — שולף הכל כברירת מחדל, או מסנן לפי selectedAdvisor אם נבחר סוכן ספציפי.
     הסינון כאן הוא תיאום UI בלבד — האכיפה האמיתית היא ב-RLS של Supabase (ראה
     wiseli_rls_3tier_update.sql), שבודק את אותו תנאי בדיוק ברמת ה-DB.
     ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!supabase) {
      setClients([]);
      setDbError("משתני הסביבה לא מוגדרים");
      setLoading(false);
      return;
    }
    // קביעת מסנן: sales תמיד נעול על עצמו; admin/super_admin לפי selectedAdvisor ("all" = הכל)
    const filterEmail = isSales
      ? myEmailNorm
      : (selectedAdvisor !== "all" ? selectedAdvisor : null);

    let query = supabase.from("clients").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
    if (filterEmail) query = query.eq("advisor_email", filterEmail);
    query.then(({ data, error }) => {
      if (cancelled) return;
      // ── עמודת sort_order חסרה בטבלה (סכמה ישנה/לא מעודכנת) ──
      // נסה שוב ללא מיון לפי sort_order, כדי שהאפליקציה תמשיך לעבוד
      // (להוספת העמודה בפועל: ראה ה-SQL בהערה למעלה ב-PHASES, יש להריץ פעם אחת ב-Supabase SQL editor)
      if (error && /sort_order/i.test(error.message || "")) {
        console.warn("עמודת sort_order חסרה ב-DB — שולף ללא מיון לפי סדר ידני. הרץ את ה-ALTER TABLE המצורף כדי לתקן לצמיתות.");
        let fallbackQuery = supabase.from("clients").select("*").order("created_at", { ascending: true });
        if (filterEmail) fallbackQuery = fallbackQuery.eq("advisor_email", filterEmail);
        fallbackQuery.then(({ data: fbData, error: fbError }) => {
          if (cancelled) return;
          if (fbError) { setDbError(fbError.message); setClients([]); setLoading(false); return; }
          setDbError("עמודת sort_order חסרה בטבלת clients — הסדר הידני מושבת עד שהעמודה תתווסף (ראה הוראות SQL)");
          setClients(migrateClientRows(fbData));
          setLoading(false);
        });
        return;
      }
      if (error) { setDbError(error.message); setClients([]); setLoading(false); return; }
      setClients(migrateClientRows(data));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isSales, myEmailNorm, selectedAdvisor, refreshTick]);

  const handleThemeChange  = useCallback((t) => { setTheme(t);       LS.set("onyx_theme", t); }, []);
  const handlePhasesChange = useCallback((p) => { setPhaseColors(p); LS.set("onyx_phase_colors", p); }, []);
  const handleFontChange   = useCallback((f) => { setFontSizes(f);   LS.set("onyx_font_sizes", f); }, []);

  // ── מיפוי שלבים לתצוגה — נגזר מטבלת pipeline_stages (מקור האמת) ──
  // כל שלב מביא את הצבע וה-is_archive שלו מה-DB. dim נגזר מהצבע לרקע מעומעם.
  const themedPhases = useMemo(() =>
    [...pipelineStages]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(p => ({
        id: p.id,
        label: p.label,
        color: p.color || "#7c6fcd",
        dim: (p.color || "#7c6fcd") + "30",
        is_archive: !!p.is_archive,
      })),
  [pipelineStages]);

  // קבוצת מזהי שלבי ארכיון — לסינון מטריקות
  const archivePhaseIds = useMemo(() => new Set(themedPhases.filter(p => p.is_archive).map(p => p.id)), [themedPhases]);

  /* ── המרת אובייקט לקוח → שורת DB ── */
  const toDbRow = useCallback((obj) => {
    try {
      const row = {};
      // הערה: collateral_security_date/signing_date, mortgage_*, final_execution_*,
      // insurance_*, signing_day_order/final_day_order, approvals, requested_mix —
      // כל אלה הוסרו מהרשימה הלבנה. אין יותר שום רכיב UI שכותב אליהם (ApprovalCard,
      // ExecutionDates, ושלושת פריטי הצ'ק-ליסט שהוסרו — כולם נמחקו). collateral_approval_date
      // ו-collateral_appraisal_date נשארים: הם עדיין גב הנתונים של "נשלח WhatsApp"/"נשלח Email"
      // בצ'ק-ליסט (רק שונה התווית/אייקון, לא העמודה עצמה).
      // property_* — שדות "פרטי הנכס למכירה" (חדש). post_onboarding_checks — אובייקט
      // ה-JSONB של הצ'ק-ליסט החדש "לאחר צירוף הלקוח" (אותו דפוס בדיוק כמו securities).
      const SCALAR = ["id","phase","name","first_name","last_name","handler","opFor","case_type","lead_source","advisor_email","fee","fee_paid_notes","description","dropbox_url","collateral_approval_date","collateral_appraisal_date","fee_paid_date","property_street","property_house_number","property_neighborhood","property_city","property_floor","property_type","property_condition","property_mamad","property_on_market_since","property_published_on","property_balcony","property_elevator","property_parking","property_seller_notes","property_ad_link","whatsapp_initial_sent_at"];
      const DATE_COLS = ["collateral_approval_date","collateral_appraisal_date","fee_paid_date","property_on_market_since","whatsapp_initial_sent_at"];
      SCALAR.forEach(k => {
        if (!(k in obj)) return;
        // עמודות date — מחרוזת ריקה הופכת ל-null (Postgres דוחה "" עבור date)
        if (DATE_COLS.includes(k)) row[k] = obj[k] ? obj[k] : null;
        else row[k] = obj[k] ?? "";
      });
      // עמודות boolean — V ביצוע
      const BOOL = ["collateral_approval_completed","collateral_appraisal_completed","fee_paid"];
      BOOL.forEach(k => { if (k in obj) row[k] = !!obj[k]; });
      // עמודות מספריות — מחרוזת ריקה/לא-תקינה הופכת ל-null (Postgres דוחה "" עבור NUMERIC).
      // כולל את שדות הנכס המספריים (גודל/חדרים/מחיר) שגרמו לקריסת "invalid input syntax for type numeric".
      // null תקין גם ל-NUMERIC וגם ל-TEXT, כך שהתיקון בטוח ללא תלות בטיפוס העמודה בפועל.
      const NUM = ["sort_order","property_size_sqm","property_rooms","property_price"];
      NUM.forEach(k => {
        if (!(k in obj)) return;
        const v = obj[k];
        if (v === null || v === undefined || String(v).trim() === "" || isNaN(Number(v))) row[k] = null;
        else row[k] = Number(v);
      });
      const JSONB = ["banks","phones","tids","timeline","custom_calendar_events","emails_list","securities","post_onboarding_checks","whatsapp_log"];
      JSONB.forEach(k => {
        if (!(k in obj)) return;
        const v = obj[k];
        if (typeof v === "string") { try { row[k] = JSON.parse(v); } catch { row[k] = (k==="securities"||k==="post_onboarding_checks") ? {} : []; } }
        else row[k] = v ?? ((k==="securities"||k==="post_onboarding_checks") ? {} : []);
      });
      // whatsapp_last_sent — אובייקט JSONB או null (לא מערך/אובייקט ריק)
      if ("whatsapp_last_sent" in obj) {
        const v = obj.whatsapp_last_sent;
        if (v && typeof v === "object") row.whatsapp_last_sent = v;
        else if (typeof v === "string" && v.trim()) { try { row.whatsapp_last_sent = JSON.parse(v); } catch { row.whatsapp_last_sent = null; } }
        else row.whatsapp_last_sent = null;
      }
      // שמירת תאימות: עמודת name נגזרת מ-first_name+last_name כשהם קיימים בעדכון,
      // כדי שכל הקריאות הקיימות של client.name ימשיכו לעבוד.
      if ("first_name" in row || "last_name" in row) {
        const fn = (row.first_name ?? obj.first_name ?? "").trim();
        const ln = (row.last_name  ?? obj.last_name  ?? "").trim();
        const combined = [fn, ln].filter(Boolean).join(" ");
        if (combined) row.name = combined;
      }
      return sanitizeClientPayload(row);
    } catch(err) {
      console.error("שגיאה ב-toDbRow:", err);
      return {};
    }
  }, []);

  /* ── הוספת לקוח ── */
  const addClient = useCallback(async (c) => {
    // קביעת שיוך הליד:
    //   • איש מכירות (sales) — תמיד ובאופן בלעדי לעצמו. אין שדה/דרופדאון שמאפשר לו
    //     לבחור סוכן אחר (ראה InlineAddRow — לא מציג את הבורר עבור sales).
    //     גם אם איכשהו יישלח advisor_email אחר, הוא נדרס כאן ללא תנאי.
    //   • admin/super_admin — יכול לבחור סוכן יעד מפורשות בטופס (c.advisor_email),
    //     אחרת נופל לסוכן שנבחר בכותרת (selectedAdvisor), אחרת לעצמו.
    const myEmail = (userEmail || "").toLowerCase().trim();
    const assignedAdvisor = isSales
      ? myEmail
      : (c.advisor_email || (selectedAdvisor !== "all" ? selectedAdvisor : myEmail));
    const clientWithAdvisor = { ...c, advisor_email: assignedAdvisor };

    if (!supabase) {
      setClients(p => [...p, clientWithAdvisor]);
      return;
    }
    try {
      const row = toDbRow(clientWithAdvisor);
      if (!row.id) { alert("שגיאה: לא ניתן ליצור לקוח ללא ID"); return; }
      const { data, error } = await supabase
        .from("clients")
        .insert([row])
        .select()
        .single();
      if (error) {
        console.error("שגיאת Supabase בהוספת לקוח:", error);
        alert(`שגיאה בשמירת הלקוח:\n${error.message}`);
        return;
      }
      const normalized = { ...data, requestedMix: data.requested_mix || "" };
      setClients(p => [...p, normalized]);
      // שמירה הצליחה — אם הייתה התרעת DB ישנה (למשל מבעיית סכמה שכבר תוקנה), הסר אותה
      setDbError(null);
    } catch(err) {
      console.error("שגיאה לא צפויה בהוספת לקוח:", err);
      alert(`שגיאה בלתי צפויה:\n${err?.message || err}`);
    }
  }, [toDbRow, userEmail, isSales, selectedAdvisor]);

  /* ── יבוא לידים בכמות (Bulk) מקובץ Excel/CSV ──
     כל ליד מקבל:
       • advisor_email — אותה לוגיקה בדיוק כמו addClient (sales=עצמו תמיד; admin=הבורר/עצמו).
         זה קריטי ל-RLS: בלי advisor_email נכון, Supabase דוחה את ה-insert.
       • phase = "incoming" — תמיד נכנס לעמודת "ליד נכנס".
       • phone → ממופה למערך phones [{number, ownerName}] לפי מבנה הנתונים הקיים.
     מחזיר את מספר הלידים שיובאו בהצלחה (לטוסט). זורק שגיאה אם ה-insert נכשל. */
  const handleImportLeads = useCallback(async (leads) => {
    if (!Array.isArray(leads) || leads.length === 0) return 0;
    const myEmail = (userEmail || "").toLowerCase().trim();
    const assignedAdvisor = isSales
      ? myEmail
      : (selectedAdvisor !== "all" ? selectedAdvisor : myEmail);

    // בנה אובייקט לקוח מלא לכל ליד דרך mkClient (ברירות מחדל תקינות לכל השדות),
    // ואז דרך toDbRow (רשימה לבנה) — בדיוק כמו addClient, רק בכמות.
    // toDbRow מבצע את הסניטציה המספרית (size/rooms/price ריק→null) ואת טיפול התאריך,
    // כך שאין צורך לסנן כאן ידנית — מספיק להעביר את הערכים כפי שהם.
    const rows = leads.map(ld => {
      // העבר את כל שדות הליד פרט ל-phone (שמטופל בנפרד למבנה phones), name ו-phase
      const { phone, ...rest } = ld;
      const client = mkClient({
        ...rest,                       // כל שדות הנכס הממופים: city/street/number/neighborhood/type/condition/size/rooms/floor/balcony/mamad/parking/elevator/price/market_since/published_on/ad_link/seller_notes/lead_source
        name: ld.name || "",
        phase: "incoming",              // תמיד עמודת "ליד נכנס"
        advisor_email: assignedAdvisor, // הטבעת RLS — קריטי
        // טלפון בודד מהקובץ → מבנה phones הקיים
        phones: (phone || "").trim()
          ? [{ number: phone.trim(), ownerName: ld.name || "" }]
          : [],
      });
      return toDbRow(client);
    });

    if (!supabase) {
      // מצב ללא DB (תצוגה מקדימה) — הוסף ל-state המקומי בלבד
      setClients(p => [...p, ...rows]);
      return rows.length;
    }

    const { data, error } = await supabase.from("clients").insert(rows).select();
    if (error) {
      console.error("שגיאת Supabase ביבוא לידים:", error);
      throw new Error(error.message);
    }
    const normalized = (data || []).map(d => ({ ...d, requestedMix: d.requested_mix || "" }));
    setClients(p => [...p, ...normalized]);
    setDbError(null);
    return normalized.length;
  }, [toDbRow, userEmail, isSales, selectedAdvisor]);

  const changePhase = useCallback(async (id, phase) => {
    setClients(p => p.map(c => c.id!==id ? c : { ...c, phase }));
    setActiveClient(prev => prev?.id===id ? { ...prev, phase } : prev);
    if (!supabase) return;
    const { error } = await supabase.from("clients").update({ phase }).eq("id", id);
    if (error) {
      console.error("שגיאת Supabase בשינוי שלב:", error);
      alert(`שגיאה בשינוי שלב:\n${error.message}`);
    }
  }, []);

  const addNote = useCallback(async (id, text) => {
    try {
      if (!id || !text?.trim()) return;
      const authorName = getAdvisorName(userEmail, advisors) || userEmail || "";
      const entry = { date: todayStr(), time: nowTimeStr(), author_name: authorName, note: text.trim() };
      let newTimeline;
      setClients(p => p.map(c => {
        if (c.id !== id) return c;
        newTimeline = [entry, ...(Array.isArray(c.timeline) ? c.timeline : [])];
        return { ...c, timeline: newTimeline };
      }));
      setActiveClient(prev => {
        if (prev?.id !== id) return prev;
        return { ...prev, timeline: [entry, ...(Array.isArray(prev.timeline) ? prev.timeline : [])] };
      });
      if (!supabase || !newTimeline) return;
      const { error } = await supabase.from("clients").update({ timeline: newTimeline }).eq("id", id);
      if (error) console.error("שגיאת DB בהוספת הערה:", error.message);
    } catch(err) {
      console.error("שגיאה לא צפויה בהוספת הערה:", err);
    }
  }, [userEmail, advisors]);

  const updateField = useCallback(async (id, fieldOrPatch, val) => {
    try {
      if (!id) { console.error("updateField: חסר ID"); return; }
      const patch = typeof fieldOrPatch === "string"
        ? { [fieldOrPatch]: val }
        : (fieldOrPatch && typeof fieldOrPatch === "object" ? fieldOrPatch : {});

      // עדכון state מקומי — וודא שכל לקוח מחזיר אובייקט תקין
      setClients(p => p.map(c => {
        if (c.id !== id) return c;
        return { ...c, ...patch };
      }));
      setActiveClient(prev => {
        if (!prev || prev.id !== id) return prev;
        return { ...prev, ...patch };
      });

      if (!supabase) return;

      // בנה dbPatch רק עם שדות הpatch — דרך toDbRow
      const dbPatch = toDbRow({ ...patch, id });
      delete dbPatch.id; // id הולך ב-.eq() ולא בתוכן ה-update
      if (Object.keys(dbPatch).length === 0) return;

      const { error } = await supabase.from("clients").update(dbPatch).eq("id", id);
      if (error) {
        console.error("שגיאת Supabase בעדכון שדה:", error);
        alert(`שגיאה בשמירת נתונים:\n${error.message}`);
      }
    } catch(err) {
      console.error("שגיאה לא צפויה ב-updateField:", err);
      alert(`שגיאה בלתי צפויה:\n${err?.message || err}`);
    }
  }, [toDbRow]);

  const deleteClient = useCallback(async (id) => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק את הלקוח לצמיתות?\nפעולה זו אינה ניתנת לביטול.")) return;
    // שמור snapshot לrollback אם המחיקה תיכשל
    const snapshot = clients.find(c => c.id === id);
    setClients(p => p.filter(c => c.id !== id));
    setActiveClient(null);
    if (!supabase) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      console.error("שגיאת Supabase במחיקת לקוח:", error);
      alert(`שגיאה במחיקת הלקוח:\n${error.message}`);
      // rollback — החזר את הלקוח למצב המקומי
      if (snapshot) setClients(p => [...p, snapshot].sort((a,b) => a.id > b.id ? 1 : -1));
    }
  }, [clients]);

  // ════════════════ פעולות מרובות (Bulk / Multi-Select) ════════════════
  // selectionPhase = id השלב שנמצא כרגע במצב בחירה (בלעדי לעמודה אחת), או null.
  // selectedIds = Set של מזהי לקוחות מסומנים.
  const [selectionPhase, setSelectionPhase] = useState(null);
  const [selectedIds,    setSelectedIds]    = useState(() => new Set());

  // יציאה ממצב בחירה + איפוס מלא
  const clearSelection = useCallback(() => {
    setSelectionPhase(null);
    setSelectedIds(new Set());
  }, []);

  // הפעלה/כיבוי מצב בחירה עבור שלב מסוים (בלעדי — מעבר לשלב אחר מאפס)
  const toggleSelectionMode = useCallback((phaseId) => {
    setSelectionPhase(prev => {
      setSelectedIds(new Set()); // תמיד התחל נקי בעת החלפת מצב/עמודה
      return prev === phaseId ? null : phaseId;
    });
  }, []);

  // סימון/ביטול לקוח בודד
  const toggleSelectId = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // בחר הכל / נקה הכל עבור רשימת מזהים נתונה (של העמודה הפעילה)
  const setSelectAll = useCallback((ids, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) ids.forEach(id => next.add(id));
      else ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  // ── פעולה A: העברת שלב לכל המסומנים (זמין לכולם) ──
  const bulkMoveStage = useCallback(async (targetPhase) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !targetPhase) return;
    setClients(p => p.map(c => ids.includes(c.id) ? { ...c, phase: targetPhase } : c));
    if (supabase) {
      const { error } = await supabase.from("clients").update({ phase: targetPhase }).in("id", ids);
      if (error) {
        console.error("שגיאת Supabase בהעברת שלב מרובה:", error);
        setToast({ msg: `שגיאה בהעברת שלב: ${error.message}`, type: "error" });
        return;
      }
    }
    setToast({ msg: `הועברו בהצלחה ${ids.length} לקוחות`, type: "success" });
    clearSelection();
  }, [selectedIds, clearSelection]);

  // ── פעולה B: מחיקת כל המסומנים (אדמין בלבד) ──
  const bulkDelete = useCallback(async () => {
    if (!isAdmin) return; // הגנת הרשאה
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק ${ids.length} לקוחות?\nפעולה זו אינה ניתנת לביטול.`)) return;
    const snapshot = clients.filter(c => ids.includes(c.id));
    setClients(p => p.filter(c => !ids.includes(c.id)));
    if (supabase) {
      const { error } = await supabase.from("clients").delete().in("id", ids);
      if (error) {
        console.error("שגיאת Supabase במחיקה מרובה:", error);
        setToast({ msg: `שגיאה במחיקה: ${error.message}`, type: "error" });
        if (snapshot.length) setClients(p => [...p, ...snapshot]); // rollback
        return;
      }
    }
    setToast({ msg: `נמחקו בהצלחה ${ids.length} לקוחות`, type: "success" });
    clearSelection();
  }, [isAdmin, selectedIds, clients, clearSelection]);

  // ── פעולה C: שיוך מחדש לאיש מכירות (אדמין בלבד) ──
  const bulkReassign = useCallback(async (advisorEmail) => {
    if (!isAdmin) return; // הגנת הרשאה
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !advisorEmail) return;
    const email = advisorEmail.toLowerCase().trim();
    setClients(p => p.map(c => ids.includes(c.id) ? { ...c, advisor_email: email } : c));
    if (supabase) {
      const { error } = await supabase.from("clients").update({ advisor_email: email }).in("id", ids);
      if (error) {
        console.error("שגיאת Supabase בשיוך מרובה:", error);
        setToast({ msg: `שגיאה בשיוך: ${error.message}`, type: "error" });
        return;
      }
    }
    setToast({ msg: `שויכו בהצלחה ${ids.length} לקוחות`, type: "success" });
    clearSelection();
  }, [isAdmin, selectedIds, clearSelection]);

  // שכפול לקוח — מעתיק שם + פרטי קשר בלבד, שאר השדות ריקים
  const duplicateClient = useCallback(async (src) => {
    if (!src) return;
    const dup = mkClient({
      phase:     "incoming",
      name:      src.name || "",
      case_type: "לקוח משוכפל, הזן פירטי התיק",
      // פרטי קשר וזיהוי בלבד
      phones:    Array.isArray(src.phones) ? src.phones : [],
      tids:      Array.isArray(src.tids) ? src.tids : [],
      emails_list: Array.isArray(src.emails_list) ? src.emails_list : [],
      // שיוך יועץ נשמר כדי שהלקוח יופיע באותו מסך
      advisor_email: src.advisor_email || "",
      // כל השאר — ערכי ברירת מחדל ריקים (מ-mkClient)
    });
    if (!supabase) {
      setClients(p => [...p, dup]);
      setActiveClient(dup);
      return;
    }
    try {
      const row = toDbRow(dup);
      const { data, error } = await supabase.from("clients").insert([row]).select().single();
      if (error) {
        console.error("שגיאת Supabase בשכפול לקוח:", error);
        alert(`שגיאה בשכפול הלקוח:\n${error.message}`);
        return;
      }
      const normalized = { ...data, requestedMix: data.requested_mix || "" };
      setClients(p => [...p, normalized]);
      setActiveClient(normalized); // פתח את הלקוח החדש
    } catch(err) {
      console.error("שגיאה לא צפויה בשכפול לקוח:", err);
      alert(`שגיאה בלתי צפויה:\n${err?.message || err}`);
    }
  }, [toDbRow]);

  // שינוי סדר לקוחות בתוך קבוצת שלב — שומר sort_order ל-Supabase
  const reorderClients = useCallback(async (phaseId, orderedIds) => {
    // עדכון אופטימי של ה-state המקומי: הקצה sort_order רץ לכל לקוחות הקבוצה
    const orderMap = Object.fromEntries(orderedIds.map((id, i) => [id, i]));
    setClients(prev => prev.map(c =>
      c.phase === phaseId && (c.id in orderMap) ? { ...c, sort_order: orderMap[c.id] } : c
    ));
    if (!supabase) return;
    try {
      // שמירה מקבילה של כל השורות בקבוצה
      await Promise.all(orderedIds.map((id, i) =>
        supabase.from("clients").update({ sort_order: i }).eq("id", id)
      ));
    } catch (err) {
      console.error("שגיאה בשמירת סדר הלקוחות:", err);
      alert(`שגיאה בשמירת הסדר:\n${err?.message || err}`);
    }
  }, []);

  // השליפה מ-Supabase כבר מסוננת באופן בלתי-מותנה לפי advisor_email === המשתמש המחובר
  // (ראה ה-useEffect למעלה) — אין יותר מושג של "כל הסוכנים" או בחירת סוכן לצפייה.
  // advisorScoped נשאר כשם משתנה pass-through כדי לא לגעת בכל נקודות הצריכה שלו למטה.
  const advisorScoped = clients;

  const grouped = useMemo(() => themedPhases.map(p => ({
    phase: p,
    clients: advisorScoped
      .filter(c => c.phase===p.id)
      .slice()
      .sort((a, b) => {
        // מיון לפי sort_order (null אחרון), ואז לפי created_at ליציבות
        const sa = (a.sort_order === null || a.sort_order === undefined) ? Infinity : Number(a.sort_order);
        const sb = (b.sort_order === null || b.sort_order === undefined) ? Infinity : Number(b.sort_order);
        if (sa !== sb) return sa - sb;
        const ca = a.created_at || "", cb = b.created_at || "";
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      }),
  })), [themedPhases, advisorScoped]);

  const stats = useMemo(() => {
    // סינון חכם: לקוחות בשלב ארכיון (is_archive===true) מוחרגים מהמדדים הפעילים.
    const active = advisorScoped.filter(c => !archivePhaseIds.has(c.phase));
    return [
      { label:"סה״כ לידים",              val: active.length },
      { label:"פולואו אפ - מעוניינים",    val: active.filter(c=>c.phase==="followup_interested").length },
      { label:"נסגרו כלקוח",              val: active.filter(c=>c.phase==="closed_client").length },
      { label:"לא מעוניינים / לא להתקשר", val: active.filter(c=>["followup_not_interested","do_not_call"].includes(c.phase)).length },
    ];
  }, [advisorScoped, archivePhaseIds]);

  const T = theme;
  if (loading) return (
    <div dir="rtl" style={{
      minHeight:"100vh", background:T.bg || "#f0f2f8",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Heebo',sans-serif", gap:16,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width:44, height:44, borderRadius:12,
        background:"linear-gradient(135deg,#7c6fcd,#2d88d4)",
        display:"flex", alignItems:"center", justifyContent:"center",
        color:"#fff", fontWeight:900, fontSize:22,
        animation:"spin 1.8s linear infinite",
      }}>O</div>
      <div style={{ color:T.textSecondary||"#6070a0", fontSize:14, fontWeight:700 }}>
        טוען נתונים…
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:${T.bg};font-family:'Heebo',sans-serif}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${T.bg}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        input:focus,textarea:focus,select:focus{border-color:#5050a0!important;outline:none}
        @keyframes slideIn{from{transform:translateX(-40px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .gear-btn{transition:transform .3s ease, background .2s, border-color .2s, box-shadow .2s !important}
        @keyframes dbErrorOut{to{opacity:0; transform:translateY(-100%)}}
      `}</style>

      {/* ── באנר שגיאת DB (לא קורס — רק מודיע) ── */}
      {/* dbErrorVisible נשאר מורכב רגע נוסף אחרי שdbError מתאפס, כדי שתתבצע אנימציית היעלמות חלקה ולא הסרה מיידית */}
      {dbErrorVisible && (
        <div dir="rtl" style={{
          position:"fixed", top:0, left:0, right:0, zIndex:9999,
          background:"linear-gradient(135deg,#2a1010,#1a0808)",
          border:"none", borderBottom:"2px solid #c03030",
          padding:"10px 22px",
          display:"flex", alignItems:"center", gap:10,
          fontFamily:"'Heebo',sans-serif",
          animation: dbError ? "none" : "dbErrorOut .35s ease forwards",
        }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <span style={{ color:"#f08080", fontSize:13, fontWeight:700 }}>
            מסד הנתונים לא זמין — מוצגים נתוני דוגמה בלבד. ({dbError})
          </span>
          <button
            onClick={() => setDbError(null)}
            style={{ marginRight:"auto", background:"none", border:"none", color:"#f08080", fontSize:18, cursor:"pointer" }}
          >✕</button>
        </div>
      )}

      <div dir="rtl" style={{ minHeight:"100vh", background:T.bg, color:T.textPrimary, paddingTop: dbError ? 44 : 0 }}>

        {/* ── Header ── */}
        <div style={{
          background:T.headerBg, borderBottom:`1px solid ${T.border}`,
          padding:"0 12px", height:60,
          display:"flex", alignItems:"center", gap:8,
          position:"sticky", top:0, zIndex:200,
          boxShadow:"0 2px 24px #0009",
        }}>
          {/* לוגו */}
          <div style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
            <div style={{ lineHeight:1.2 }}>
              <div style={{ fontWeight:900, fontSize:16, color:T.textPrimary, letterSpacing:-.3 }}>ONYX LEADS</div>
              <div style={{ fontSize:9, color:T.textSecondary, fontWeight:600 }}>ניהול לידים</div>
            </div>
          </div>

          {/* מרווח גמיש */}
          <div style={{ flex:1, minWidth:0 }} />

          {/* ── בורר "כל המוכרנים" — אדמין/סופר-אדמין בלבד; איש מכירות לא רואה את זה כלל ── */}
          {isAdmin && selectableAdvisors.length > 0 && (
            <select
              value={selectedAdvisor}
              onChange={e => setSelectedAdvisor(e.target.value)}
              dir="rtl"
              title="סינון לפי מוכרן"
              style={{
                background:T.rowBg, border:`1px solid ${T.border}`,
                borderRadius:8, color:T.textPrimary, fontSize:11,
                padding:"6px 8px", outline:"none", fontFamily:"inherit",
                cursor:"pointer", flexShrink:0, maxWidth:120,
                fontWeight:700,
              }}
            >
              <option value="all">👥 כל המוכרנים</option>
              {selectableAdvisors.map(a => (
                <option key={a.email} value={a.email}>{a.name}</option>
              ))}
            </select>
          )}

          {/* ── תג זהות + תפקיד ── */}
          <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
            <span style={{
              background: isSuperAdmin ? "#e8a83822" : isAdmin ? "#3dba7e22" : "#7c6fcd22",
              color:       isSuperAdmin ? "#b07818"   : isAdmin ? "#2a8a5a"  : "#7c6fcd",
              border:`1px solid ${isSuperAdmin ? "#e8a83866" : isAdmin ? "#3dba7e66" : "#7c6fcd66"}`,
              borderRadius:20, padding:"3px 8px",
              fontSize:10, fontWeight:800, whiteSpace:"nowrap",
            }}>
              {isSuperAdmin ? "👑 אדמין ראשי" : isAdmin ? "⚡ אדמין" : `👤 ${getAdvisorName(userEmail, advisors) || userEmail || "משתמש"}`}
            </span>
          </div>

          {/* ── כפתור לוח שנה ── */}
          <button
            onClick={() => setShowCalendar(true)}
            title="לוח שנה"
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:40, height:40, flexShrink:0,
              background:"linear-gradient(135deg,#1e1a40,#12203a)",
              border:"1px solid #3a3a6088",
              borderRadius:10, cursor:"pointer",
              boxShadow:"0 2px 10px #0006", transition:"all .2s",
              fontSize:18, marginLeft:8,
            }}
          >🗓️</button>

          {/* ── כפתור גלגל שיניים + תפריט ── */}
          <div style={{ position:"relative", flexShrink:0 }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              title="הגדרות"
              style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:40, height:40,
                background: showSettings
                  ? "linear-gradient(135deg,#3a2a7e,#2a4080)"
                  : "linear-gradient(135deg,#1e1a40,#12203a)",
                border:`1px solid ${showSettings ? "#7c6fcd" : "#3a3a6088"}`,
                borderRadius:10, cursor:"pointer",
                boxShadow: showSettings ? "0 0 18px #7c6fcd55" : "0 2px 10px #0006",
                transition:"all .2s",
                fontSize:18,
                transform: showSettings ? "rotate(45deg)" : "rotate(0deg)",
              }}
            >⚙️</button>

            {/* תפריט נפתח */}
            {showSettings && (
              <div style={{
                position:"absolute", left:0, top:"calc(100% + 8px)",
                background:"#13132b", border:"1px solid #3030608a",
                borderRadius:12, overflow:"hidden",
                boxShadow:"0 16px 48px #000d",
                animation:"fadeUp .15s ease",
                zIndex:500, minWidth:200,
              }}>
                {/* חיצי פאנל */}
                <div style={{
                  padding:"10px 14px 6px",
                  fontSize:10, color:"#50508a", fontWeight:800,
                  letterSpacing:.8, textTransform:"uppercase",
                  borderBottom:"1px solid #2020408a",
                }}>הגדרות</div>

                {/* 0a. רענון נתונים — הפריט הראשון */}
                <button
                  onClick={() => { handleManualRefresh(); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    color:"#9fd4ff", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#16213a"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16, display:"inline-block", animation: refreshing ? "spin 0.7s linear infinite" : "none" }}>↻</span>
                  <span>רענן נתונים</span>
                </button>

                {/* 0b. הגדר ווטסאפ */}
                <button
                  onClick={() => { setShowWaTemplates(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#5fd98a", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#0d2418"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>⚙️</span>
                  <span>הגדר ווטסאפ</span>
                </button>

                {/* 0b2. ניהול שלבי מכירות — אדמין/סופר-אדמין בלבד */}
                {isAdmin && (
                  <button
                    onClick={() => { setShowStageManager(true); setShowSettings(false); }}
                    style={{
                      display:"flex", alignItems:"center", gap:10,
                      width:"100%", padding:"12px 16px",
                      background:"transparent", border:"none",
                      borderTop:"1px solid #2020408a",
                      color:"#9d8cff", fontSize:13, fontWeight:700,
                      cursor:"pointer", textAlign:"right",
                      transition:"background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background="#1a1635"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}
                  >
                    <span style={{ fontSize:16 }}>📋</span>
                    <span>ניהול שלבי מכירות</span>
                  </button>
                )}

                {/* 0c. יבוא לידים — זמין לכל המשתמשים */}
                <button
                  onClick={() => { setShowImport(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#5fd4c4", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#0d2a28"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>📥</span>
                  <span>יבוא לידים</span>
                </button>

                {/* 1. בחירת צבעים */}
                <button
                  onClick={() => { setShowColors(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#c0c0f8", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#1e1e40"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>🎨</span>
                  <span>בחירת צבעים</span>
                </button>

                {/* 2. גודל כתב */}
                <button
                  onClick={() => { setShowFont(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#80d8a0", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#1a2820"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>🔤</span>
                  <span>גודל כתב</span>
                </button>

                {/* 3. הגדר את הנוכחי כברירת מחדל */}
                <button
                  onClick={() => {
                    LS.set("onyx_theme", theme);
                    LS.set("onyx_phase_colors", phaseColors);
                    LS.set("onyx_font_sizes", fontSizes);
                    setShowSettings(false);
                    const btn = document.getElementById("set-default-flash");
                    if (btn) { btn.style.display="block"; setTimeout(()=>{ btn.style.display="none"; },2000); }
                  }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#60c080", fontSize:12, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#102018"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:14 }}>⭐</span>
                  <span>הגדר את הנוכחי כברירת מחדל</span>
                </button>

                {/* 4. איפוס לברירת מחדל מערכת */}
                <button
                  onClick={() => {
                    LS.clear(["onyx_theme","onyx_phase_colors","onyx_font_sizes","onyx_col_order","onyx_col_widths"]);
                    LS.set("onyx_theme", LIGHT_ORIGINAL);
                    LS.set("onyx_phase_colors", LIGHT_ORIGINAL.phases);
                    LS.set("onyx_font_sizes", DEFAULT_FONT_SIZES);
                    setShowSettings(false);
                    window.location.reload();
                  }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#808090", fontSize:12, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#1a1a30"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:14 }}>↺</span>
                  <span>איפוס לברירת מחדל מערכת (Light Mode)</span>
                </button>

                {/* 5. ניהול מוכרנים — אדמין/סופר-אדמין בלבד. איש מכירות לא רואה את הכפתור הזה כלל. */}
                {isAdmin && (
                  <button
                    onClick={() => { setShowAdvisorMgmt(true); setShowSettings(false); }}
                    style={{
                      display:"flex", alignItems:"center", gap:10,
                      width:"100%", padding:"12px 16px",
                      background:"transparent", border:"none",
                      borderTop:"1px solid #2020408a",
                      color:"#a0a0f8", fontSize:13, fontWeight:700,
                      cursor:"pointer", textAlign:"right",
                      transition:"background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background="#1e1e40"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}
                  >
                    <span style={{ fontSize:16 }}>👥</span>
                    <span>ניהול מוכרנים</span>
                  </button>
                )}

                {/* 6. התנתק */}
                <button
                  onClick={() => { setShowSettings(false); onLogout && onLogout(); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#e06060", fontSize:13, fontWeight:800,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#2a1010"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:15 }}>🔓</span>
                  <span>התנתק</span>
                </button>
              </div>
            )}
          </div>

          {/* סגירת תפריט בלחיצה מחוץ */}
          {showSettings && (
            <div
              style={{ position:"fixed", inset:0, zIndex:499 }}
              onClick={() => setShowSettings(false)}
            />
          )}
        </div>

        {/* ── סטטיסטיקות ── */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(2, 1fr)",
          gap:8,
          padding:"12px 12px",
          borderBottom:`1px solid ${T.border}`,
        }}
          className="stats-grid"
        >
          <style>{`@media(min-width:600px){.stats-grid{grid-template-columns:repeat(4,1fr)!important;gap:12px!important;padding:14px 22px!important;}}`}</style>
          {stats.map(s => (
            <div key={s.label} style={{
              background:T.cardBg, borderRadius:10,
              padding:"10px 12px",
              border:`1px solid ${T.border}`,
              textAlign:"center",
              minWidth:0,
            }}>
              <div style={{ fontSize:22, fontWeight:900, color:T.textPrimary }}>{s.val}</div>
              <div style={{ fontSize:10, color:T.textSecondary, marginTop:2, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── לוחות — טבלה מאוחדת ── */}
        {/* הערה: עריכת לידים בלתי-מותנית לכל משתמש על לידים שהוא רואה (RLS כבר מבטיח
            ראייה נכונה לפי תפקיד). שיוך/הקצאת ליד לסוכן אחר מוגבל לאדמין/סופר-אדמין
            בלבד — ראה isAdmin המועבר ל-InlineAddRow ולמגירת הלקוח. */}
        <div style={{ paddingBottom:60 }}>
          <UnifiedTable
            grouped={grouped}
            onOpen={setActiveClient}
            onPhaseChange={changePhase}
            onAddClient={addClient}
            theme={T}
            cols={colControls.cols}
            widths={colControls.widths}
            colControls={colControls}
            fontSizes={fontSizes}
            onReorder={reorderClients}
            advisors={selectableAdvisors}
            isAdmin={isAdmin}
            myName={getAdvisorName(userEmail, advisors) || userEmail}
            selectionPhase={selectionPhase}
            selectedIds={selectedIds}
            onToggleSelectionMode={toggleSelectionMode}
            onToggleSelectId={toggleSelectId}
            onSelectAll={setSelectAll}
          />
        </div>
      </div>

      {/* סרגל פעולות מרובות צף — מופיע כשיש לקוחות מסומנים */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          phases={themedPhases}
          advisors={selectableAdvisors}
          isAdmin={isAdmin}
          onMoveStage={bulkMoveStage}
          onDelete={bulkDelete}
          onReassign={bulkReassign}
          onCancel={clearSelection}
          theme={T}
        />
      )}

      {/* מגירת לוח זמנים */}
      {activeClient && (() => {
        // מקור-אמת יחיד: שלוף את הגרסה העדכנית מתוך clients (נמנע מ-state כפול מנותק)
        const liveClient = clients.find(c => c.id === activeClient.id) || activeClient;
        return (
        <TimelineDrawer
          client={liveClient}
          onClose={() => setActiveClient(null)}
          onAddNote={addNote}
          onUpdate={updateField}
          onNotesUpdate={updateField}
          onDelete={deleteClient}
          onDuplicate={duplicateClient}
          readOnly={false}
          isAdmin={isAdmin}
          advisors={selectableAdvisors}
          waTemplates={waTemplates}
          myName={getAdvisorName(userEmail, advisors) || userEmail || ""}
          phases={themedPhases}
          theme={T}
          fontSizes={fontSizes}
        />
        );
      })()}

      {/* פאנל בחירת צבעים */}
      {showColors && (
        <ColorPickerPanel
          theme={theme}
          onThemeChange={handleThemeChange}
          onClose={() => setShowColors(false)}
          phases={phaseColors}
          onPhasesChange={handlePhasesChange}
        />
      )}

      {/* פאנל גודל כתב */}
      {showFont && (
        <FontSizePanel
          sizes={fontSizes}
          onChange={handleFontChange}
          onClose={() => setShowFont(false)}
          theme={T}
        />
      )}

      {/* פאנל ניהול מוכרנים — אדמין/סופר-אדמין בלבד (גם ברמת render, לא רק כפתור התפריט) */}
      {showAdvisorMgmt && isAdmin && (
        <AdvisorManagementPanel
          advisors={advisors}
          onReload={onReloadAdvisors}
          onClose={() => setShowAdvisorMgmt(false)}
          isSuperAdmin={isSuperAdmin}
          theme={T}
        />
      )}

      {/* מודל יבוא לידים */}
      {showImport && (
        <ImportLeadsModal
          theme={T}
          onClose={() => setShowImport(false)}
          onImport={async (leads) => {
            const count = await handleImportLeads(leads);
            // הצלחה — סגור מודל, הצג טוסט, ה-state כבר רוענן בתוך handleImportLeads
            setShowImport(false);
            setToast({ msg: `נקלטו בהצלחה ${count} לידים חדשים`, type: "success" });
          }}
        />
      )}

      {/* מנהל תבניות ווטסאפ */}
      {showWaTemplates && (
        <WhatsAppTemplatesPanel
          templates={waTemplates}
          onSave={saveWaTemplates}
          onClose={() => setShowWaTemplates(false)}
          theme={T}
        />
      )}

      {/* מנהל שלבי מכירות — אדמין בלבד */}
      {showStageManager && isAdmin && (
        <PipelineStageManager
          stages={pipelineStages}
          onAdd={addStage}
          onUpdate={updateStage}
          onDelete={deleteStage}
          onReorder={reorderStage}
          onClose={() => setShowStageManager(false)}
          theme={T}
        />
      )}

      {/* טוסט הודעה */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
          zIndex:1100, display:"flex", alignItems:"center", gap:9,
          background: toast.type === "success" ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "linear-gradient(135deg,#c03030,#e04444)",
          color:"#fff", padding:"12px 22px", borderRadius:10,
          fontSize:13.5, fontWeight:800, boxShadow:"0 8px 30px rgba(0,0,0,.4)",
          maxWidth:"90vw",
        }}>
          <span style={{ fontSize:16 }}>{toast.type === "success" ? "✅" : "⚠️"}</span>
          {toast.msg}
        </div>
      )}

      {/* לוח שנה כללי */}
      {showCalendar && (
        <CalendarView
          clients={advisorScoped}
          onClose={() => setShowCalendar(false)}
          onOpenClient={(c) => setActiveClient(c)}
          onToggleComplete={(client, ev) => {
            // משימת לוח שנה מתוך ה-timeline
            if (ev.tlIndex !== undefined && ev.tlIndex !== null) {
              let nextTl = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const tl = Array.isArray(c.timeline) ? c.timeline : [];
                nextTl = tl.map((e,i) => i === ev.tlIndex ? { ...e, completed: !e.completed } : e);
                return { ...c, timeline: nextTl };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextTl) ? { ...prev, timeline: nextTl } : prev);
              if (supabase && nextTl) {
                supabase.from("clients").update({ timeline: nextTl }).eq("id", client.id)
                  .then(({ error }) => { if (error) console.error("שגיאה בשמירת סטטוס:", error.message); });
              }
              return;
            }
            // טיפול באירועים מותאמים (custom) — signing/final הוסרו (ראה הערה למעלה)
            if (ev.type === "custom") {
              let nextArr = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                nextArr = evList.map(x => x.id === ev.id ? { ...x, completed: !x.completed } : x);
                return { ...c, custom_calendar_events: nextArr };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
              if (supabase && nextArr) {
                supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                  .then(({ error }) => { if (error) { console.error("שגיאה בשמירת סטטוס:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
              }
            }
          }}
          onReorder={(client, orderedIds) => {
            let nextArr = null;
            setClients(prev => prev.map(c => {
              if (c.id !== client.id) return c;
              const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
              const byId = Object.fromEntries(evList.map(ev => [ev.id, ev]));
              const reordered = orderedIds.map(id => byId[id]).filter(Boolean);
              const untouched = evList.filter(ev => !orderedIds.includes(ev.id));
              nextArr = [...reordered, ...untouched];
              return { ...c, custom_calendar_events: nextArr };
            }));
            setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
            if (supabase && nextArr) {
              supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                .then(({ error }) => { if (error) { console.error("שגיאה בשמירת סדר:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
            }
          }}
          onSaveNote={(client, ev, noteText) => {
            if (ev.type === "custom") {
              let nextArr = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                nextArr = evList.map(x => x.id === ev.id ? { ...x, notes: noteText } : x);
                return { ...c, custom_calendar_events: nextArr };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
              if (supabase && nextArr) {
                supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                  .then(({ error }) => { if (error) { console.error("שגיאה בשמירת הערה:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
              }
            }
          }}
          onReschedule={(client, ev, newDate) => {
            // משימת לוח שנה מתוך ה-timeline — עדכן task_date
            if (ev.tlIndex !== undefined && ev.tlIndex !== null) {
              let nextTl = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const tl = Array.isArray(c.timeline) ? c.timeline : [];
                nextTl = tl.map((e,i) => i === ev.tlIndex ? { ...e, task_date: newDate } : e);
                return { ...c, timeline: nextTl };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextTl) ? { ...prev, timeline: nextTl } : prev);
              if (supabase && nextTl) {
                supabase.from("clients").update({ timeline: nextTl }).eq("id", client.id)
                  .then(({ error }) => { if (error) console.error("שגיאה בשינוי תאריך:", error.message); });
              }
              return;
            }
            if (ev.type === "custom") {
              let nextArr = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                nextArr = evList.map(x => x.id === ev.id ? { ...x, date: newDate } : x);
                return { ...c, custom_calendar_events: nextArr };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
              if (supabase && nextArr) {
                supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                  .then(({ error }) => { if (error) { console.error("שגיאה בשינוי תאריך:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
              }
            }
          }}
          onSwapDay={(items) => {
            // items: [{ ev, order }] — כל אירועי היום עם הסדר החדש (כולם type==="custom" כעת)
            // קבץ את העדכונים לפי לקוח (מניעת race: עדכון אחד לכל לקוח)
            const patchByClient = {}; // clientId -> { custom:{id:order} }
            items.forEach(({ ev, order }) => {
              const cid = ev.client?.id; if (!cid) return;
              patchByClient[cid] = patchByClient[cid] || { custom:{} };
              if (ev.type === "custom") patchByClient[cid].custom[ev.id] = order;
            });

            Object.entries(patchByClient).forEach(([cid, patch]) => {
              const dbUpdates = []; // אוסף עדכוני DB נפרדים (כדי שעמודה חסרה לא תפיל את כולם)
              setClients(prev => prev.map(c => {
                if (c.id !== cid) return c;
                const upd = { ...c };
                if (Object.keys(patch.custom).length) {
                  const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                  const nextArr = evList.map(x => (x.id in patch.custom) ? { ...x, day_order: patch.custom[x.id] } : x);
                  upd.custom_calendar_events = nextArr;
                  dbUpdates.push({ custom_calendar_events: nextArr });
                }
                return upd;
              }));
              setActiveClient(prev => {
                if (!prev || prev.id !== cid) return prev;
                const merged = { ...prev };
                dbUpdates.forEach(u => Object.assign(merged, u));
                return merged;
              });
              if (supabase) {
                dbUpdates.forEach(u => {
                  supabase.from("clients").update(u).eq("id", cid)
                    .then(({ error }) => { if (error) console.error("שגיאה בשמירת סדר:", error.message); });
                });
              }
            });
          }}
          theme={T}
        />
      )}

      {/* הודעת "הוגדר כברירת מחדל" */}
      <div id="set-default-flash" style={{
        display:"none",
        position:"fixed", bottom:28, right:"50%", transform:"translateX(50%)",
        background:"linear-gradient(135deg,#1a4a28,#0d3020)",
        border:"1px solid #3dba7e88",
        color:"#3dba7e", borderRadius:10, padding:"12px 24px",
        fontSize:13, fontWeight:800, zIndex:2000,
        boxShadow:"0 8px 32px #0009",
        animation:"fadeUp .2s ease",
      }}>
        ⭐ ההגדרות נשמרו כברירת מחדל
      </div>
    
    </>
  );
}  // סוף MainDashboard

/* ─── CRMApp — שומר שער (Auth בלבד) ────────────────────────────────────────
   רכיב זה אחראי אך ורק על מצב ה-Auth.
   הוא מציג: טעינה / מסך כניסה / MainDashboard לפי מצב ה-session.
   כל ה-hooks של CRM נמצאים ב-MainDashboard — אין hooks לאחר return מותנה.
   ────────────────────────────────────────────────────────────────────────── */
function CRMApp() {
  const [authSession, setAuthSession] = useState(undefined); // undefined=בודק | null=לא מחובר | object=מחובר
  const [userRole,    setUserRole]    = useState(null);
  const [advisors,    setAdvisors]    = useState(ADVISORS_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    // טען את רשימת היועצים, ואז קבע session + תפקיד
    fetchAdvisors().then(list => {
      if (cancelled) return;
      setAdvisors(list);

      supabase?.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        setAuthSession(session ?? null);
        setUserRole(session ? getUserRole(session.user, list) : null);
      });

      const { data: sub } = supabase?.auth.onAuthStateChange((_e, session) => {
        setAuthSession(session ?? null);
        setUserRole(session ? getUserRole(session.user, list) : null);
      }) ?? {};
      cancelled && sub?.subscription?.unsubscribe();
    });
    return () => { cancelled = true; };
  }, []);

  // רענון רשימת היועצים (נקרא מפאנל הניהול — חשוב: חייב לרענן גם תפקיד,
  // כי promote/demote לאדמין משנה את advisors.role, שהוא מקור האמת ל-getUserRole)
  const reloadAdvisors = async () => {
    const list = await fetchAdvisors();
    setAdvisors(list);
    if (authSession) setUserRole(getUserRole(authSession.user, list));
  };

  const handleLogout = async () => { await supabase?.auth.signOut(); };

  // ── טעינה (בודק session) ──
  if (authSession === undefined) return (
    <div style={{
      minHeight:"100vh", background:"#f0eeff",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Heebo',sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{
          width:48, height:48, borderRadius:12,
          background:"linear-gradient(135deg,#7c6fcd,#2d88d4)",
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontWeight:900, fontSize:22, color:"#fff", marginBottom:14,
          animation:"spin 1.8s linear infinite",
        }}>O</div>
        <div style={{ color:"#8080b0", fontSize:13 }}>טוען…</div>
      </div>
    </div>
  );

  // ── אין session → מסך כניסה ──
  if (!authSession) return <LoginScreen />;

  // ── יש session → Dashboard ──
  return <MainDashboard
    userRole={userRole}
    userEmail={authSession.user?.email || ""}
    advisors={advisors}
    onReloadAdvisors={reloadAdvisors}
    onLogout={handleLogout}
  />;
}

export default CRMApp;