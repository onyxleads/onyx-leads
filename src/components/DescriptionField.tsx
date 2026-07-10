import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/* ─── DescriptionField — תיאור התיק עם נעילה/עריכה ושמירה ישירה ל-Supabase ── */
export function DescriptionField({ value, onChange, readOnly:_readOnly, clientId, theme:TH={}, DB, DC, DBR, DT, DS, DI, ACCENT }) {
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

