import { useState, useRef, useEffect } from "react";
import { PRESETS } from "../lib/theme";

/* ─── פאנל בחירת צבעים ───────────────────────────────────────────────────── */
export function ColorPickerPanel({ theme, onThemeChange, onClose, phases, onPhasesChange }) {
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



