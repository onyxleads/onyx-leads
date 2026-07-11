import { useState, useRef } from "react";
import { DescriptionField, UnsavedChangesModal } from "./DescriptionField";
import { DropboxField } from "./DropboxField";
import { PairFields } from "./PairFields";
import { SecuritiesCard } from "./SecuritiesCard";
import { TimelineEntries } from "./TimelineEntries";
import { WhatsAppCard } from "./WhatsAppCard";
import { BriefcaseIcon, WhatsAppIcon } from "./columns";
import { PHASES } from "../lib/constants";
import { lbl, splitName, toWhatsAppPhone, todayStr2 } from "../lib/utils";

/* ─── מגירת לוח זמנים + עריכת פרטים מלאה ───────────────────────────────── */
export function TimelineDrawer({ client, onClose, onAddNote, onUpdate, onNotesUpdate, onDelete, onDuplicate, readOnly=false, isAdmin=false, advisors=[], waTemplates=[], myName="", phases=null, theme:TH={}, fontSizes={} }) {
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

  // ── מצב עריכה עצמאי לקוביית "פרטי הליד" (שם + סוג התיק + טלפונים + אימיילים) ──
  const [leadEditing, setLeadEditing] = useState(false);
  const [leadDraft,    setLeadDraft]  = useState(null);
  const [leadFlash,    setLeadFlash]  = useState(false);

  // ── מצב עריכה עצמאי לקוביית "שכר טרחה" ──
  const [feeEditing, setFeeEditing] = useState(false);
  const [feeFlash,   setFeeFlash]   = useState(false);

  // ── מצב עריכה עצמאי לקוביית "פרטי הנכס למשכון" ──
  const [propEditing, setPropEditing] = useState(false);
  const [propFlash,   setPropFlash]   = useState(false);

  // ── מעקב אחר שינויים שלא נשמרו ב"תיאור כללי", כדי לשאול לפני סגירת כל הכרטיסייה ──
  const descRef = useRef(null);
  const [descDirty, setDescDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  /* בקשת סגירה — אם יש טיוטת תיאור שלא נשמרה, שואלים לפני שסוגרים בפועל */
  const requestClose = () => {
    if (descDirty) { setShowCloseConfirm(true); return; }
    onClose();
  };

  // ── עדכון טקסטואלי ──
  const [note, setNote] = useState("");

  /* פיצול שם קיים לשם פרטי/משפחה אם עדיין לא מפוצל (תאימות לאחור) */
  const nameSplit = (!(client.first_name||"").trim() && !(client.last_name||"").trim() && (client.name||"").trim())
    ? splitName(client.name) : { first_name: client.first_name||"", last_name: client.last_name||"" };

  /* ── "פרטי הליד" — עריכה עצמאית של שם + סוג התיק + טלפונים + אימיילים ── */
  const startLeadEdit = () => {
    if (readOnly) return;
    setLeadDraft({
      first_name: nameSplit.first_name,
      last_name:  nameSplit.last_name,
      lead_created_date: client.lead_created_date || todayStr2(),
      case_type:  client.case_type || "",
      phones:      client.phones?.length ? client.phones.map(p=>({...p})) : [{ number:"", ownerName:"" }],
      emails_list: client.emails_list?.length ? client.emails_list.map(e=>({...e})) : [{ name:"", email:"" }],
    });
    setLeadEditing(true);
  };
  const commitLeadEdit = () => {
    try {
      if (!client?.id) { alert("שגיאה: מזהה לקוח חסר"); return; }
      const fn = (leadDraft.first_name || "").trim();
      const ln = (leadDraft.last_name  || "").trim();
      const patch = {
        first_name: fn,
        last_name:  ln,
        name:      [fn, ln].filter(Boolean).join(" ") || client.name,
        lead_created_date: leadDraft.lead_created_date || null,
        case_type: (leadDraft.case_type || "").trim(),
        phones:      (leadDraft.phones      || []).filter(p => (p?.number||"").trim()),
        emails_list: (leadDraft.emails_list  || []).filter(e => (e?.email ||"").trim()),
      };
      if (typeof onUpdate === "function") onUpdate(client.id, patch);
      setLeadEditing(false);
      setLeadFlash(true);
      setTimeout(() => setLeadFlash(false), 1800);
    } catch(err) {
      console.error("שגיאה בשמירת פרטי ליד:", err);
      alert(`שגיאה בשמירת פרטי הליד:\n${err?.message || err}`);
    }
  };
  const cancelLeadEdit = () => setLeadEditing(false);
  const setLeadDraftField = (field, val) => setLeadDraft(d => ({ ...d, [field]: val }));

  /* ── "שכר טרחה" — טוגל תצוגה/עריכה. onNotesUpdate כבר שומר לכל הקשה,
     ה-toggle כאן רק שולט בנראות השדה (view text קבוע ↔ input חי). ── */
  const toggleFeeEdit = () => {
    if (readOnly) return;
    if (feeEditing) { setFeeFlash(true); setTimeout(() => setFeeFlash(false), 1800); }
    setFeeEditing(v => !v);
  };

  /* ── "פרטי הנכס למשכון" — אותו טוגל תצוגה/עריכה, שומר ישירות דרך onNotesUpdate ── */
  const togglePropEdit = () => {
    if (readOnly) return;
    if (propEditing) { setPropFlash(true); setTimeout(() => setPropFlash(false), 1800); }
    setPropEditing(v => !v);
  };

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

  /* תצוגת זוגות (view mode). isPhone=true מוסיף כפתור WhatsApp מהיר לצד כל מספר. */
  const renderPairs = (pairs=[], isPhone=false) =>
    (pairs.length===0) ? <span style={{ color:DS }}>—</span> :
    pairs.map((p,i) => (
      <div key={i} style={{ marginBottom:4, display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
        <span style={{ color:DT, fontSize:dtSize }}>{p.number||"—"}</span>
        {p.ownerName && (
          <span style={{ color:DS, fontSize:dsSize }}>({p.ownerName})</span>
        )}
        {isPhone && p.number && (
          <a
            href={`https://wa.me/${toWhatsAppPhone(p.number)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="שלח הודעת WhatsApp מהירה"
            onClick={e => e.stopPropagation()}
            style={{ display:"inline-flex", flexShrink:0 }}
          >
            <WhatsAppIcon size={16} />
          </a>
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
    }} onClick={e => e.target===e.currentTarget && requestClose()}>
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
        }}>כרטיסיית ליד</div>

        {/* ── כותרת + כפתורים ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
            {readOnly && (
              <span style={{
                background:"#e8a83822", color:"#b07818",
                border:"1px solid #e8a83866",
                borderRadius:6, padding:"4px 10px",
                fontSize:11, fontWeight:700,
              }}>👁️ צפייה בלבד</span>
            )}
            <button onClick={requestClose} style={{
              background:"none", border:"none", color:DS, fontSize:22, cursor:"pointer",
            }}>✕</button>
          </div>
        </div>

        {/* ══════════════════════════ פרטי הליד ══════════════════════════ */}
        <div style={sectionBox}>
            {/* כותרת "פרטי הליד" + כפתור ערוך/שמור עצמאי לקוביה הזו בלבד */}
            <div style={{
              background: TH.name==="Light Mode" ? "linear-gradient(135deg,#e8f6f6,#d8f0f0)" : "linear-gradient(135deg,#0a2424,#0d1f1f)",
              borderBottom:`1px solid #1a8a8a55`,
              padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:9,
              margin:"-16px -16px 14px", borderRadius:"10px 10px 0 0",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <span style={{ fontSize:16 }}>👤</span>
                <span style={{ fontSize:13, fontWeight:900, color:"#1a8a8a", letterSpacing:.5, textTransform:"uppercase" }}>פרטי הליד</span>
                {leadFlash && (
                  <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700, animation:"fadeUp .2s ease" }}>✓ נשמר בהצלחה</span>
                )}
              </div>
              {!readOnly && (
                leadEditing ? (
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={commitLeadEdit} style={{
                      background:"#1a8a8a", border:"none", color:"#fff",
                      borderRadius:6, padding:"4px 14px", fontSize:11, fontWeight:800, cursor:"pointer",
                    }}>שמור</button>
                    <button onClick={cancelLeadEdit} style={{
                      background:"transparent", border:`1px solid #1a8a8a66`, color:"#1a8a8a",
                      borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, cursor:"pointer",
                    }}>ביטול</button>
                  </div>
                ) : (
                  <button
                    onClick={startLeadEdit}
                    style={{
                      background:"transparent", border:`1px solid #1a8a8a66`,
                      color:"#1a8a8a", borderRadius:6, padding:"4px 12px",
                      fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background="#1a8a8a"; e.currentTarget.style.color="#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#1a8a8a"; }}
                  >ערוך</button>
                )
              )}
            </div>

            {leadEditing ? (
              <>
                {/* שם פרטי (עריכה) */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>שם פרטי</span>
                  <input
                    value={leadDraft.first_name}
                    onChange={e => setLeadDraftField("first_name", e.target.value)}
                    placeholder="שם פרטי"
                    dir="rtl"
                    style={{
                      flex:1, fontSize:16, fontWeight:900, padding:"5px 10px",
                      background:DI, border:`1px solid ${phase.color}66`, color:DT,
                      borderRadius:6, outline:"none", minWidth:0,
                      boxSizing:"border-box", fontFamily:"inherit",
                    }}
                  />
                </div>
                {/* שם משפחה (עריכה) */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>שם משפחה</span>
                  <input
                    value={leadDraft.last_name}
                    onChange={e => setLeadDraftField("last_name", e.target.value)}
                    placeholder="שם משפחה"
                    dir="rtl"
                    style={{
                      flex:1, fontSize:16, fontWeight:900, padding:"5px 10px",
                      background:DI, border:`1px solid ${phase.color}66`, color:DT,
                      borderRadius:6, outline:"none", minWidth:0,
                      boxSizing:"border-box", fontFamily:"inherit",
                    }}
                  />
                </div>
                {/* תאריך שנוצר הליד (עריכה) */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>📅 תאריך שנוצר הליד</span>
                  <input
                    type="date"
                    value={leadDraft.lead_created_date || ""}
                    onChange={e => setLeadDraftField("lead_created_date", e.target.value)}
                    dir="rtl"
                    style={{
                      flex:1, fontSize:14, fontWeight:700, padding:"5px 10px",
                      background:DI, border:`1px solid ${phase.color}66`, color:DT,
                      borderRadius:6, outline:"none", minWidth:0,
                      boxSizing:"border-box", fontFamily:"inherit", cursor:"pointer",
                    }}
                  />
                </div>
                {/* סוג התיק (עריכה) */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}><BriefcaseIcon size={13} color={DS} /> סוג התיק</span>
                  <input
                    value={leadDraft.case_type || ""}
                    onChange={e => setLeadDraftField("case_type", e.target.value)}
                    placeholder="מחזור / רכישה מקבלן / רכישה יד שנייה…"
                    dir="rtl"
                    style={{
                      flex:1, fontSize:14, fontWeight:700, padding:"5px 10px",
                      background:DI, border:`1px solid ${phase.color}66`, color:DT,
                      borderRadius:6, outline:"none", minWidth:0,
                      boxSizing:"border-box", fontFamily:"inherit",
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* שם פרטי */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>שם פרטי</span>
                  <span style={fieldValue}>{nameSplit.first_name || <span style={{ color:DS }}>—</span>}</span>
                </div>
                {/* שם משפחה */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>שם משפחה</span>
                  <span style={fieldValue}>{nameSplit.last_name || <span style={{ color:DS }}>—</span>}</span>
                </div>
                {/* תאריך שנוצר הליד */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>📅 תאריך שנוצר הליד</span>
                  <span style={fieldValue}>
                    {client.lead_created_date
                      ? client.lead_created_date.split("-").reverse().join("/")
                      : <span style={{ color:DS }}>—</span>}
                  </span>
                </div>
                {/* סוג התיק */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}><BriefcaseIcon size={13} color={DS} /> סוג התיק</span>
                  <span style={fieldValue}>{client.case_type || <span style={{ color:DS }}>—</span>}</span>
                </div>
              </>
            )}

            {/* שלב התיק — תצוגה בלבד (שינוי שלב נעשה מלוח הלידים) */}
            <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
              <span style={fieldLabel}>📍 שלב התיק</span>
              <span style={{ ...fieldValue, color:phase.color, fontWeight:800 }}>{phase.label}</span>
            </div>

            {/* שיוך לסוכן — נגיש לעריכה רק לאדמין/סופר-אדמין. תחת ה-RLS המעודכן,
                is_admin_or_super() מורשה במפורש לכתוב כל ערך advisor_email (כולל
                "לידים ולקוחות למיון" בעת הסרת סוכן) — לכן זה בטוח להציג ולערוך כאן
                רק כש-isAdmin===true. איש מכירות לא רואה את הבורר הזה כלל.
                שים לב: שיוך הסוכן תמיד פעיל, ללא תלות בטוגל ערוך/שמור של הקוביה. */}
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

            {leadEditing ? (
              <>
                {/* ── טלפונים (עריכה) ── */}
                <div style={{ padding:"12px 0", borderBottom:`1px solid ${DBR}` }}>
                  <label style={{ ...lbl, fontSize:12, marginBottom:8, color:DS }}>📱 מספרי טלפון</label>
                  <PairFields
                    pairs={leadDraft.phones}
                    onChange={v => setLeadDraftField("phones", v)}
                    numPlaceholder="05X-XXXXXXX"
                    namePlaceholder="שם בעל הטלפון"
                    addLabel="+ הוסף מספר"
                    inputBg={DI} inputBdr={DBR} inputColor={DT}
                  />
                </div>
                {/* ── אימייל (עריכה) ── */}
                <div style={{ padding:"12px 0" }}>
                  <label style={{ ...lbl, fontSize:12, marginBottom:8, color:DS }}>✉️ אימייל</label>
                  <PairFields
                    pairs={leadDraft.emails_list}
                    onChange={v => setLeadDraftField("emails_list", v)}
                    keyA="email" keyB="name" dirA="ltr"
                    numPlaceholder="client@email.com"
                    namePlaceholder="שם בעל האימייל"
                    addLabel="+ הוסף אימייל"
                    inputBg={DI} inputBdr={DBR} inputColor={DT}
                  />
                </div>
              </>
            ) : (
              <>
                {/* טלפונים */}
                <div style={{ ...fieldRow, borderBottom:`1px solid ${DBR}` }}>
                  <span style={fieldLabel}>📱 טלפון</span>
                  <div style={{ flex:1, textAlign:"right" }}>{renderPairs(client.phones, true)}</div>
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
              </>
            )}
          </div>

        {/* ══════════════════════════ צ'ק-ליסט ליד נכנס ══════════════════════════ */}
        <SecuritiesCard
          title="צ׳ק-ליסט ליד נכנס"
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

        {/* ══════════════════════════ תיאור התיק ══════════════════════════════ */}
        <DescriptionField
          ref={descRef}
          onDirtyChange={setDescDirty}
          value={client.description || ""}
          onChange={val => onNotesUpdate && onNotesUpdate(client.id, "description", val)}
          clientId={client.id}
          theme={TH}
          DB={DB} DC={DC} DBR={DBR} DT={DT} DS={DS} DI={DI}
          ACCENT={"#6c5ecf"}
        />

        {/* ══════════════════════════ פרטי הנכס למשכון ════════════════════════ */}
        {(() => {
          const isLight = TH.name === "Light Mode";
          const propColor = isLight ? "#1a1a3a" : (DT || "#e0e0f8");
          const PROP_ACCENT = "#3a8ac0";
          const propField = (key, label, placeholder, isTextarea=false) => (
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${DBR}` }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:DS, marginBottom:6 }}>{label}:</label>
              {(readOnly || !propEditing) ? (
                <div style={{ fontSize:14, fontWeight:700, color: client[key] ? propColor : DS, whiteSpace:"pre-wrap" }}>
                  {client[key] || "— לא הוזן —"}
                </div>
              ) : isTextarea ? (
                <textarea
                  value={client[key] || ""}
                  onChange={e => onNotesUpdate && onNotesUpdate(client.id, key, e.target.value)}
                  placeholder={placeholder}
                  dir="rtl"
                  rows={3}
                  style={{
                    width:"100%", boxSizing:"border-box", padding:"9px 11px",
                    background:DI, border:`1px solid ${DBR}`, borderRadius:8,
                    color:propColor, WebkitTextFillColor:propColor, opacity:1,
                    fontSize:13, lineHeight:1.6, outline:"none", fontFamily:"inherit", resize:"vertical",
                  }}
                  onFocus={e => e.target.style.borderColor=PROP_ACCENT}
                  onBlur={e => e.target.style.borderColor=DBR}
                />
              ) : (
                <input
                  type="text"
                  value={client[key] || ""}
                  onChange={e => onNotesUpdate && onNotesUpdate(client.id, key, e.target.value)}
                  placeholder={placeholder}
                  dir="rtl"
                  style={{
                    width:"100%", boxSizing:"border-box", padding:"9px 11px",
                    background:DI, border:`1px solid ${DBR}`, borderRadius:8,
                    color:propColor, WebkitTextFillColor:propColor, opacity:1,
                    fontSize:14, fontWeight:700, outline:"none", fontFamily:"inherit",
                  }}
                  onFocus={e => e.target.style.borderColor=PROP_ACCENT}
                  onBlur={e => e.target.style.borderColor=DBR}
                />
              )}
            </div>
          );
          return (
            <div style={{
              marginTop:36,
              background: DC,
              border:`1px solid ${DBR}`,
              borderRadius:12, overflow:"hidden",
            }}>
              {/* כותרת + כפתור ערוך/שמור עצמאי */}
              <div style={{
                padding:"12px 16px", borderBottom:`1px solid ${DBR}`,
                background: isLight ? "linear-gradient(135deg,#eaf4fc,#e2eefb)" : "linear-gradient(135deg,#0e1e2a,#0a1620)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <span style={{ fontSize:14, fontWeight:900, color:PROP_ACCENT, display:"flex", alignItems:"center", gap:7 }}>
                  🏠 פרטי הנכס למשכון
                  {propFlash && (
                    <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700, animation:"fadeUp .2s ease" }}>✓ נשמר בהצלחה</span>
                  )}
                </span>
                {!readOnly && (
                  <button
                    onClick={togglePropEdit}
                    style={{
                      background: propEditing ? PROP_ACCENT : "transparent",
                      border:`1px solid ${PROP_ACCENT}66`,
                      color: propEditing ? "#fff" : PROP_ACCENT,
                      borderRadius:6, padding:"4px 14px",
                      fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
                    }}
                  >{propEditing ? "שמור" : "ערוך"}</button>
                )}
              </div>
              {propField("mortgage_property_address",    "📍 כתובת",     "רחוב, מספר, עיר…")}
              {propField("mortgage_property_value",      "💰 שווי הנכס", "לדוגמה: 1,850,000 ₪")}
              {propField("mortgage_property_appraisal",  "📐 שמאות",     "פרטי שמאות / שם השמאי / סכום")}
              <div style={{ padding:"12px 16px" }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:DS, marginBottom:6 }}>📝 כללי:</label>
                {(readOnly || !propEditing) ? (
                  <div style={{ fontSize:13, color: client.mortgage_property_notes ? propColor : DS, whiteSpace:"pre-wrap", lineHeight:1.6 }}>
                    {client.mortgage_property_notes || "— לא הוזן —"}
                  </div>
                ) : (
                  <textarea
                    value={client.mortgage_property_notes || ""}
                    onChange={e => onNotesUpdate && onNotesUpdate(client.id, "mortgage_property_notes", e.target.value)}
                    placeholder="הערות כלליות על הנכס…"
                    dir="rtl"
                    rows={3}
                    style={{
                      width:"100%", boxSizing:"border-box", padding:"9px 11px",
                      background:DI, border:`1px solid ${DBR}`, borderRadius:8,
                      color:propColor, WebkitTextFillColor:propColor, opacity:1,
                      fontSize:13, lineHeight:1.6, outline:"none", fontFamily:"inherit", resize:"vertical",
                    }}
                    onFocus={e => e.target.style.borderColor=PROP_ACCENT}
                    onBlur={e => e.target.style.borderColor=DBR}
                  />
                )}
              </div>
            </div>
          );
        })()}

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
              {/* כותרת + כפתור ערוך/שמור עצמאי */}
              <div style={{
                padding:"12px 16px", borderBottom:`1px solid ${DBR}`,
                background: isLight ? "linear-gradient(135deg,#fffae8,#fff4e0)" : "linear-gradient(135deg,#2a2410,#1e1808)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <span style={{ fontSize:14, fontWeight:900, color:FEE_ACCENT, display:"flex", alignItems:"center", gap:7 }}>
                  💰 שכר טרחה
                  {feeFlash && (
                    <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700, animation:"fadeUp .2s ease" }}>✓ נשמר בהצלחה</span>
                  )}
                </span>
                {!readOnly && (
                  <button
                    onClick={toggleFeeEdit}
                    style={{
                      background: feeEditing ? FEE_ACCENT : "transparent",
                      border:`1px solid ${FEE_ACCENT}66`,
                      color: feeEditing ? "#fff" : FEE_ACCENT,
                      borderRadius:6, padding:"4px 14px",
                      fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
                    }}
                  >{feeEditing ? "שמור" : "ערוך"}</button>
                )}
              </div>
              {/* תוכן */}
              <div style={{ padding:"14px 16px" }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:DS, marginBottom:6 }}>שכ"ט מבוקש:</label>
                {(readOnly || !feeEditing) ? (
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
                    autoFocus
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

      {showCloseConfirm && (
        <UnsavedChangesModal
          message="בטוח שלא לשמור את מה שרשמת בתיאור הכללי?"
          onSave={() => {
            descRef.current?.save();
            setShowCloseConfirm(false);
            onClose();
          }}
          onDiscard={() => {
            descRef.current?.discard();
            setShowCloseConfirm(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
