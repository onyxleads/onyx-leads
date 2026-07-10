import { useState } from "react";
import { td } from "./TimelineEntries";
import { mkClient } from "../lib/utils";

/* ─── שורת "הוסף לקוח חדש" (Inline בתוך הטבלה) ───────────────────────────── */
export function InlineAddRow({ phaseId, onSave, onCancel, theme:TH={}, advisors=[], isAdmin=false, myName="" }) {
  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [advisor, setAdvisor] = useState("");

  const isLight = TH.name === "Light Mode";
  const rowBg   = isLight ? "#f8f9ff" : "#13132b";
  const barCol  = "#6c5ecf";
  const inputBg = isLight ? "#ffffff" : "#1a1a35";
  const inputBdr= isLight ? "#d0d8e8" : "#2e2e50";
  const txtCol  = isLight ? "#1a1a3a" : "#e0e0f4";
  const subCol  = isLight ? "#7070a0" : "#8888b0";
  const lblCol  = isLight ? "#6060a0" : "#9090c0";

  const valid = name.trim() !== "";

  const save = () => {
    if (!valid) return;
    onSave(mkClient({
      phase:     phaseId,
      name:      name.trim(),
      advisor_email: advisor,
      banks:     [],
      // הטלפון נשמר במבנה הזוגות הסטנדרטי { number, ownerName } —
      // כך שהוא יוצג נכון בכל מקום אחר שקורא client.phones (טבלה, מגירת לקוח וכו')
      phones:    phone.trim() ? [{ number: phone.trim(), ownerName: name.trim() }] : [],
      tids:      [],
      timeline:  [],
    }));
  };

  const C = { padding:"10px 8px", verticalAlign:"top" };
  const lblStyle = { display:"block", fontSize:10, fontWeight:700, color:lblCol, marginBottom:4 };
  const fieldStyle = {
    width:"100%", boxSizing:"border-box",
    background:inputBg, border:`1px solid ${inputBdr}`, borderRadius:7,
    color:txtCol, padding:"8px 10px", fontSize:13, outline:"none",
    fontFamily:"inherit", cursor:"pointer",
  };

  return (
    <tr style={{ background:rowBg, borderBottom:`2px solid ${barCol}66` }}>
      {/* פס צבע */}
      <td style={{ width:4, padding:0, background:barCol }} />

      {/* שם הלקוח */}
      <td style={C}>
        <label style={lblStyle}>שם הלקוח *</label>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="ישראל ישראלי" dir="rtl"
          onKeyDown={e => { if (e.key==="Enter") save(); if (e.key==="Escape") onCancel(); }}
          style={{ ...fieldStyle, cursor:"text", WebkitTextFillColor:txtCol, opacity:1 }}
        />
      </td>

      {/* פלאפון — שדה טלפון */}
      <td style={{ ...C, minWidth:200 }}>
        <label style={lblStyle}>📱 פלאפון</label>
        <input
          type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="050-0000000" dir="ltr"
          onKeyDown={e => { if (e.key==="Enter") save(); if (e.key==="Escape") onCancel(); }}
          style={{ ...fieldStyle, cursor:"text", textAlign:"right", WebkitTextFillColor:txtCol, opacity:1 }}
        />
      </td>

      {/* מתופעל ע״י / יועץ — Dropdown (אדמין/סופר-אדמין בלבד; איש מכירות לא רואה בחירה כלל) */}
      <td style={{ ...C, minWidth:170 }}>
        <label style={lblStyle}>👤 מתופעל ע״י</label>
        {isAdmin ? (
          <select
            value={advisor} onChange={e => setAdvisor(e.target.value)} dir="rtl"
            style={{ ...fieldStyle, color: advisor ? txtCol : subCol }}
          >
            <option value="">— בחר סוכן —</option>
            {advisors.map(a => (
              <option key={a.email} value={a.email}>{a.name}</option>
            ))}
          </select>
        ) : (
          // איש מכירות: אין בחירה — הליד תמיד משויך אליו, מוצג כקריאה-בלבד
          <div style={{ ...fieldStyle, cursor:"default", color:subCol, background:isLight?"#f0f0f8":"#15152e" }}>
            {myName || "אתה"} (אוטומטי)
          </div>
        )}
      </td>

      {/* כפתורים */}
      <td style={{ ...C, whiteSpace:"nowrap" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:16 }}>
          <button
            onClick={save} disabled={!valid}
            style={{
              background: valid ? "linear-gradient(135deg,#6c5ecf,#2d88d4)" : (isLight ? "#e0e0ec" : "#222238"),
              color: valid ? "#fff" : (isLight ? "#a0a0b0" : "#555"),
              border:"none", borderRadius:7, padding:"8px 18px",
              fontSize:12, fontWeight:800, cursor: valid ? "pointer" : "default",
            }}
          >✓ שמור</button>
          <button onClick={onCancel} style={{
            background: isLight ? "#ffffff" : "#1a1a35", color: subCol,
            border:`1px solid ${inputBdr}`, borderRadius:7,
            padding:"7px 12px", fontSize:12, cursor:"pointer",
          }}>ביטול</button>
        </div>
      </td>
    </tr>
  );
}


