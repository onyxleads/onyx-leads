import { useState, useRef, useEffect } from "react";

/* ─── Dashboard — כל לוגיקת ה-CRM (hooks + UI) ─────────────────────────── */
/* ─── שדה הערה מהירה (inline, שמירה ב-onBlur, מתרחב אוטומטית) ─────────────── */
export function QuickNoteField({ initial, onSave, isLight, accent }) {
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

