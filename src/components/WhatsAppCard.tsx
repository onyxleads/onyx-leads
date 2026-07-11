import { useState, useEffect } from "react";
import { fullName, toWhatsAppPhone } from "../lib/utils";

/* ─── WhatsAppCard — שליחת הודעת ווטסאפ ללקוח לפי תבנית נבחרת ────────────────
   • בחירת תבנית מתוך 6 התבניות הגלובליות (dropdown "{מספר} - {כותרת}")
   • הטקסט בר-עריכה מלאה לפני שליחה (גם תבניות 2-6); תבנית 1 = רישום חופשי
     עם ברירת מחדל https://wiseli.co.il
   • "שלח ווטסאפ" פותח wa.me עם הטקסט שבתיבה (כולל עריכות הסוכן), מקודד
   • בלחיצה — שני לוגים: (A) הערה מובנית בהיסטוריית ההתנהלות עם שם הסוכן+תבנית+טקסט,
     (B) חותם whatsapp_last_sent (JSONB) שמוצג בתחתית הכרטיסייה
   ────────────────────────────────────────────────────────────────────────── */
export function WhatsAppCard({ client, onUpdate, onAddNote, templates=[], myName="", theme:TH={} }) {
  const isLight  = TH.name === "Light Mode";
  const cardBg   = TH.drawerCard    || "#12122a";
  const cardBdr  = TH.drawerBorder  || "#2a2a48";
  const inputBg  = TH.drawerInput   || "#1a1a2e";
  const textMain = TH.drawerText    || "#d8d8f0";
  const textSub  = TH.drawerSubText || "#8080b0";
  const WA = "#25d366"; // ירוק ווטסאפ

  const FREE_WRITE_DEFAULT = "https://wiseli.co.il";

  // תבנית נבחרת (id). ברירת מחדל — הראשונה אם קיימת.
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find(t => String(t.id) === String(selectedId)) || null;
  const isFreeWrite = String(selectedId) === "1";

  // טקסט בר-עריכה — מאותחל לפי התבנית הנבחרת, וניתן לעריכה חופשית.
  const [editText, setEditText] = useState("");
  // בעת החלפת תבנית: טען את גוף התבנית (או ברירת המחדל לרישום חופשי).
  useEffect(() => {
    if (isFreeWrite) setEditText(selected?.body?.trim() ? selected.body : FREE_WRITE_DEFAULT);
    else setEditText(selected?.body || "");
  }, [selectedId, selected?.body, isFreeWrite]);

  // טלפון ראשי (ראשון במערך) — לתאימות אחורה
  const rawPhone = (Array.isArray(client.phones) && client.phones[0]?.number) || "";

  // כל מספרי הטלפון של הלקוח — מקור לבחירת נמען (multi-number)
  const phoneOptions = (Array.isArray(client.phones) ? client.phones : [])
    .filter(p => p && String(p.number || "").replace(/\D/g, "").length >= 6)
    .map((p, i) => ({
      idx: i,
      number: p.number,
      ownerName: p.ownerName || fullName(client) || "",
    }));

  // נרמול מספר לפורמט wa.me — כעת בפונקציה משותפת (lib/utils) כדי שגם כפתורי
  // ה-WhatsApp המהירים בכרטיסיית הליד ישתמשו באותה לוגיקה בדיוק.

  // יומן ההיסטוריה — מערך (חדש), עם נפילה אחורה לרשומה הבודדת הישנה
  const waLog = Array.isArray(client.whatsapp_log) && client.whatsapp_log.length
    ? client.whatsapp_log
    : (client.whatsapp_last_sent ? [client.whatsapp_last_sent] : []);
  // ממוין מהחדש לישן
  const sortedLog = [...waLog].sort((a, b) => new Date(b.at) - new Date(a.at));

  const [showRecipient, setShowRecipient] = useState(false);
  const [recipientIdx,  setRecipientIdx]  = useState(0); // אינדקס המספר הנבחר במודל
  const [carouselIdx,   setCarouselIdx]   = useState(0); // אינדקס בקרוסלת ההיסטוריה (0 = החדש ביותר)

  // איפוס מצביע הקרוסלה לחדש ביותר כשהיומן משתנה
  useEffect(() => { setCarouselIdx(0); }, [waLog.length]);

  // לחיצה על "שלח ווטסאפ" — פותחת תחילה את מודל בחירת הנמען
  const openRecipientModal = () => {
    const body = (editText || "").trim();
    if (!body) { alert("ההודעה ריקה. כתוב טקסט לפני השליחה."); return; }
    if (phoneOptions.length === 0) { alert("אין מספר טלפון תקין ללקוח זה."); return; }
    setRecipientIdx(0);
    setShowRecipient(true);
  };

  // ביצוע השליחה בפועל לנמען שנבחר
  const doSend = () => {
    const chosen = phoneOptions[recipientIdx];
    if (!chosen) return;
    const waPhone = toWhatsAppPhone(chosen.number);
    if (!waPhone) { alert("מספר הטלפון שנבחר אינו תקין."); return; }
    const body = (editText || "").trim();
    if (!body) return;
    const text = body.replace(/\r\n/g, "\n");
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    const now = new Date();
    const tplLabel = selected ? `${selected.id} - ${selected.title}` : "ללא תבנית";
    const record = {
      at: now.toISOString(),
      agent: myName || "",
      template_id: selected?.id ?? null,
      template_label: tplLabel,
      body,
      to_number: chosen.number,
      to_name: chosen.ownerName,
    };
    // צרף ליומן (מערך) + שמור גם last_sent + timestamp לתאימות
    const nextLog = [...waLog, record];
    if (onUpdate) onUpdate(client.id, {
      whatsapp_initial_sent_at: now.toISOString(),
      whatsapp_last_sent: record,
      whatsapp_log: nextLog,
    });
    // Log A — הערה מובנית בהיסטוריית ההתנהלות
    if (onAddNote) {
      onAddNote(client.id, `${myName ? myName + " " : ""}שלח הודעת ווטסאפ (תבנית ${tplLabel}) ל-${chosen.ownerName} (${chosen.number}): "${body}"`);
    }
    setShowRecipient(false);
    setCarouselIdx(0);
  };

  const fmtSent = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  const labelStyle = { fontSize:11, fontWeight:700, color:textSub, marginBottom:5, display:"block" };

  return (
    <div style={{
      background:cardBg, borderRadius:12,
      border:`1px solid ${WA}66`, marginTop:24, marginBottom:24, overflow:"hidden",
    }}>
      {/* כותרת */}
      <div style={{
        background: isLight ? "linear-gradient(135deg,#e8f9ee,#d8f5e2)" : "linear-gradient(135deg,#0a2418,#0d1f17)",
        borderBottom:`1px solid ${WA}55`,
        padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
      }}>
        <span style={{ fontSize:16 }}>💬</span>
        <span style={{ fontSize:13, fontWeight:900, color:WA, letterSpacing:.5 }}>שלח ווטסאפ</span>
      </div>

      <div style={{ padding:"16px" }}>
        {/* בורר תבנית */}
        <div style={{ marginBottom:13 }}>
          <label style={labelStyle}>📋 בחר תבנית</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            dir="rtl"
            style={{
              width:"100%", boxSizing:"border-box", fontSize:13, color:textMain,
              background:inputBg, border:`1px solid ${cardBdr}`, borderRadius:7,
              padding:"9px 11px", outline:"none", fontFamily:"inherit", cursor:"pointer",
            }}
          >
            {templates.length === 0 && <option value="">— אין תבניות מוגדרות —</option>}
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.id} - {t.title}</option>
            ))}
          </select>
        </div>

        {/* טקסט בר-עריכה — כל התבניות ניתנות לעריכה לפני שליחה */}
        <div style={{ marginBottom:15 }}>
          <label style={labelStyle}>✏️ {isFreeWrite ? "רישום חופשי — כתוב הודעה" : "ערוך לפני שליחה"}</label>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            placeholder="כתוב כאן את ההודעה…"
            dir="rtl" rows={5}
            style={{
              width:"100%", boxSizing:"border-box", fontSize:13, lineHeight:1.6,
              color:textMain, background:inputBg, border:`1px solid ${cardBdr}`,
              borderRadius:7, padding:"10px 12px", outline:"none", fontFamily:"inherit",
              resize:"vertical", minHeight:90,
            }}
          />
        </div>

        {/* כפתור שליחה — פותח תחילה מודל בחירת נמען */}
        <button
          onClick={openRecipientModal}
          style={{
            width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            background:`linear-gradient(135deg,${WA},#1eb858)`, color:"#fff",
            border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:800,
            cursor:"pointer", fontFamily:"inherit",
          }}
        >
          <span style={{ fontSize:17 }}>💬</span> שלח ווטסאפ
        </button>

        {/* קרוסלת היסטוריית ההודעות שנשלחו */}
        {sortedLog.length > 0 && (() => {
          const safeIdx = Math.min(carouselIdx, sortedLog.length - 1); // 0 = החדש ביותר
          const rec = sortedLog[safeIdx];
          const hasMultiple = sortedLog.length > 1;
          // מספור כרונולוגי: הישן ביותר = 1, החדש ביותר = total.
          // safeIdx=0 הוא החדש ביותר → מציג total; safeIdx=total-1 הוא הישן → מציג 1.
          const chronoNum = sortedLog.length - safeIdx;
          const navBtn = (enabled) => ({
            background: isLight ? "#ffffff" : "#0a1812",
            border:`1px solid ${WA}44`, color: WA, borderRadius:7,
            width:26, height:26, flexShrink:0, fontSize:14, fontWeight:900,
            cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : .3,
            display:"flex", alignItems:"center", justifyContent:"center", padding:0,
          });
          return (
            <div style={{ marginTop:13 }}>
              {/* שורת כותרת — כותרת בצד אחד, חצים+מונה מקובצים בצד השני */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                marginBottom:6,
              }}>
                <span style={{ fontSize:11, fontWeight:700, color:textSub }}>📜 היסטוריית שליחות</span>
                {hasMultiple && (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {/* חץ ישן יותר (‹) */}
                    <button
                      onClick={() => setCarouselIdx(i => Math.min(sortedLog.length-1, i+1))}
                      disabled={safeIdx >= sortedLog.length-1}
                      title="ישן יותר"
                      style={navBtn(safeIdx < sortedLog.length-1)}
                    >‹</button>
                    <span style={{ fontSize:11, fontWeight:800, color:textSub, minWidth:34, textAlign:"center" }}>
                      {chronoNum}/{sortedLog.length}
                    </span>
                    {/* חץ חדש יותר (›) */}
                    <button
                      onClick={() => setCarouselIdx(i => Math.max(0, i-1))}
                      disabled={safeIdx === 0}
                      title="חדש יותר"
                      style={navBtn(safeIdx > 0)}
                    >›</button>
                  </div>
                )}
              </div>
              {/* כרטיס הרשומה — רוחב מלא */}
              <div style={{
                width:"100%", boxSizing:"border-box", padding:"11px 13px", borderRadius:9,
                background: isLight ? "#e8f9ee" : "#0d2418", border:`1px solid ${WA}44`,
              }}>
                <div style={{
                  fontSize:12, fontWeight:800, color: isLight ? "#0d7a3e" : "#5fd98a",
                  display:"flex", alignItems:"center", gap:6, marginBottom:6, flexWrap:"wrap",
                }}>
                  <span>✓ נשלח</span>
                  <span style={{ color:textSub, fontWeight:600 }}>·</span>
                  <span>{fmtSent(rec.at)}</span>
                  {rec.agent && <><span style={{ color:textSub, fontWeight:600 }}>·</span><span>{rec.agent}</span></>}
                </div>
                {(rec.template_label || rec.to_name) && (
                  <div style={{ fontSize:11, fontWeight:700, color:textSub, marginBottom:5 }}>
                    {rec.template_label && <span>תבנית: {rec.template_label}</span>}
                    {rec.to_name && <span>{rec.template_label ? " · " : ""}אל: {rec.to_name}{rec.to_number ? ` (${rec.to_number})` : ""}</span>}
                  </div>
                )}
                {rec.body && (
                  <div style={{
                    fontSize:12, lineHeight:1.6, color:textMain, whiteSpace:"pre-wrap",
                    wordBreak:"break-word", background: isLight ? "#ffffff" : "#0a1812",
                    border:`1px solid ${WA}22`, borderRadius:6, padding:"8px 10px", marginTop:4,
                    maxHeight:140, overflowY:"auto",
                  }}>
                    {rec.body}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* מודל בחירת נמען — "למי לשלוח ווטסאפ?" */}
      {showRecipient && (
        <div
          onClick={() => setShowRecipient(false)}
          style={{
            position:"fixed", inset:0, zIndex:1200,
            background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
            display:"flex", alignItems:"center", justifyContent:"center", padding:16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            dir="rtl"
            style={{
              background: isLight ? "#ffffff" : "#13132b", borderRadius:14, width:"100%", maxWidth:420,
              border:`1px solid ${cardBdr}`, boxShadow:"0 20px 60px rgba(0,0,0,.5)", overflow:"hidden",
            }}
          >
            <div style={{
              padding:"14px 18px", borderBottom:`1px solid ${cardBdr}`,
              display:"flex", alignItems:"center", justifyContent:"space-between",
              background: isLight ? "linear-gradient(135deg,#e8f9ee,#d8f5e2)" : "linear-gradient(135deg,#0a2418,#0d1f17)",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>💬</span>
                <span style={{ fontSize:14, fontWeight:900, color:textMain }}>למי לשלוח ווטסאפ?</span>
              </div>
              <button onClick={() => setShowRecipient(false)} style={{ background:"none", border:"none", color:textSub, fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ padding:"16px 18px" }}>
              <div style={{ fontSize:12, color:textSub, marginBottom:12 }}>
                בחר את המספר שאליו תישלח ההודעה:
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                {phoneOptions.map(opt => {
                  const active = opt.idx === recipientIdx;
                  return (
                    <label key={opt.idx} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"11px 13px",
                      borderRadius:9, cursor:"pointer",
                      background: active ? `${WA}18` : (isLight ? "#f4f6ff" : "#16162c"),
                      border:`1px solid ${active ? WA : cardBdr}`, transition:"all .12s",
                    }}>
                      <input
                        type="radio" name="wa-recipient" checked={active}
                        onChange={() => setRecipientIdx(opt.idx)}
                        style={{ width:16, height:16, accentColor:WA, cursor:"pointer" }}
                      />
                      <div style={{ display:"flex", flexDirection:"column", minWidth:0 }}>
                        <span style={{ fontSize:13, fontWeight:800, color:textMain }}>{opt.ownerName || "—"}</span>
                        <span style={{ fontSize:12, color:textSub, direction:"ltr", textAlign:"right" }}>{opt.number}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <button
                onClick={doSend}
                style={{
                  width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  background:`linear-gradient(135deg,${WA},#1eb858)`, color:"#fff",
                  border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:800,
                  cursor:"pointer", fontFamily:"inherit",
                }}
              >
                <span style={{ fontSize:16 }}>💬</span> שלח עכשיו
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

