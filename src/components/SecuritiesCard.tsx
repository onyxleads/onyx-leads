import { useState } from "react";
import { SEC_FIELDS } from "../lib/constants";
import { baseInput } from "../lib/utils";

export function SecuritiesCard({ data, onChange, dates={}, onDateChange, checks={}, onCheckChange, isAdvisor=false, theme:TH={}, readOnly=false, fields=SEC_FIELDS, title="צ׳ק-ליסט שלבי התיק", titleIcon="🛡️" }) {
  const [activeField, setActiveField] = useState(null);
  const [draft,       setDraft]       = useState("");
  const [flash,       setFlash]       = useState(null);

  const isLight  = TH.name === "Light Mode";
  const cardBg   = TH.drawerCard    || "#12122a";
  const cardBdr  = TH.drawerBorder  || "#2a2a48";
  const inputBg  = TH.drawerInput   || "#1a1a2e";
  const textMain = TH.drawerText    || "#d8d8f0";
  const textSub  = TH.drawerSubText || "#8080b0";
  const hoverBg  = isLight ? "#f0f4ff" : "#1a1a35";
  const editBg   = isLight ? "#eef2ff" : "#0e0e28";
  const footBg   = isLight ? "#edf0f8" : "#0d0d1e";
  const rowBdr   = isLight ? "#d8ddf0" : "#1e1e3a";
  const emptyDot = isLight ? "#c8d0e8" : "#2a2a50";
  const GOLD     = "#22a060";   // ירוק במקום צהוב-זהב

  const fmtDate = (d) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("he-IL", { day:"2-digit", month:"2-digit", year:"2-digit" }).replace(/\//g, ".");
    } catch { return d; }
  };

  const startEdit = (key) => { if (readOnly) return; setActiveField(key); setDraft(data[key] || ""); };
  const commit = (key) => {
    onChange(key, draft.trim());
    setActiveField(null);
    setFlash(key);
    setTimeout(() => setFlash(null), 1400);
  };
  const cancel = () => setActiveField(null);

  return (
    <div style={{
      background:cardBg, borderRadius:12,
      border:`1px solid ${GOLD}66`, marginTop:36, marginBottom:36, overflow:"hidden",
    }}>
      {/* כותרת */}
      <div style={{
        background: isLight ? "linear-gradient(135deg,#e8f8ef,#d8f4e8)" : "linear-gradient(135deg,#0a2a18,#0d2020)",
        borderBottom:`1px solid ${GOLD}55`,
        padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
      }}>
        <span style={{ fontSize:16 }}>{titleIcon}</span>
        <span style={{ fontSize:13, fontWeight:900, color:GOLD, letterSpacing:.5, textTransform:"uppercase" }}>{title}</span>
      </div>

      {/* שורות */}
      <div style={{ padding:"4px 0" }}>
        {fields.map((f, idx) => {
          const isEditing = activeField === f.key;
          const hasValue  = data[f.key]?.trim();
          const isFlash   = flash === f.key;
          const isLast    = idx === fields.length - 1;

          return (
            <div key={f.key} style={{ borderBottom: isLast ? "none" : `1px solid ${rowBdr}`, padding:0 }}>
              {/* ── שדה כפול (ביטוחים) — כותרת עם V ראשי + תתי-שדות טקסט+תאריך ── */}
              {f.dual ? (
                <div style={{ padding:0 }}>
                  {/* כותרת השורה — זהה לשאר השורות, עם V ראשי בצד ימין */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px" }}>
                    <span style={{ fontSize:14, flexShrink:0 }}>{f.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:textSub, minWidth:100, flexShrink:0 }}>{f.label}</span>
                    <span style={{ flex:1 }} />
                    {/* V ראשי — insurance_completed */}
                    {(() => {
                      const done = !!checks[f.doneKey];
                      return (
                        <span
                          onClick={() => { if (!isAdvisor) onCheckChange && onCheckChange(f.doneKey, !done); }}
                          title={done ? "בוצע" : "טרם בוצע"}
                          style={{
                            width:20, height:20, borderRadius:6, flexShrink:0,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            background: done ? "#22a060" : "transparent",
                            border:`2px solid ${done ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                            color:"#fff", fontSize:13, fontWeight:900,
                            cursor: isAdvisor ? "default" : "pointer",
                            transition:"all .15s",
                            boxShadow: done ? "0 0 8px #22a06066" : "none",
                          }}
                        >{done ? "✓" : ""}</span>
                      );
                    })()}
                  </div>

                  {/* תתי-שדות — ביטוח חיים / ביטוח נכס */}
                  <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"0 16px 12px 16px", marginRight:8 }}>
                    {f.subFields.map(sf => (
                      <div key={sf.notesKey} style={{
                        paddingRight:16, borderRight:`2px solid ${rowBdr}`,
                        display:"flex", flexDirection:"column", gap:6,
                      }}>
                        <span style={{ fontSize:11, fontWeight:700, color:textSub }}>{sf.label}</span>
                        <input
                          type="text"
                          value={dates[sf.notesKey] || ""}
                          onChange={e => onDateChange && onDateChange(sf.notesKey, e.target.value)}
                          placeholder={`פרטי ${sf.label}…`}
                          dir="rtl"
                          disabled={isAdvisor}
                          style={{
                            width:"100%", boxSizing:"border-box",
                            fontSize:12, color:textMain, WebkitTextFillColor:textMain, opacity:1,
                            background:inputBg, border:`1px solid ${rowBdr}`, borderRadius:7,
                            padding:"7px 10px", outline:"none", fontFamily:"inherit",
                          }}
                        />
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:11, color:textSub, opacity:.8, flexShrink:0 }}>התבצע בתאריך:</span>
                          <input
                            type="date"
                            value={dates[sf.dateKey] || ""}
                            onChange={e => onDateChange && onDateChange(sf.dateKey, e.target.value)}
                            dir="rtl"
                            disabled={isAdvisor}
                            style={{
                              fontSize:11,
                              color: dates[sf.dateKey] ? textMain : textSub,
                              WebkitTextFillColor: dates[sf.dateKey] ? textMain : textSub,
                              opacity:1,
                              background:"transparent", border:`1px solid ${rowBdr}`, borderRadius:6,
                              padding:"4px 7px", outline:"none", fontFamily:"inherit",
                              cursor: isAdvisor ? "default" : "pointer",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (<>
              {!isEditing && (
                <div onClick={() => startEdit(f.key)}
                  style={{ padding:"11px 16px", cursor:"pointer", transition:"background .12s" }}
                  onMouseEnter={e => e.currentTarget.style.background=hoverBg}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:14, flexShrink:0 }}>{f.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:textSub, flexShrink:0 }}>{f.label}</span>
                    <span style={{ flex:1 }} />
                    {/* תיבת סימון — V ירוק, מתפעל בלבד */}
                    {(() => {
                      const done = !!checks[f.doneKey];
                      return (
                        <span
                          onClick={e => {
                            e.stopPropagation();
                            if (isAdvisor) return;
                            onCheckChange && onCheckChange(f.doneKey, !done);
                          }}
                          title={done ? "בוצע" : "טרם בוצע"}
                          style={{
                            width:20, height:20, borderRadius:6, flexShrink:0,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            background: done ? "#22a060" : "transparent",
                            border:`2px solid ${done ? "#22a060" : (isLight ? "#c0c8dc" : "#3a3a60")}`,
                            color:"#fff", fontSize:13, fontWeight:900,
                            cursor: isAdvisor ? "default" : "pointer",
                            transition:"all .15s",
                            boxShadow: done ? "0 0 8px #22a06066" : "none",
                          }}
                        >{done ? "✓" : ""}</span>
                      );
                    })()}
                    {isFlash && <span style={{ fontSize:11, color:"#3dba7e", fontWeight:700 }}>✓</span>}
                  </div>
                  {/* שורת הרישום החופשי — בשורה נפרדת מתחת לכותרת */}
                  <div style={{ marginTop:6 }}>
                    <span style={{
                      fontSize:13, display:"block", textAlign:"right",
                      color: hasValue ? textMain : (isLight ? "#b0b8cc" : "#3a3a60"),
                      fontStyle: hasValue ? "normal" : "italic", transition:"color .15s",
                    }}>
                      {hasValue || "רישום הערות…"}
                    </span>
                  </div>
                </div>
              )}

              {/* שדה תאריך ביצוע — עדין, מתפעל בלבד */}
              {!isEditing && (
                <div style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"0 16px 9px 16px", marginTop:-4,
                }}>
                  <span style={{ fontSize:11, color:textSub, opacity:.8, flexShrink:0 }}>התבצע בתאריך:</span>
                  {isAdvisor ? (
                    /* יועץ — תצוגה בלבד בפורמט עברי DD.MM.YY */
                    <span style={{ fontSize:11, color: dates[f.dateKey] ? textMain : textSub, fontWeight:600 }}>
                      {dates[f.dateKey] ? fmtDate(dates[f.dateKey]) : "—"}
                    </span>
                  ) : (
                    /* מתפעל — בחירת תאריך + כפתור מחיקה */
                    <>
                      <input
                        type="date"
                        value={dates[f.dateKey] || ""}
                        onChange={e => onDateChange && onDateChange(f.dateKey, e.target.value)}
                        dir="rtl"
                        style={{
                          fontSize:11,
                          color: dates[f.dateKey] ? textMain : textSub,
                          WebkitTextFillColor: dates[f.dateKey] ? textMain : textSub,
                          opacity:1,
                          background:"transparent",
                          border:`1px solid ${rowBdr}`,
                          borderRadius:5, padding:"3px 7px",
                          outline:"none", fontFamily:"inherit",
                          cursor:"pointer",
                        }}
                      />
                      {dates[f.dateKey] && (
                        <button
                          onClick={() => onDateChange && onDateChange(f.dateKey, "")}
                          title="נקה תאריך"
                          style={{
                            background:"none", border:"none", color:"#c04444",
                            fontSize:13, fontWeight:700, cursor:"pointer",
                            padding:"0 2px", lineHeight:1, flexShrink:0,
                          }}
                        >✕</button>
                      )}
                    </>
                  )}
                </div>
              )}

              {isEditing && (
                <div style={{ padding:"10px 14px", background:editBg }}>
                  <div style={{ fontSize:11, color:GOLD, fontWeight:700, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                    <span>{f.icon}</span><span>{f.label}</span>
                  </div>
                  <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                    placeholder={f.placeholder} dir="rtl" rows={2}
                    style={baseInput({ resize:"none", lineHeight:1.6, border:`1px solid ${GOLD}66`,
                      background:inputBg, color:textMain, fontSize:13 })}
                    onKeyDown={e => {
                      if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); commit(f.key); }
                      if (e.key==="Escape") cancel();
                    }}
                  />
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <button onClick={() => commit(f.key)} style={{
                      background:"linear-gradient(135deg,#8a6914,#d4a827)",
                      color:"#fff", border:"none", borderRadius:6,
                      padding:"6px 18px", fontSize:12, fontWeight:800, cursor:"pointer",
                    }}>✓ שמור</button>
                    <button onClick={cancel} style={{
                      background:inputBg, color:textSub,
                      border:`1px solid ${cardBdr}`, borderRadius:6,
                      padding:"6px 12px", fontSize:12, cursor:"pointer",
                    }}>ביטול</button>
                    <span style={{ fontSize:10, color:textSub, alignSelf:"center", marginRight:4 }}>Enter לשמירה · Esc לביטול</span>
                  </div>
                </div>
              )}
              </>)}
            </div>
          );
        })}
      </div>

      {/* סיכום */}
      <div style={{
        borderTop:`1px solid ${rowBdr}`, padding:"7px 16px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:footBg,
      }}>
        <span style={{ fontSize:11, color:textSub }}>
          {fields.filter(f => checks[f.doneKey]).length} / {fields.length} שדות מולאו
        </span>
        <div style={{ display:"flex", gap:4 }}>
          {fields.map(f => (
            <div key={f.key} style={{
              width:20, height:4, borderRadius:2,
              background: checks[f.doneKey] ? "#22a060" : emptyDot,
              transition:"background .3s",
            }} title={f.label} />
          ))}
        </div>
      </div>
    </div>
  );
}

