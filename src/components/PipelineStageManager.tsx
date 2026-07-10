import { useState } from "react";

/* ─── PipelineStageManager — ניהול שלבי מכירות (אדמין בלבד) ─────────────────
   הוספה/עריכה/מחיקה/סידור/החלפת ארכיון. כל פעולה עוברת דרך ה-handlers ב-
   MainDashboard (שמכילים גם הגנת isAdmin וגם שמירה ל-pipeline_stages).
   ──────────────────────────────────────────────────────────────────────── */
export function PipelineStageManager({ stages, onAdd, onUpdate, onDelete, onReorder, onClose, theme:T={} }) {
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

