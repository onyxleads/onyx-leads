import { useState } from "react";
import { ClientRow } from "./ClientRow";
import { InlineAddRow } from "./InlineAddRow";
import { td } from "./TimelineEntries";

/* ─── קבוצת שלב — מחזירה tbody בלבד לתוך הטבלה המאוחדת ──────────────────── */
export function PhaseGroupRows({ phase, clients, onOpen, onPhaseChange, onAddClient, theme:T={}, cols, widths, fontSizes={}, isFirst=false, onReorder, advisors=[], isAdmin=false, myName="", selectionPhase=null, selectedIds=new Set(), onToggleSelectionMode, onToggleSelectId, onSelectAll, selectionActive=false }) {
  const [open,      setOpen]      = useState(true);
  const [addingRow, setAddingRow] = useState(false);
  const [dragId,     setDragId]     = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // מצב בחירה פעיל עבור עמודה זו בלבד
  const selecting = selectionPhase === phase.id;
  const phaseIds  = clients.map(c => c.id);
  const selectedInPhase = phaseIds.filter(id => selectedIds.has(id)).length;
  const allSelected = phaseIds.length > 0 && selectedInPhase === phaseIds.length;

  // שינוי סדר בתוך הקבוצה — בונה את רשימת ה-ids המסודרת ושולח החוצה
  const handleReorder = (fromId, toId) => {
    if (!onReorder || !fromId || !toId || fromId === toId) return;
    const ids = clients.map(c => c.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onReorder(phase.id, next);
  };

  const handleSave = (c) => { onAddClient(c); setAddingRow(false); };

  const bg     = T.groupBg   || "#0f0f20";
  const border = T.border    || "#2a2a48";
  const textMain = T.textPrimary || "#d8d8f0";

  const numCols = cols.length + 1 + (selectionActive ? 1 : 0); // +1 color bar, +1 checkbox col when selection active anywhere

  return (
    <>
      {/* ── שורת כותרת קבוצה ── */}
      <tbody>
        <tr>
          <td colSpan={numCols} style={{ padding:0 }}>
            <div
              onClick={() => setOpen(o => !o)}
              style={{
                display:"flex", alignItems:"center", gap:10, padding:"10px 16px",
                background:bg, borderTop:`3px solid ${phase.color}`,
                cursor:"pointer", userSelect:"none",
              }}
            >
              <span style={{ color:phase.color, fontSize:12 }}>{open ? "▼" : "▶"}</span>
              <span style={{ width:12, height:12, borderRadius:3, background:phase.color, flexShrink:0 }} />
              <span style={{ fontSize:14, fontWeight:800, color:textMain }}>{phase.label}</span>
              <span style={{
                background:phase.dim, color:phase.color,
                borderRadius:12, padding:"1px 9px", fontSize:12, fontWeight:700, marginRight:4,
              }}>{clients.length}</span>
              {/* כפתור מצב בחירה מרובה — ליד מונה הפריטים */}
              {onToggleSelectionMode && clients.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelectionMode(phase.id); }}
                  title={selecting ? "בטל בחירה מרובה" : "בחירה מרובה"}
                  style={{
                    display:"inline-flex", alignItems:"center", gap:4,
                    background: selecting ? phase.color : "transparent",
                    color: selecting ? "#fff" : phase.color,
                    border:`1px solid ${phase.color}`, borderRadius:6,
                    padding:"2px 9px", fontSize:11, fontWeight:700,
                    cursor:"pointer", fontFamily:"inherit",
                  }}
                >{selecting ? "✕ סיום" : "☑ בחירה"}</button>
              )}
            </div>
          </td>
        </tr>
      </tbody>

      {/* ── שורת "בחר הכל" — רק במצב בחירה ── */}
      {open && selecting && clients.length > 0 && (
        <tbody>
          <tr>
            <td colSpan={numCols} style={{ padding:0, background:T.rowBg||"#0f0f22" }}>
              <label style={{
                display:"flex", alignItems:"center", gap:9, padding:"7px 18px",
                cursor:"pointer", fontSize:12.5, fontWeight:700, color:textMain,
                borderBottom:`1px solid ${border}`,
              }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(phaseIds, e.target.checked)}
                  style={{ width:16, height:16, cursor:"pointer", accentColor:phase.color }}
                />
                {allSelected ? "בטל סימון הכל" : "בחר הכל"}
                {selectedInPhase > 0 && (
                  <span style={{ color:phase.color, fontWeight:800 }}>· {selectedInPhase} נבחרו</span>
                )}
              </label>
            </td>
          </tr>
        </tbody>
      )}

      {/* ── שורות לקוחות ── */}
      {open && (
        <tbody>
          {clients.length === 0 && !addingRow && (
            <tr>
              <td colSpan={numCols} style={{ padding:"14px 16px", textAlign:"center", color:T.textSecondary||"#404060", fontSize:13 }}>
                אין לקוחות בשלב זה
              </td>
            </tr>
          )}

          {clients.map(c => (
            <ClientRow
              key={c.id}
              client={c}
              phase={phase}
              onOpen={onOpen}
              onPhaseChange={onPhaseChange}
              theme={T}
              cols={cols}
              widths={widths}
              fontSizes={fontSizes}
              onReorder={onReorder ? handleReorder : undefined}
              dragId={dragId}
              setDragId={setDragId}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              selecting={selecting}
              selectionActive={selectionActive}
              isSelected={selectedIds.has(c.id)}
              onToggleSelect={onToggleSelectId}
            />
          ))}

          {/* הוסף לקוח — רק בשלב הראשון ורק למתפעל */}
          {isFirst && onAddClient && addingRow && (
            <InlineAddRow
              phaseId={phase.id}
              onSave={handleSave}
              onCancel={() => setAddingRow(false)}
              theme={T}
              advisors={advisors}
              isAdmin={isAdmin}
              myName={myName}
            />
          )}

          {isFirst && onAddClient && !addingRow && (
            <tr>
              <td colSpan={numCols} style={{ padding:0, borderTop:`1px solid ${border}` }}>
                <div
                  onClick={() => setAddingRow(true)}
                  style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"9px 20px", color:T.textSecondary||"#50508a", fontSize:13,
                    cursor:"pointer", transition:"all .14s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background=bg; e.currentTarget.style.color=phase.color; }}
                  onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=T.textSecondary||"#50508a"; }}
                >
                  <span style={{
                    width:20, height:20, borderRadius:"50%",
                    border:"1.5px solid currentColor",
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    fontSize:15, lineHeight:1, flexShrink:0,
                  }}>+</span>
                  הוסף לקוח חדש
                </div>
              </td>
            </tr>
          )}
        </tbody>
      )}
    </>
  );
}

