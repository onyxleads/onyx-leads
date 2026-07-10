import { useState } from "react";

/* ─── מנהל תבניות ווטסאפ — עריכת 5 תבניות גלובליות ───────────────────────── */
export function WhatsAppTemplatesPanel({ templates, onSave, onClose, theme:T={} }) {
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

