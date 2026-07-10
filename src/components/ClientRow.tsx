import { useState, useMemo, memo } from "react";
import { td } from "./TimelineEntries";
import { PHASES } from "../lib/constants";

/* ─── שורת לקוח — memo למניעת re-render מיותר ──────────────────────────────── */
export const ClientRow = memo(function ClientRow({ client, phase, onOpen, onPhaseChange, theme:T={}, cols, widths, fontSizes={}, onReorder, dragId, setDragId, dragOverId, setDragOverId, selecting=false, selectionActive=false, isSelected=false, onToggleSelect }) {
  const [hovered, setHovered] = useState(false);
  const rowNormal = T.rowBg    || "#0f0f22";
  const rowHov    = T.rowHover || "#181830";

  // הגנה על נתוני הלקוח
  const safe = useMemo(() => ({
    ...client,
    name:     client?.name     || "—",
    handler:  client?.handler  || "",
    opFor:    client?.opFor    || "",
    banks:    Array.isArray(client?.banks)    ? client.banks    : [],
    phones:   Array.isArray(client?.phones)   ? client.phones   : [],
    tids:     Array.isArray(client?.tids)     ? client.tids     : [],
    timeline: Array.isArray(client?.timeline) ? client.timeline : [],
    securities: client?.securities || {},
  }), [client]);

  const safePhase = phase || PHASES[0];
  const canDrag   = !!onReorder;
  const isDragging = dragId && dragId === client.id;
  const isDragOver = dragOverId && dragOverId === client.id && dragId !== client.id;

  // ── גרירה מבוססת Pointer Events (אחיד לעכבר ולמגע) ──
  const startPointerDrag = (e) => {
    if (!canDrag) return;
    e.stopPropagation();
    e.preventDefault();
    setDragId && setDragId(client.id);

    const getXY = (ev) => {
      if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      if (ev.changedTouches && ev.changedTouches[0]) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
      return { x: ev.clientX, y: ev.clientY };
    };
    const locate = (x, y) => {
      if (x == null || y == null) return null;
      const el = document.elementFromPoint(x, y);
      const row = el && el.closest("[data-clientid]");
      return row ? row.getAttribute("data-clientid") : null;
    };
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault(); // מניעת גלילה תוך כדי גרירה במובייל
      const { x, y } = getXY(ev);
      const overId = locate(x, y);
      if (overId) setDragOverId && setDragOverId(overId);
    };
    const end = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      const { x, y } = getXY(ev);
      const overId = locate(x, y);
      if (overId && overId !== client.id) onReorder(client.id, overId);
      setDragId && setDragId(null);
      setDragOverId && setDragOverId(null);
    };
    window.addEventListener("pointermove", move, { passive:false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", move, { passive:false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  };

  return (
    <tr
      data-clientid={client.id}
      onClick={() => { if (dragId) return; if (selecting) { onToggleSelect && onToggleSelect(client.id); } else { onOpen(safe); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isSelected ? (safePhase.dim || "#181830") : (isDragOver ? (T.rowHover || "#181830") : (hovered ? rowHov : rowNormal)),
        cursor: dragId ? "grabbing" : "pointer", transition:"background .12s",
        borderBottom:`1px solid ${T.border||"#1a1a38"}`,
        borderTop: isDragOver ? "2px solid #7c5ecf" : undefined,
        opacity: isDragging ? .45 : 1,
        boxShadow: isDragging ? "0 4px 16px rgba(124,94,207,.35)" : "none",
      }}
    >
      <td style={{ width:4, padding:0, background:safePhase.color, flexShrink:0 }} />
      {/* תא checkbox — נשמר בכל העמודות כשמצב בחירה פעיל, כדי לשמור יישור עמודות.
          ה-checkbox עצמו מוצג רק בעמודה שבמצב בחירה (selecting); באחרות תא ריק. */}
      {selectionActive && (
        <td style={{ width:40, padding:"0 0 0 4px", textAlign:"center", verticalAlign:"middle" }}>
          {selecting && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); onToggleSelect && onToggleSelect(client.id); }}
              onClick={(e) => e.stopPropagation()}
              style={{ width:17, height:17, cursor:"pointer", accentColor:safePhase.color }}
            />
          )}
        </td>
      )}
      {(cols||[]).map((col, ci) => {
        const fs = fontSizes[col.key] || 13;
        return (
          <td key={col.key} style={{
            ...td,
            fontSize: fs,
            width: widths[col.key],
            minWidth: widths[col.key],
            maxWidth: widths[col.key],
            overflow:"hidden",
          }}>
            {/* ידית גרירה בתא הראשון */}
            {ci === 0 && canDrag && (
              <span
                onClick={(e) => e.stopPropagation()}
                onPointerDown={startPointerDrag}
                onTouchStart={startPointerDrag}
                title="גרור לשינוי סדר"
                style={{ display:"inline-block", color: dragId===client.id ? "#7c5ecf" : (T.textSecondary||"#666"), fontSize:18, cursor:"grab", marginLeft:6, userSelect:"none", touchAction:"none", WebkitUserSelect:"none" }}
              >⠿</span>
            )}
            {col.render(safe, safePhase, T, onPhaseChange, fs)}
          </td>
        );
      })}
    </tr>
  );
});

