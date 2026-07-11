import { useState, useRef } from "react";
import { PHASES } from "../lib/constants";
import { fullName } from "../lib/utils";

/* ─── הגדרת עמודות ─────────────────────────────────────────────────────────
   key  = מזהה ייחודי
   label = כותרת
   w     = רוחב ברירת מחדל (px)
   render(client, phase, T) = תוכן התא
*/
/* ─── אייקון תיק עבודה (💼) — שימוש חוזר ─────────────────────────────────── */
export const BriefcaseIcon = ({ size=14, color }) => (
  <span style={{ fontSize:size, lineHeight:1, display:"inline-flex", verticalAlign:"middle" }}>💼</span>
);

// אייקון WhatsApp (SVG מוטבע — כדי לא להוסיף תלות בספריית אייקונים)
export const WhatsAppIcon = ({ size=16 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ display:"block" }}>
    <circle cx="16" cy="16" r="16" fill="#25D366" />
    <g transform="translate(6.2,4.9) scale(0.0425)">
      <path
        fill="#fff"
        d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"
      />
    </g>
  </svg>
);

export const COLUMN_DEFS = [
  {
    key:"name", label:"שם הלקוח", w:170,
    render:(c,ph,T,_,fs=13) => {
      const banks = Array.isArray(c.banks) ? c.banks.filter(b=>b?.trim()) : [];
      const strong = T.textPrimary || "#1a1a3a";  // אותו שחור של השם
      const divider = T.name==="Light Mode" ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.12)";
      return (
        <div>
          {/* שורה 1: שם הלקוח */}
          <span style={{ color:strong, fontSize:fs, fontWeight:700 }}>{fullName(c)}</span>
          {/* שורה 2: סוג התיק — שחור מלא + אייקון תיק */}
          {c.case_type && (
            <div style={{
              display:"flex", alignItems:"center", gap:5,
              fontSize:Math.max(9,fs-3), color:strong, fontWeight:600,
              marginTop:3, lineHeight:1.5,
            }}>
              <span style={{ color:strong, display:"flex" }}><BriefcaseIcon size={Math.max(11,fs-2)} /></span>
              <span style={{ wordBreak:"break-word" }}>{c.case_type}</span>
            </div>
          )}
          {/* קו מפריד דק לפני שורת הבנק */}
          {c.case_type && banks.length > 0 && (
            <div style={{ height:1, background:divider, margin:"5px 0" }} />
          )}
          {/* שורה 3: בנק וסניף */}
          {banks.length > 0 && (
            <div>
              {banks.map((b,i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:5,
                  fontSize:Math.max(9,fs-3), color:T.textSecondary||"#6060a0", lineHeight:1.6,
                }}>
                  <span style={{ flexShrink:0 }}>🏦</span>
                  <span style={{ wordBreak:"break-word" }}>{b}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
  },
  {
    key:"handler", label:"מטופל על ידי", w:140,
    render:(c,_,T,__,fs=13) => <span style={{ color:T.textPrimary||"#c8c8e0", fontSize:fs }}>{c.handler||"—"}</span>,
  },
  {
    key:"timeline", label:"התנהלות התיק", w:200,
    render:(c,ph,T,__,fs=13) => {
      const sub = T.textSecondary||"#6060a0";
      const tl = Array.isArray(c.timeline) ? c.timeline : [];
      return tl.length>0 ? (
        <div>
          <div style={{ fontSize:Math.max(9,fs-2), color:ph.color, fontWeight:700, marginBottom:2 }}>{tl[0].date}</div>
          <div style={{ fontSize:fs, color:sub, lineHeight:1.5, wordBreak:"break-word" }}>{tl[0].note}</div>
          {tl.length>1 && <div style={{ fontSize:Math.max(9,fs-2), color:sub, opacity:.7, marginTop:2 }}>+{tl.length-1} עדכונים</div>}
        </div>
      ) : <span style={{ color:sub, fontSize:fs, opacity:.5 }}>אין עדכונים</span>;
    },
  },
  {
    key:"phone", label:"טלפון", w:155,
    render:(c,_,T,__,fs=13) => (
      <div>{(c.phones||[]).map((p,i)=>(
        <div key={i} style={{ marginBottom:2, lineHeight:1.5 }}>
          <span style={{ fontSize:fs, color:T.textPrimary||"#c8c8e0" }}>{p.number||"—"}</span>
          {p.ownerName && <span style={{ color:T.textSecondary||"#6060a0", fontSize:Math.max(9,fs-2), marginRight:5 }}> ({p.ownerName})</span>}
        </div>
      ))}</div>
    ),
  },
  {
    key:"opFor", label:"תפעול ע״י", w:130,
    render:(c,_,T,__,fs=13) => <span style={{ color:T.textPrimary||"#c8c8e0", fontSize:fs }}>{c.opFor||"—"}</span>,
  },
  {
    key:"phase", label:"שלב", w:160,
    render:(c,ph,T,onPhaseChange,fs=13) => (
      <div onClick={e=>e.stopPropagation()}>
        <select
          value={c.phase}
          onChange={e=>onPhaseChange && onPhaseChange(c.id,e.target.value)}
          disabled={!onPhaseChange}
          dir="rtl"
          style={{
            background:T.rowBg||"#1a1a30", border:`1px solid ${T.border||"#3a3a60"}`,
            borderRadius:5, color:ph.color, fontSize:Math.max(10,fs-1),
            padding:"3px 6px", cursor:onPhaseChange?"pointer":"default",
            fontFamily:"inherit", outline:"none",
            opacity: onPhaseChange ? 1 : 0.7,
          }}
        >
          {PHASES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
    ),
  },
  {
    key:"fee", label:"שכר טרחה", w:120,
    render:(c,_,T,__,fs=13) => <span style={{ color:T.textPrimary||"#c8c8e0", fontSize:fs }}>{c.fee||"—"}</span>,
  },
];

/* ─── Hook: ניהול עמודות (סדר + רוחב) ──────────────────────────────────── */
export function useColumns() {
  const STORAGE_KEY_ORDER  = "onyx_col_order";
  const STORAGE_KEY_WIDTHS = "onyx_col_widths";
  const DEFAULT_COL_ORDER  = ["name","timeline","phase","phone","handler","opFor","fee"];

  const [order,  setOrder]  = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_ORDER);
      let arr = v ? JSON.parse(v) : DEFAULT_COL_ORDER;
      // הסר מפתחות שכבר לא קיימים (למשל "bank" שהוסר)
      arr = arr.filter(k => k !== "bank" && COLUMN_DEFS.some(c => c.key === k));
      // הוסף עמודות חדשות שטרם קיימות אצל המשתמש (למשל "fee")
      DEFAULT_COL_ORDER.forEach(k => { if (!arr.includes(k)) arr.push(k); });
      return arr;
    } catch { return DEFAULT_COL_ORDER; }
  });
  const [widths, setWidths] = useState(() => {
    try { const v = localStorage.getItem(STORAGE_KEY_WIDTHS); return v ? JSON.parse(v) : Object.fromEntries(COLUMN_DEFS.map(c=>[c.key, c.w])); } catch { return Object.fromEntries(COLUMN_DEFS.map(c=>[c.key, c.w])); }
  });
  const [dragSrc,  setDragSrc]  = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const cols = order.map(k => COLUMN_DEFS.find(c=>c.key===k)).filter(Boolean);

  const persistOrder  = (o) => { try { localStorage.setItem(STORAGE_KEY_ORDER,  JSON.stringify(o)); } catch{} };
  const persistWidths = (w) => { try { localStorage.setItem(STORAGE_KEY_WIDTHS, JSON.stringify(w)); } catch{} };

  /* ── גרירת עמודות — Pointer Events (מחשב + מובייל) ── */
  const dragState = useRef({ active:false, key:null, startX:0, startOrder:[] });

  const startColDrag = (key, e) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    dragState.current = { active:true, key, startX:clientX, startOrder:[...order] };
    setDragSrc(key);

    const onMove = (mv) => {
      if (!dragState.current.active) return;
      const x = mv.touches ? mv.touches[0].clientX : mv.clientX;
      // מצא את האלמנט מתחת לאצבע/סמן
      const el = document.elementFromPoint(x, mv.clientY || (mv.touches?.[0]?.clientY ?? 0));
      const th = el?.closest("[data-colkey]");
      if (th) {
        const overKey = th.getAttribute("data-colkey");
        if (overKey && overKey !== dragState.current.key) setDragOver(overKey);
      }
    };
    const onUp = () => {
      if (dragState.current.active) {
        const { key: src } = dragState.current;
        setDragOver(prev => {
          if (prev && prev !== src) {
            setOrder(prevOrder => {
              const next = [...prevOrder];
              const si = next.indexOf(src);
              const ti = next.indexOf(prev);
              if (si !== -1 && ti !== -1) { next.splice(si,1); next.splice(ti,0,src); }
              persistOrder(next);
              return next;
            });
          }
          return null;
        });
      }
      dragState.current.active = false;
      setDragSrc(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onUp);
    };
    document.addEventListener("mousemove", onMove, { passive:true });
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove", onMove, { passive:true });
    document.addEventListener("touchend",  onUp);
  };

  const endDrag = () => { setDragSrc(null); setDragOver(null); };

  /* ── שינוי רוחב — Pointer Events (מחשב + מובייל) ── */
  const startResize = (key, startX, startW, e) => {
    e.stopPropagation();
    e.preventDefault();

    const onMove = mv => {
      const cx = mv.touches ? mv.touches[0].clientX : mv.clientX;
      const newW = Math.max(50, startW + cx - startX);
      setWidths(w => {
        const next = { ...w, [key]: newW };
        persistWidths(next);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove", onMove, { passive:false });
    document.addEventListener("touchend",  onUp);
  };

  return { cols, widths, dragSrc, dragOver, startColDrag, endDrag, startResize };
}

