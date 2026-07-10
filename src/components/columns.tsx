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

