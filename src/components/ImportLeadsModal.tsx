import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { MainDashboard } from "./MainDashboard";
import { todayStr2 } from "../lib/utils";

/* ─── מודל יבוא לידים מקובץ Excel/CSV ──────────────────────────────────────
   ממפה כותרות בעברית או אנגלית בצורה גמישה לשדות הלקוח. הפרסור מתבצע בצד
   הלקוח (XLSX / PapaParse). המודל רק מפרסר וממפה — ההטבעה של advisor_email
   ושלב "לידים חדשים" + ה-insert עצמו מתבצעים ב-MainDashboard (onImport),
   כדי שכל לוגיקת ה-RLS והשיוך תהיה במקום אחד מרכזי.
   ──────────────────────────────────────────────────────────────────────── */

// ── שדות היעד של Onyx Leads שאליהם ממפים עמודות מהקובץ ──
// order = סדר התצוגה באשף. required = שדה חובה. numeric = יומר ל-null אם ריק/לא-תקין.
export const IMPORT_TARGET_FIELDS = [
  { key:"first_name",  label:"שם פרטי",    required:true,  match:["שם פרטי","first name","firstname","שם"] },
  { key:"last_name",   label:"שם משפחה",   required:false, match:["שם משפחה","last name","lastname","משפחה"] },
  { key:"phone",       label:"טלפון",      required:false, match:["טלפון","נייד","סלולרי","פלאפון","phone","mobile","tel"] },
  { key:"email",       label:"אימייל",     required:false, match:["אימייל","מייל","email","e-mail","mail"] },
  { key:"description", label:"תיאור כללי", required:false, match:["תיאור","הערות","description","notes","comment"] },
];

// שדות מספריים — לסניטציה (ריק/לא-תקין → null) בעת היבוא
export const IMPORT_NUMERIC_FIELDS = IMPORT_TARGET_FIELDS.filter(f => f.numeric).map(f => f.key);

// נרמול מחרוזת להשוואה (trim + lowercase)
export const normHeader = (h) => String(h ?? "").trim().toLowerCase();

// היוריסטיקת התאמה: בהינתן רשימת כותרות מהקובץ, מנסה לנחש לכל שדה יעד את
// אינדקס העמודה המתאימה (לפי הכלה של אחת ממילות ה-match). מחזיר { fieldKey: headerIndex }.
export function autoMatchHeaders(headers) {
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

export function ImportLeadsModal({ onClose, onImport, advisors=[], theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const [step,     setStep]     = useState("upload"); // "upload" | "map"
  const [dragOver, setDragOver] = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [fileName, setFileName] = useState("");
  const [headers,  setHeaders]  = useState([]);   // כותרות הקובץ (שורה ראשונה)
  const [matrix,   setMatrix]   = useState([]);   // כל השורות (כולל כותרות)
  const [mapping,  setMapping]  = useState({});   // { fieldKey: headerIndex | "" }
  // ── שני ערכים ברמת כל האצווה (לא ממופים מהקובץ, נבחרים פעם אחת לכל היבוא) ──
  const [batchCreatedDate, setBatchCreatedDate] = useState(todayStr2());
  const [batchAdvisorEmail, setBatchAdvisorEmail] = useState("");
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
    setBatchCreatedDate(todayStr2()); setBatchAdvisorEmail("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── שלב 4: ביצוע — קריאת כל השורות לפי המיפוי שנבחר, ושליחה ל-onImport ──
  const finishImport = async () => {
    setError("");
    // ולידציה: שם פרטי הוא חובה
    if (mapping.first_name === "" || mapping.first_name === undefined) {
      setError('חובה למפות עמודה לשדה "שם פרטי".');
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
      const firstName = valAt(row, "first_name");
      if (!firstName) continue; // דלג על שורות ללא שם פרטי
      // בנה את אובייקט הליד דינמית מכל שדות היעד הממופים
      const lead = {};
      IMPORT_TARGET_FIELDS.forEach(f => { lead[f.key] = valAt(row, f.key); });
      // ערכי האצווה — זהים לכל השורות ביבוא הזה (נבחרו פעם אחת בראש האשף)
      lead.lead_created_date = batchCreatedDate;
      if (batchAdvisorEmail) lead.advisor_email = batchAdvisorEmail;
      leads.push(lead);
    }
    if (leads.length === 0) {
      setError("לא נמצאו שורות תקינות (כל שורה חייבת ערך בעמודת שם פרטי).");
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
                מהקובץ לשדה המתאים ב-Onyx Leads — לא חובה שהכותרות יהיו בשם מסוים.
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
                התאם כל שדה ב-Onyx Leads (מימין) לעמודה מהקובץ שלך (משמאל). התאמות שזוהו
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

              {/* ── ערכי אצווה — זהים לכל הלידים ביבוא הזה (לא ממופים מהקובץ) ── */}
              <div style={{
                background:cardBg, border:`1px solid ${bdr}`, borderRadius:9,
                padding:"12px 13px", marginBottom:16,
              }}>
                <div style={{ fontSize:11, fontWeight:800, color:txt, marginBottom:10 }}>
                  ⚙️ הגדרות ליבוא הזה (חלות על כל הלידים המיובאים)
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {/* תאריך שנוצר הליד */}
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:"0 0 38%", fontSize:13, fontWeight:700, color:txt }}>📅 תאריך שנוצר הליד</div>
                    <input
                      type="date"
                      value={batchCreatedDate}
                      onChange={e => setBatchCreatedDate(e.target.value)}
                      dir="rtl"
                      style={{
                        flex:1, minWidth:0, background:inputBg, border:`1px solid ${bdr}`,
                        borderRadius:7, color:txt, padding:"8px 10px", fontSize:12.5,
                        outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    />
                  </div>
                  {/* משוייך לסוכן */}
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:"0 0 38%", fontSize:13, fontWeight:700, color:txt }}>👤 משוייך לסוכן</div>
                    <select
                      value={batchAdvisorEmail}
                      onChange={e => setBatchAdvisorEmail(e.target.value)}
                      dir="rtl"
                      style={{
                        flex:1, minWidth:0, background:inputBg, border:`1px solid ${bdr}`,
                        borderRadius:7, color:txt, padding:"8px 10px", fontSize:12.5,
                        outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    >
                      <option value="">— ברירת מחדל —</option>
                      {advisors.map(a => (
                        <option key={a.email} value={a.email}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
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

