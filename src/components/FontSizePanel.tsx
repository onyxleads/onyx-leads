import { useState, useRef } from "react";
import { DEFAULT_FONT_SIZES, FONT_COLS } from "../lib/theme";

export function FontSizePanel({ sizes, onChange, onClose, theme:T={} }) {
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

