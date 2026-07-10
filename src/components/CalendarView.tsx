import { useState } from "react";
import { QuickNoteField } from "./QuickNoteField";

/* ─── CalendarView — לוח שנה כללי לכל אירועי הלקוחות ───────────────────────── */
export function CalendarView({ clients, onClose, onOpenClient, onToggleComplete, onReorder, onSaveNote, onReschedule, onSwapDay, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const bg     = isLight ? "#ffffff" : "#13132b";
  const cardBg = isLight ? "#f4f6ff" : "#16162c";
  const bdr    = isLight ? "#d8ddf0" : "#2a2a48";
  const txt    = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub    = isLight ? "#7070a0" : "#8080b0";

  const [view,   setView]   = useState("month"); // "month" | "week" | "day"
  const [anchor, setAnchor] = useState(() => new Date());

  // אסוף את כל האירועים מכל הלקוחות
  const allEvents = [];
  (clients || []).forEach(c => {
    (Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : []).forEach(ev => {
      if (ev?.date) allEvents.push({ date: ev.date, time: ev.time || "", text: ev.text || "", client: c, type:"custom", id: ev.id, completed: !!ev.completed, caseType: c.case_type || "", note: ev.notes || "", dayOrder: (ev.day_order === null || ev.day_order === undefined) ? null : Number(ev.day_order) });
    });
    // משימות לוח שנה מתוך היסטוריית התנהלות התיק (is_calendar_task)
    (Array.isArray(c.timeline) ? c.timeline : []).forEach((entry, ti) => {
      if (entry?.is_calendar_task && entry?.task_date) {
        allEvents.push({ date: entry.task_date, time: entry.task_time || "", text: entry.note || "", client: c, type:"custom", id:`tl-${c.id}-${ti}`, tlIndex: ti, completed: !!entry.completed, caseType: c.case_type || "", note:"", dayOrder: (entry.day_order === null || entry.day_order === undefined) ? null : Number(entry.day_order) });
      }
    });
  });
  const eventsByDate = {};
  allEvents.forEach(e => {
    const key = (e.date || "").split("T")[0];
    if (!key) return;
    (eventsByDate[key] = eventsByDate[key] || []).push(e);
  });
  // מיון כל יום לפי dayOrder (אירועים ללא סדר — בסוף, יציב)
  Object.keys(eventsByDate).forEach(key => {
    eventsByDate[key].forEach((e, i) => { if (e.dayOrder === null) e._fallback = i; });
    eventsByDate[key].sort((a, b) => {
      const oa = a.dayOrder === null ? (1e6 + (a._fallback||0)) : a.dayOrder;
      const ob = b.dayOrder === null ? (1e6 + (b._fallback||0)) : b.dayOrder;
      return oa - ob;
    });
  });

  const typeColor = (t) => "#7c5ecf"; // כל האירועים כעת מסוג "custom" בלבד
  const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  const dayNames = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  const pad = (n) => String(n).padStart(2,"0");
  const fmtKey = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  const todayKey = fmtKey(new Date());

  // חישוב טווח לפי תצוגה
  let headerLabel = "";
  let monthCells = [];   // לתצוגה חודשית (Date|null)
  let weekDays = [];     // לתצוגה שבועית/יומית (Date[])
  if (view === "month") {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    for (let i=0;i<firstDay;i++) monthCells.push(null);
    for (let d=1; d<=daysInMonth; d++) monthCells.push(new Date(y, m, d));
    headerLabel = `${monthNames[m]} ${y}`;
  } else if (view === "week") {
    const start = new Date(anchor); start.setDate(start.getDate() - start.getDay());
    for (let i=0;i<7;i++) { const d = new Date(start); d.setDate(start.getDate()+i); weekDays.push(d); }
    const end = new Date(start); end.setDate(start.getDate()+6);
    headerLabel = `${start.getDate()}.${pad(start.getMonth()+1)} – ${end.getDate()}.${pad(end.getMonth()+1)}.${end.getFullYear()}`;
  } else {
    weekDays = [new Date(anchor)];
    headerLabel = `${dayNames[anchor.getDay()]} ${anchor.getDate()}.${pad(anchor.getMonth()+1)}.${anchor.getFullYear()}`;
  }

  const nav = (dir) => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir*7);
    else d.setDate(d.getDate() + dir);
    setAnchor(d);
  };

  // לחיצה על יום → מעבר לתצוגה יומית
  const openDay = (dt) => { setAnchor(new Date(dt)); setView("day"); };

  const navBtn = { background:cardBg, border:`1px solid ${bdr}`, color:txt, borderRadius:7, padding:"6px 13px", fontSize:15, cursor:"pointer", fontWeight:700, lineHeight:1 };
  const toggleBtn = (active) => ({
    background: active ? "#7c5ecf" : "transparent",
    color: active ? "#fff" : sub,
    border:`1px solid ${active ? "#7c5ecf" : bdr}`,
    borderRadius:7, padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer",
  });

  // רכיב תגית אירוע
  const EventChip = ({ ev, big }) => (
    <div
      title={`${ev.client?.name || ""} - ${ev.text}`}
      style={{
        background: typeColor(ev.type)+"22",
        border:`1px solid ${typeColor(ev.type)}66`,
        color: typeColor(ev.type),
        borderRadius:5, padding: big ? "6px 10px" : "2px 5px",
        fontSize: big ? 13 : 10, fontWeight:700,
        lineHeight:1.4,
        display: big ? "block" : "-webkit-box",
        WebkitLineClamp: big ? undefined : 2, WebkitBoxOrient:"vertical",
        overflow: big ? "visible" : "hidden",
        height: big ? "auto" : undefined,
        overflowWrap:"break-word", wordBreak:"break-word",
        whiteSpace:"normal", minWidth:0, width: big ? "100%" : undefined, boxSizing:"border-box",
        flexShrink:0,
      }}
    >
      <span style={{ fontWeight:800 }}>{ev.client?.name || ""}</span>
      <span style={{ opacity:.85 }}> - {ev.text}</span>
    </div>
  );

  return (
    <div dir="rtl" style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, fontFamily:"'Heebo',sans-serif", padding:16,
    }}>
      <div style={{
        background:bg, borderRadius:16, border:`1px solid ${bdr}`,
        width:"100%", maxWidth:1040, height:"85vh",
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"0 24px 70px rgba(0,0,0,.5)",
      }}>
        {/* כותרת — שורה עליונה: X משמאל, כותרת מימין */}
        <div style={{
          padding:"12px 16px 10px", borderBottom:`1px solid ${bdr}`, flexShrink:0,
          background: isLight ? "linear-gradient(135deg,#f0eeff,#e8f0ff)" : "linear-gradient(135deg,#16163a,#111128)",
        }}>
          {/* שורה 1: X + כותרת */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <button onClick={onClose} title="סגור" style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer", lineHeight:1, order:0 }}>✕</button>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <span style={{ fontSize:16, fontWeight:900, color:txt }}>{headerLabel}</span>
              <span style={{ fontSize:19 }}>🗓️</span>
            </div>
          </div>
          {/* שורה 2: toggle + ניווט בשורה אחת קומפקטית */}
          <div style={{ display:"flex", flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:5 }}>
              <button onClick={() => setView("month")} style={toggleBtn(view==="month")}>חודשי</button>
              <button onClick={() => setView("week")}  style={toggleBtn(view==="week")}>שבועי</button>
              <button onClick={() => setView("day")}   style={toggleBtn(view==="day")}>יומי</button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {/* RTL: ‹ = הקודם, › = הבא — מיושרים כלפי חוץ */}
              <button onClick={() => nav(-1)} title="הקודם" style={navBtn}>‹</button>
              <button onClick={() => setAnchor(new Date())} style={{ ...navBtn, fontSize:11, color:sub, padding:"6px 11px" }}>היום</button>
              <button onClick={() => nav(1)} title="הבא" style={navBtn}>›</button>
            </div>
          </div>
        </div>

        {/* גוף */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"14px 18px", overflow:"hidden", minHeight:0 }}>

          {/* ─── תצוגה חודשית ─── */}
          {view === "month" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7, minmax(0, 1fr))", gap:6, marginBottom:6, flexShrink:0 }}>
                {dayNames.map(d => (
                  <div key={d} style={{ textAlign:"center", fontSize:12, fontWeight:800, color:sub, padding:"4px 0", minWidth:0 }}>{d}</div>
                ))}
              </div>
              <div style={{
                flex:1, display:"grid",
                gridTemplateColumns:"repeat(7, minmax(0, 1fr))",
                gridAutoRows:"minmax(82px, 1fr)",
                gap:6, width:"100%", minHeight:0, overflowY:"auto",
              }}>
                {monthCells.map((dt, i) => {
                  if (dt === null) return <div key={`e${i}`} style={{ minWidth:0 }} />;
                  const k = fmtKey(dt);
                  const evs = eventsByDate[k] || [];
                  const isToday = k === todayKey;
                  return (
                    <div key={k}
                      onClick={() => openDay(dt)}
                      style={{
                        minWidth:0, width:"100%", boxSizing:"border-box",
                        background: cardBg,
                        border:`1.5px solid ${isToday ? "#7c5ecf99" : bdr}`,
                        borderRadius:8, padding:"5px 6px",
                        display:"flex", flexDirection:"column", gap:3,
                        overflow:"hidden", cursor:"pointer",
                      }}>
                      <span style={{ fontSize:12, fontWeight:isToday?900:700, color:isToday?"#7c5ecf":sub, textAlign:"left", flexShrink:0 }}>{dt.getDate()}</span>
                      <div style={{ display:"flex", flexDirection:"column", gap:2, overflow:"hidden", flex:1 }}>
                        {evs.slice(0,2).map((ev, j) => <EventChip key={j} ev={ev} />)}
                        {evs.length > 2 && <span style={{ fontSize:9, color:sub, flexShrink:0 }}>+{evs.length-2} נוספים</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ─── תצוגה שבועית — שורות מלאות ─── */}
          {view === "week" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8, width:"100%", minHeight:0, overflowY:"auto" }}>
              {weekDays.map((dt, i) => {
                const k = fmtKey(dt);
                const evs = eventsByDate[k] || [];
                const isToday = k === todayKey;
                return (
                  <div key={k}
                    onClick={() => openDay(dt)}
                    style={{
                      display:"flex", flexDirection:"row", width:"100%",
                      minHeight:70, height:"auto",
                      background:cardBg, border:`1.5px solid ${isToday ? "#7c5ecf99" : bdr}`,
                      borderRadius:10, overflow:"hidden", cursor:"pointer",
                      alignItems:"stretch", flexShrink:0,
                    }}>
                    {/* צד ימין — שם היום ותאריך בסוגריים */}
                    <div style={{
                      flexShrink:0, width:92, padding:"10px 12px",
                      background: isToday ? "#7c5ecf18" : (isLight ? "#eceef8" : "#0f0f22"),
                      borderLeft:`1px solid ${bdr}`,
                      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3,
                    }}>
                      <span style={{ fontSize:13, fontWeight:900, color: isToday ? "#7c5ecf" : txt }}>{dayNames[dt.getDay()]}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:sub }}>({dt.getDate()}.{pad(dt.getMonth()+1)})</span>
                    </div>
                    {/* צד שמאל — אירועים, נערמים מלמעלה */}
                    <div style={{ flex:1, minWidth:0, padding:"8px 10px", display:"flex", flexDirection:"column", gap:5, justifyContent: evs.length ? "flex-start" : "center" }}>
                      {evs.length === 0
                        ? <span style={{ fontSize:12, color:sub, fontStyle:"italic" }}>אין אירועים</span>
                        : evs.map((ev, j) => <EventChip key={j} ev={ev} big />)
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── תצוגה יומית — מסך מלא ממוקד ─── */}
          {view === "day" && (() => {
            const k = fmtKey(weekDays[0]);
            const evs = eventsByDate[k] || [];

            // ── חלוקת אירועי היום לפי שעה ──
            // אירוע עם time "HH:MM" משויך לשעה המתאימה; אירוע ללא שעה נכנס לקבוצת "ללא שעה".
            const HOURS = Array.from({ length: 24 }, (_, h) => h); // 0..23
            const byHour = {};      // hour(int) -> [events]
            const noTime = [];      // אירועים בלי שעה מוגדרת
            evs.forEach(ev => {
              const t = (ev.time || "").trim();
              const m = /^(\d{1,2}):(\d{2})$/.exec(t);
              if (m) {
                const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
                (byHour[h] = byHour[h] || []).push(ev);
              } else {
                noTime.push(ev);
              }
            });
            // הצג רק שעות שיש בהן אירועים (גריד נקי, לא 24 שורות ריקות)
            const activeHours = HOURS.filter(h => (byHour[h] || []).length > 0);

            // כרטיסיית אירוע בודדת — נשמרת זהה לוגית, ללא חצי סדר ידני (הסדר נקבע לפי שעה)
            const renderEventCard = (ev, key) => {
              const done = !!ev.completed;
              return (
                <div key={ev.id || key}
                  style={{
                    position:"relative",
                    display:"flex", alignItems:"flex-start", gap:12,
                    background:cardBg,
                    border:`1px solid ${typeColor(ev.type)}55`,
                    borderRight:`4px solid ${typeColor(ev.type)}`,
                    borderRadius:9, padding:"12px 16px",
                    opacity: done ? .55 : 1,
                    transition:"opacity .15s",
                  }}>
                  {/* תיבת סימון בוצע */}
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
                    <span
                      onClick={(e) => { e.stopPropagation(); onToggleComplete && onToggleComplete(ev.client, ev); }}
                      title={done ? "בוצע" : "סמן כבוצע"}
                      style={{
                        width:22, height:22, borderRadius:6,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        background: done ? "#22a060" : "transparent",
                        border:`2px solid ${done ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                        color:"#fff", fontSize:14, fontWeight:900, cursor:"pointer",
                      }}
                    >{done ? "✓" : ""}</span>
                  </div>
                  {/* טקסט — שם, סוג תיק, תיאור */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontSize:15, fontWeight:800, color:txt,
                      textDecoration: done ? "line-through" : "none",
                      textDecorationColor: done ? sub : undefined,
                    }}>{ev.client?.name || ""}</div>
                    {ev.caseType && (
                      <div style={{ fontSize:12, color:sub, marginTop:2, fontWeight:500, display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:12, lineHeight:1 }}>💼</span>{ev.caseType}
                      </div>
                    )}
                    <div style={{
                      fontSize:13, color: isLight ? "#4a4a6a" : "#b0b0d0", marginTop:3,
                      textDecoration: done ? "line-through" : "none",
                    }}>{ev.text}</div>
                    {/* שדה הערה מהירה — שמירה אוטומטית ב-onBlur */}
                    <QuickNoteField
                      initial={ev.note}
                      isLight={isLight}
                      accent={typeColor(ev.type)}
                      onSave={(val) => onSaveNote && onSaveNote(ev.client, ev, val)}
                    />
                    {/* שורה תחתונה — תגית+תאריך מימין, כפתור משמאל */}
                    <div style={{ display:"flex", flexDirection:"row", alignItems:"center", justifyContent:"space-between", width:"100%", marginTop:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {/* תגית שעה */}
                        {ev.time && (
                          <span style={{ fontSize:11, fontWeight:800, color: typeColor(ev.type), display:"flex", alignItems:"center", gap:3 }}>
                            🕐 {ev.time}
                          </span>
                        )}
                        {/* אייקון לוח שנה דינמי — מציג את מספר היום + בורר תאריך */}
                        <label
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          title="העבר לתאריך אחר"
                          style={{
                            position:"relative", cursor:"pointer", flexShrink:0,
                            width:28, height:28, borderRadius:6, overflow:"hidden",
                            background:"#ffffff", border:"1px solid #e2e2ec",
                            boxShadow:"0 1px 2px rgba(0,0,0,.08)",
                            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                          }}
                        >
                          <span style={{ position:"absolute", top:0, left:0, right:0, height:6, background: typeColor(ev.type) }} />
                          <span style={{ fontSize:12, fontWeight:800, color:"#2a2a3a", marginTop:5, lineHeight:1 }}>
                            {(() => { const d = new Date((ev.date || "").split("T")[0]); return isNaN(d) ? "" : d.getDate(); })()}
                          </span>
                          <input
                            type="date"
                            defaultValue={(ev.date || "").split("T")[0]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { if (e.target.value) onReschedule && onReschedule(ev.client, ev, e.target.value); }}
                            style={{
                              position:"absolute", inset:0, width:"100%", height:"100%",
                              opacity:0, cursor:"pointer", border:"none", padding:0,
                            }}
                          />
                        </label>
                      </div>
                      {/* כפתור כרטיסיית לקוח */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenClient && onOpenClient(ev.client); onClose(); }}
                        style={{
                          display:"inline-flex", alignItems:"center", gap:4,
                          background:"transparent", border:`1px solid ${typeColor(ev.type)}55`,
                          color: typeColor(ev.type), borderRadius:5, padding:"2px 8px",
                          fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                        }}
                      >👤 כרטיסיית לקוח</button>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10, minHeight:0, overflowY:"auto", overflowX:"hidden", touchAction:"pan-y" }}>
                <div style={{ fontSize:14, fontWeight:900, color:"#7c5ecf", flexShrink:0 }}>
                  {evs.length} אירועים ביום זה
                </div>
                {evs.length === 0 ? (
                  <div style={{
                    flex:1, display:"flex", alignItems:"center", justifyContent:"center",
                    color:sub, fontSize:15, fontStyle:"italic",
                  }}>אין אירועים מתוכננים ליום זה</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {/* שורות שעתיות — רק שעות עם אירועים */}
                    {activeHours.map(h => (
                      <div key={h} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderTop:`1px solid ${isLight ? "#e4e8f4" : "#1c1c34"}` }}>
                        {/* תווית שעה */}
                        <div style={{
                          flexShrink:0, width:54, textAlign:"center", paddingTop:14,
                          fontSize:13, fontWeight:800, color:"#7c5ecf",
                        }}>
                          {String(h).padStart(2,"0")}:00
                        </div>
                        {/* אירועי השעה */}
                        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:8 }}>
                          {(byHour[h] || []).map((ev, idx) => renderEventCard(ev, `${h}-${idx}`))}
                        </div>
                      </div>
                    ))}
                    {/* אירועים ללא שעה מוגדרת */}
                    {noTime.length > 0 && (
                      <div style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderTop:`1px solid ${isLight ? "#e4e8f4" : "#1c1c34"}` }}>
                        <div style={{
                          flexShrink:0, width:54, textAlign:"center", paddingTop:14,
                          fontSize:10, fontWeight:700, color:sub,
                        }}>
                          ללא שעה
                        </div>
                        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:8 }}>
                          {noTime.map((ev, idx) => renderEventCard(ev, `nt-${idx}`))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* מקרא */}
          <div style={{ display:"flex", gap:14, marginTop:10, fontSize:10, color:sub, flexWrap:"wrap", flexShrink:0 }}>
            <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:10, height:10, borderRadius:3, background:"#7c5ecf66", border:"1px solid #7c5ecf" }} /> אירוע מותאם</span>
            {view !== "day" && <span style={{ marginRight:"auto", color:sub, fontSize:10 }}>💡 לחץ על יום לפתיחת התצוגה היומית</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

