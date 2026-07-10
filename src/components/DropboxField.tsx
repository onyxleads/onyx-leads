import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/* ─── DropboxField — קישור לתיקיית מסמכי הלקוח ב-Dropbox ─────────────────────
   פתוח לעריכה לכל המשתמשים (יועץ + מתפעל).
   נשמר ב-Supabase בעמודת dropbox_url (text).
   ────────────────────────────────────────────────────────────────────────── */
export function DropboxField({ value, onChange, clientId, theme:TH={}, DC, DBR, DT, DS, DI }) {
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

