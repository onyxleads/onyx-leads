import { useRef } from "react";
import { PhaseGroupRows } from "./PhaseGroupRows";
import { PHASES } from "../lib/constants";

/* ─── טבלה מאוחדת עם כותרת sticky ─────────────────────────────────────────── */
export function UnifiedTable({ grouped, onOpen, onPhaseChange, onAddClient, theme:T={}, cols, widths, colControls, fontSizes={}, onReorder, advisors=[], isAdmin=false, myName="", selectionPhase=null, selectedIds=new Set(), onToggleSelectionMode, onToggleSelectId, onSelectAll }) {
  const { startColDrag, endDrag, startResize, dragSrc, dragOver } = colControls;

  // סנכרון גלילה אופקית
  const headerScrollRef = useRef(null);
  const bodyScrollRef   = useRef(null);

  const syncFromBody   = () => { if (headerScrollRef.current && bodyScrollRef.current) headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft; };
  const syncFromHeader = () => { if (bodyScrollRef.current && headerScrollRef.current) bodyScrollRef.current.scrollLeft = headerScrollRef.current.scrollLeft; };

  const colHdr      = T.colHeader || "#60608a";
  const border      = T.border    || "#2a2a48";
  const hdrBg       = T.headerBg  || T.rowBg || "#0e0e20";
  const firstPhase  = grouped[0]?.phase || PHASES[0];
  const totalW      = cols.reduce((s,c) => s + (widths[c.key]||120), 4);
  const colHdrFSize = fontSizes.colHeader || 11;

  const renderHeaderRow = () => (
    <table style={{ borderCollapse:"collapse", tableLayout:"fixed", width:totalW + (selectionPhase ? 40 : 0), minWidth:totalW + (selectionPhase ? 40 : 0) }}>
      <colgroup>
        <col style={{ width:4 }} />
        {selectionPhase && <col style={{ width:40 }} />}
        {cols.map(col => <col key={col.key} style={{ width:widths[col.key] }} />)}
      </colgroup>
      <thead>
        <tr style={{ background:hdrBg }}>
          <th style={{ width:4, padding:0, background:hdrBg }} />
          {selectionPhase && <th style={{ width:40, padding:0, background:hdrBg }} />}
          {cols.map(col => {
            const isDragSrc  = dragSrc  === col.key;
            const isDragOver = dragOver === col.key;
            return (
              <th
                key={col.key}
                data-colkey={col.key}
                style={{
                  padding:"9px 16px 9px 8px",
                  fontSize:colHdrFSize, fontWeight:800,
                  color: isDragSrc ? firstPhase.color : (isDragOver ? T.textPrimary||"#fff" : colHdr),
                  textAlign:"right", letterSpacing:.5,
                  borderBottom:`2px solid ${firstPhase.color}55`,
                  borderLeft: isDragOver ? `2px solid ${firstPhase.color}` : "2px solid transparent",
                  userSelect:"none",
                  background: isDragSrc ? firstPhase.color+"22" : hdrBg,
                  transition:"background .12s, color .12s",
                  position:"relative",
                  width: widths[col.key], minWidth: widths[col.key], maxWidth: widths[col.key],
                  overflow:"hidden", whiteSpace:"nowrap",
                  touchAction:"none",
                }}
              >
                {/* ⠿ ידית גרירה — לחיצה/נגיעה מתחילה גרירה */}
                <span
                  onMouseDown={e => startColDrag(col.key, e)}
                  onTouchStart={e => startColDrag(col.key, e)}
                  style={{
                    display:"inline-block", opacity:.4, fontSize:13,
                    marginLeft:6, cursor:"grab", verticalAlign:"middle",
                    touchAction:"none", userSelect:"none",
                    padding:"0 2px",
                  }}
                  title="גרור לשינוי סדר עמודות"
                >⠿</span>
                {col.label}

                {/* ידית resize — שמאל ל-RTL, רחבה יותר לנייד */}
                <span
                  onMouseDown={e => {
                    const startX = e.clientX;
                    startResize(col.key, startX, widths[col.key], e);
                  }}
                  onTouchStart={e => {
                    const startX = e.touches[0].clientX;
                    startResize(col.key, startX, widths[col.key], e);
                  }}
                  onClick={e => e.stopPropagation()}
                  title="גרור להרחבת/כיווץ עמודה"
                  style={{
                    position:"absolute", left:0, top:0, bottom:0,
                    width:12,
                    cursor:"col-resize",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    zIndex:10, touchAction:"none",
                  }}
                >
                  <span style={{
                    width:3, height:18, borderRadius:2,
                    background: isDragOver ? firstPhase.color : border,
                    display:"block", transition:"background .12s, width .1s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background=firstPhase.color; e.currentTarget.style.width="4px"; }}
                    onMouseLeave={e => { e.currentTarget.style.background=border; e.currentTarget.style.width="3px"; }}
                  />
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
    </table>
  );

  return (
    <div style={{ position:"relative" }}>

      {/* ── כותרת נדבקת — overflow hidden, מסונכרנת עם גוף ── */}
      <div
        ref={headerScrollRef}
        onScroll={syncFromHeader}
        style={{
          position:"sticky", top:60, zIndex:150,
          overflowX:"auto", overflowY:"hidden",
          boxShadow:"0 3px 10px rgba(0,0,0,.18)",
          /* מסתיר את scrollbar של ה-header */
          scrollbarWidth:"none",
          msOverflowStyle:"none",
        }}
      >
        <style>{`.onyx-hdr::-webkit-scrollbar{display:none}`}</style>
        <div className="onyx-hdr" style={{ width:totalW, minWidth:totalW }}>
          {renderHeaderRow()}
        </div>
      </div>

      {/* ── גוף הטבלה — גולל אופקית ומסנכרן ── */}
      <div
        ref={bodyScrollRef}
        onScroll={syncFromBody}
        style={{ overflowX:"auto", overflowY:"visible" }}
      >
        <table style={{ borderCollapse:"collapse", tableLayout:"fixed", width:totalW + (selectionPhase ? 40 : 0), minWidth:totalW + (selectionPhase ? 40 : 0) }}>
          <colgroup>
            <col style={{ width:4 }} />
            {selectionPhase && <col style={{ width:40 }} />}
            {cols.map(col => <col key={col.key} style={{ width:widths[col.key] }} />)}
          </colgroup>
          {grouped.map(({ phase, clients:gc }, idx) => (
            <PhaseGroupRows
              key={phase.id}
              phase={phase}
              clients={gc}
              onOpen={onOpen}
              onPhaseChange={onPhaseChange}
              onAddClient={onAddClient}
              theme={T}
              cols={cols}
              widths={widths}
              fontSizes={fontSizes}
              isFirst={idx === 0}
              onReorder={onReorder}
              advisors={advisors}
              isAdmin={isAdmin}
              myName={myName}
              selectionPhase={selectionPhase}
              selectedIds={selectedIds}
              onToggleSelectionMode={onToggleSelectionMode}
              onToggleSelectId={onToggleSelectId}
              onSelectAll={onSelectAll}
              selectionActive={!!selectionPhase}
            />
          ))}
        </table>
      </div>

    </div>
  );
}

