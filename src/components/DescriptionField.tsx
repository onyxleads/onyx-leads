import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { supabase } from "../lib/supabase";

/* ─── מודל אישור קטן — "בטוח שלא לשמור?" ── משותף גם ל-TimelineDrawer (סגירת כרטיסייה) ── */
export function UnsavedChangesModal({ message="השארת שינויים שלא נשמרו. לשמור אותם?", onSave, onDiscard }) {
  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => e.stopPropagation()}
    >
      <div dir="rtl" style={{
        background:"#181830", border:"1px solid #3a3a60", borderRadius:14,
        padding:"22px 24px", maxWidth:340, width:"90%",
        boxShadow:"0 20px 60px #000a",
      }}>
        <div style={{ fontSize:15, fontWeight:800, color:"#e0e0f8", marginBottom:18, lineHeight:1.5 }}>
          {message}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button
            onClick={onSave}
            style={{
              flex:1, background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
              color:"#fff", border:"none", borderRadius:8,
              padding:"9px 14px", fontSize:13, fontWeight:800, cursor:"pointer",
            }}
          >💾 שמור</button>
          <button
            onClick={onDiscard}
            style={{
              flex:1, background:"transparent", color:"#c04444",
              border:"1px solid #c0444466", borderRadius:8,
              padding:"9px 14px", fontSize:13, fontWeight:700, cursor:"pointer",
            }}
          >אל תשמור</button>
        </div>
      </div>
    </div>
  );
}

/* ─── DescriptionField — תיאור התיק עם נעילה/עריכה ושמירה ישירה ל-Supabase ──
   תומך גם בזיהוי שינויים שלא נשמרו: אם עוזבים את התיבה (blur מחוץ לקוביה כולה)
   כשיש טיוטה שלא נשמרה — מוצג אישור "לשמור / אל תשמור" לפני שהעריכה ננטשת.
   חשוף גם ref עם save()/discard()/hasUnsavedChanges() כדי ש-TimelineDrawer יוכל
   לבדוק ולפעול בהתאם גם כשסוגרים את כל הכרטיסייה (לא רק יציאה מהתיבה עצמה). ── */
export const DescriptionField = forwardRef(function DescriptionField(
  { value, onChange, readOnly:_readOnly, clientId, theme:TH={}, DB, DC, DBR, DT, DS, DI, ACCENT, onDirtyChange },
  ref
) {
  const readOnly = false; // תיאור התיק — פתוח לעריכה לכל המשתמשים (יועץ + מתפעל)
  const isLight = TH.name === "Light Mode";
  const txtColor = isLight ? "#1a1a3a" : (DT || "#e0e0f8");
  const [locked, setLocked] = useState(() => !!value);
  const [draft,  setDraft]  = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [flash,  setFlash]  = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const containerRef = useRef(null);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    setDraft(value || "");
    setLocked(!!value);
  }, [value]);

  const isDirty = !readOnly && !locked && draft !== (value || "");

  useEffect(() => {
    onDirtyChange && onDirtyChange(isDirty);
  }, [isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const discard = () => {
    setDraft(value || "");
    setLocked(true);
  };

  /* חשיפה כלפי חוץ (TimelineDrawer) — לבדיקה/פעולה כשסוגרים את כל הכרטיסייה */
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => isDirty,
    save: handleSave,
    discard,
  }));

  /* יציאה מהתיבה עצמה (לא מהכרטיסייה כולה) — בדיקה אם המיקוד עזב את כל הקומפוננטה */
  const handleContainerBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      if (isDirty && containerRef.current && !containerRef.current.contains(document.activeElement)) {
        setShowUnsavedPrompt(true);
      }
    }, 100);
  };

  const isLocked = readOnly || locked;
  const cardBg   = isLight ? "#f8faff" : "#0a1220";

  return (
    <div
      ref={containerRef}
      onBlur={handleContainerBlur}
      style={{
        marginTop:36,
        background: DC,
        border:`1px solid ${DBR}`,
        borderRadius:12, overflow:"hidden",
        position:"relative",
      }}
    >
      {/* כותרת */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"12px 16px", borderBottom:`1px solid ${DBR}`,
        background: isLight ? "linear-gradient(135deg,#eef4ff,#f4f0ff)" : "linear-gradient(135deg,#13182e,#0e1020)",
      }}>
        <span style={{ fontSize:14, fontWeight:900, color:ACCENT, display:"flex", alignItems:"center", gap:7 }}>
          📋 תיאור כללי
        </span>
        {!readOnly && (
          locked ? (
            <button
              onClick={() => setLocked(false)}
              style={{
                background:"transparent", border:`1px solid ${ACCENT}66`,
                color:ACCENT, borderRadius:6, padding:"4px 14px",
                fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background=ACCENT; e.currentTarget.style.color="#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=ACCENT; }}
            >ערוך</button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving ? "#888" : ACCENT,
                border:"none", color:"#fff",
                borderRadius:6, padding:"4px 14px",
                fontSize:11, fontWeight:700, cursor: saving ? "default" : "pointer",
              }}
            >{saving ? "שומר…" : "שמור"}</button>
          )
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
            {readOnly ? "לא הוזן תיאור" : "אין תיאור עדיין — לחץ על \"ערוך\" להוספה"}
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
      </div>

      {showUnsavedPrompt && (
        <UnsavedChangesModal
          message="בטוח שלא לשמור את מה שרשמת בתיאור הכללי?"
          onSave={() => { handleSave(); setShowUnsavedPrompt(false); }}
          onDiscard={() => { discard(); setShowUnsavedPrompt(false); }}
        />
      )}
    </div>
  );
});
