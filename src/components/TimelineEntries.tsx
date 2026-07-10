import { useState } from "react";
import { fmtDate2, lbl, todayStr2 } from "../lib/utils";

export function TimelineEntries({ timeline: timelineProp, onUpdate, DB, DC, DBR, DT, DS, DI, ACCENT, theme:TH={}, readOnly=false }) {
  const timeline = Array.isArray(timelineProp) ? timelineProp : [];
  const [editIdx,    setEditIdx]    = useState(null);
  const [editNote,   setEditNote]   = useState("");
  const [editDate,   setEditDate]   = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [expanded,   setExpanded]   = useState(false);

  const isLight = TH.name === "Light Mode";
  const rowBdr  = isLight ? "#d0d8e8" : "#1e1e38";
  const hoverBg = isLight ? "#f4f0ff" : "#1a1530";
  const PURPLE  = "#7c5ecf";

  // guard: onUpdate עשוי להיות null (יועץ) — לא לקרוס
  const safeUpdate = (next) => { if (onUpdate) onUpdate(next); };

  const startEdit = (i) => {
    setEditIdx(i);
    setEditNote(timeline[i].note);
    setEditDate(timeline[i].date);
  };
  const commitEdit = () => {
    if (editIdx === null) return;
    const next = timeline.map((e,i) => i===editIdx ? { ...e, date:editDate, note:editNote } : e);
    safeUpdate(next);
    setEditIdx(null);
  };
  const cancelEdit = () => setEditIdx(null);
  const deleteEntry = (i) => {
    safeUpdate(timeline.filter((_,j) => j!==i));
    setConfirmDel(null);
  };

  // ── הפיכת שורת עדכון למשימת לוח שנה (וההפך) ──
  const toggleCalendarTask = (i) => {
    const next = timeline.map((e,j) => {
      if (j !== i) return e;
      const turningOn = !e.is_calendar_task;
      return {
        ...e,
        is_calendar_task: turningOn,
        // אם מפעילים ואין תאריך/שעה יעד — ברירת מחדל להיום בשעה 09:00
        task_date: turningOn ? (e.task_date || todayStr2(e.date)) : e.task_date,
        task_time: turningOn ? (e.task_time || "09:00") : e.task_time,
        completed: turningOn ? !!e.completed : e.completed,
      };
    });
    safeUpdate(next);
  };
  const setTaskDate = (i, date) => {
    safeUpdate(timeline.map((e,j) => j===i ? { ...e, task_date: date } : e));
  };
  const setTaskTime = (i, time) => {
    safeUpdate(timeline.map((e,j) => j===i ? { ...e, task_time: time } : e));
  };
  const toggleCompleted = (i) => {
    safeUpdate(timeline.map((e,j) => j===i ? { ...e, completed: !e.completed } : e));
  };

  const VISIBLE_COUNT = 5;
  const displayedEntries = expanded ? timeline : timeline.slice(0, VISIBLE_COUNT);
  const hasMore = timeline.length > VISIBLE_COUNT;

  if (timeline.length === 0) {
    return (
      <div style={{ padding:"20px 16px", textAlign:"center", color:DS, fontSize:13 }}>
        אין עדיין עדכונים
      </div>
    );
  }

  return (
    <div style={{ position:"relative" }}>
      {/* דיאלוג אישור מחיקה */}
      {confirmDel !== null && (
        <div style={{
          position:"absolute", inset:0, zIndex:10,
          background:"rgba(0,0,0,.6)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div dir="rtl" style={{
            background: isLight ? "#fff" : "#1a1a2e",
            border:`1px solid ${isLight ? "#d0d8f0" : "#4a3a5a"}`,
            borderRadius:12, padding:"22px 24px", maxWidth:270,
            textAlign:"center", boxShadow:"0 12px 40px rgba(0,0,0,.6)",
          }}>
            <div style={{ fontSize:22, marginBottom:10 }}>🗑️</div>
            <div style={{ fontSize:14, fontWeight:800, color:DT, marginBottom:8 }}>מחיקת עדכון</div>
            <div style={{ fontSize:12, color:DS, marginBottom:18, lineHeight:1.6 }}>
              האם אתה בטוח שברצונך למחוק עדכון זה?
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => deleteEntry(confirmDel)} style={{
                background:"linear-gradient(135deg,#c03030,#e04444)",
                color:"#fff", border:"none", borderRadius:8,
                padding:"8px 20px", fontSize:13, fontWeight:800, cursor:"pointer",
              }}>כן, מחק</button>
              <button onClick={() => setConfirmDel(null)} style={{
                background:DI, color:DS,
                border:`1px solid ${DBR}`, borderRadius:8,
                padding:"8px 14px", fontSize:13, cursor:"pointer",
              }}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {displayedEntries.map((entry, i) => {
        const isTask = !!entry.is_calendar_task;
        const isDone = !!entry.completed;
        return (
        <div key={i} style={{
          borderBottom: i<displayedEntries.length-1 || hasMore ? `1px solid ${rowBdr}` : "none",
          padding:"12px 16px",
        }}>
          {editIdx === i ? (
            /* ── מצב עריכה ── */
            <div>
              <div style={{ marginBottom:6 }}>
                <label style={{ ...lbl, color:DS }}>תאריך</label>
                <input
                  type="text"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  dir="rtl"
                  placeholder="dd/mm/yy"
                  style={{
                    background:DI, border:`1px solid ${DBR}`, borderRadius:6,
                    color:DT, padding:"6px 10px", fontSize:12, outline:"none",
                    width:"100%", boxSizing:"border-box", fontFamily:"inherit",
                    marginBottom:6,
                  }}
                />
                <label style={{ ...lbl, color:DS }}>עדכון</label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  dir="rtl" rows={2}
                  style={{
                    background:DI, border:`1px solid ${DBR}`, borderRadius:6,
                    color:DT, padding:"7px 10px", fontSize:13, outline:"none",
                    width:"100%", boxSizing:"border-box", fontFamily:"inherit",
                    resize:"vertical", lineHeight:1.6,
                  }}
                  onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key==="Escape") cancelEdit(); }}
                />
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={commitEdit} style={{
                  background:"linear-gradient(135deg,#3dba7e,#2d88d4)",
                  color:"#fff", border:"none", borderRadius:6,
                  padding:"6px 16px", fontSize:12, fontWeight:800, cursor:"pointer",
                }}>✓ שמור</button>
                <button onClick={cancelEdit} style={{
                  background:DI, color:DS, border:`1px solid ${DBR}`,
                  borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer",
                }}>ביטול</button>
                <span style={{ fontSize:10, color:DS, alignSelf:"center" }}>Enter לשמירה · Esc לביטול</span>
              </div>
            </div>
          ) : (
            /* ── מצב תצוגה ── */
            <div style={{ display:"flex", gap:12, alignItems:"stretch" }}>
              {/* צד ימין — עיגול + קו + תיבת V (למשימות לוח שנה) */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, marginTop:3 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background: isTask ? PURPLE : ACCENT }} />
                <div style={{ width:2, flex:1, minHeight:20, background:DBR, marginTop:4 }} />
                {/* תיבת V — מתחת לנקודה ולקו, רק למשימות לוח שנה */}
                {isTask && !readOnly && (
                  <span
                    onClick={() => toggleCompleted(i)}
                    title={isDone ? "בוצע" : "סמן כבוצע"}
                    style={{
                      width:24, height:24, borderRadius:6, marginTop:6,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: isDone ? "#22a060" : "transparent",
                      border:`2px solid ${isDone ? "#22a060" : DBR}`,
                      color:"#fff", fontSize:14, fontWeight:900, cursor:"pointer",
                    }}
                  >{isDone ? "✓" : ""}</span>
                )}
              </div>

              {/* תוכן */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, color: isTask ? PURPLE : ACCENT, fontWeight:700, marginBottom:4 }}>
                  {[entry.author_name, entry.time, entry.date].filter(Boolean).join(" • ")}
                </div>
                <div style={{
                  fontSize:13, color: isDone ? DS : DT, lineHeight:1.65,
                  textDecoration: isDone ? "line-through" : "none",
                }}>{entry.note}</div>
                {/* שורת משימת לוח שנה — תאריך + שעה ביומן */}
                {isTask && !readOnly && (
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:PURPLE }}>📅 תאריך ביומן:</span>
                    <input
                      type="date"
                      value={(entry.task_date || "").split("T")[0]}
                      onChange={e => setTaskDate(i, e.target.value)}
                      dir="rtl"
                      style={{
                        fontSize:11, color:DT, WebkitTextFillColor:DT, opacity:1,
                        background:DI, border:`1px solid ${PURPLE}66`, borderRadius:6,
                        padding:"5px 8px", outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    />
                    <span style={{ fontSize:11, fontWeight:700, color:PURPLE }}>🕐 שעה:</span>
                    <input
                      type="time"
                      value={entry.task_time || "09:00"}
                      onChange={e => setTaskTime(i, e.target.value)}
                      dir="ltr"
                      required
                      style={{
                        fontSize:11, color:DT, WebkitTextFillColor:DT, opacity:1,
                        background:DI, border:`1px solid ${PURPLE}66`, borderRadius:6,
                        padding:"5px 8px", outline:"none", fontFamily:"inherit", cursor:"pointer",
                      }}
                    />
                  </div>
                )}
                {isTask && readOnly && entry.task_date && (
                  <div style={{ fontSize:11, fontWeight:700, color:PURPLE, marginTop:6 }}>
                    📅 ביומן: {fmtDate2(entry.task_date)} {entry.task_time ? `· 🕐 ${entry.task_time}` : ""}
                  </div>
                )}
              </div>

              {/* צד שמאל — פעולות: עריכה+מחיקה למעלה, לוח שנה הכי למטה */}
              {!readOnly && (
              <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0, alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"center" }}>
                  <button
                    onClick={() => startEdit(i)}
                    title="ערוך עדכון"
                    style={{
                      background:"none", border:`1px solid ${DBR}`,
                      color:DS, borderRadius:5, padding:"3px 8px",
                      fontSize:12, cursor:"pointer", transition:"all .12s",
                    }}
                  >✏️</button>
                  <button
                    onClick={() => setConfirmDel(i)}
                    title="מחק עדכון"
                    style={{
                      background:"none", border:`1px solid ${isLight?"#e0b0b0":"#5a2020"}`,
                      color: isLight?"#c04444":"#e06060", borderRadius:5, padding:"3px 8px",
                      fontSize:12, cursor:"pointer", transition:"all .12s",
                    }}
                  >🗑️</button>
                </div>
                {/* כפתור הפיכה למשימת לוח שנה — הכי למטה */}
                <button
                  onClick={() => toggleCalendarTask(i)}
                  title={isTask ? "בטל משימת לוח שנה" : "הפוך למשימה בלוח השנה"}
                  style={{
                    background: isTask ? PURPLE : "none", border:`1px solid ${isTask ? PURPLE : DBR}`,
                    color: isTask ? "#fff" : DS, borderRadius:5, padding:"3px 8px",
                    fontSize:12, cursor:"pointer", transition:"all .12s", marginTop:8,
                  }}
                >📅</button>
              </div>
              )}
            </div>
          )}
        </div>
        );
      })}

      {/* כפתור הצג עוד / הסתר — מוצג רק כשיש יותר מ-5 */}
      {hasMore && (
        <button
          onClick={() => setExpanded(x => !x)}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            width:"100%", padding:"10px 16px",
            background: isLight ? "#f0eeff" : "#1a1530",
            border:"none", borderTop:`1px solid ${rowBdr}`,
            color:ACCENT, fontSize:12, fontWeight:700,
            cursor:"pointer", transition:"background .12s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = isLight ? "#e8e0ff" : "#221840"}
          onMouseLeave={e => e.currentTarget.style.background = isLight ? "#f0eeff" : "#1a1530"}
        >
          {expanded
            ? <><span>▲</span> הסתר ישן ({timeline.length - VISIBLE_COUNT} עדכונים)</>
            : <><span>▼</span> הצג עוד {timeline.length - VISIBLE_COUNT} עדכונים ישנים</>
          }
        </button>
      )}
    </div>
  );
}


export const td = { padding:"10px 12px", fontSize:13, color:"#c8c8e0", verticalAlign:"middle", textAlign:"right" };

