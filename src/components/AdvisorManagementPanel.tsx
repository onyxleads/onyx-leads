import { useState } from "react";
import { SUPER_ADMIN_EMAIL, fetchAdvisors } from "../lib/advisors";
import { supabase } from "../lib/supabase";

/* ─── פאנל ניהול מוכרנים (אדמין/סופר-אדמין) ───────────────────────────────── */
export const UNASSIGNED_POOL_EMAIL = "unassigned@wiseli.pool";
export const UNASSIGNED_POOL_NAME  = "לידים ולקוחות למיון";

export function AdvisorManagementPanel({ advisors, onReload, onClose, isSuperAdmin=false, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const [list,    setList]    = useState(advisors);
  const [email,   setEmail]   = useState("");
  const [name,    setName]    = useState("");
  const [busy,    setBusy]    = useState(false);
  const [msg,     setMsg]     = useState("");

  const panelBg = isLight ? "#ffffff" : "#13132b";
  const cardBg  = isLight ? "#f4f6ff" : "#16162c";
  const bdr     = isLight ? "#d8ddf0" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#7070a0" : "#8080b0";
  const inBg    = isLight ? "#f4f2ff" : "#1a1a35";

  const refresh = async () => {
    const fresh = await fetchAdvisors();
    setList(fresh);
    onReload && onReload();
  };

  // וודא שפרופיל "לידים ולקוחות למיון" קיים בטבלה — נדרש כיעד תקין ל-advisor_email
  // לפני שמסירים מוכרן, אחרת ה-FK/הלוגיקה הראשית עלולה להיתקל בערך לא קיים
  const ensurePoolProfileExists = async () => {
    if (!supabase) return;
    const exists = list.some(a => a.email === UNASSIGNED_POOL_EMAIL);
    if (exists) return;
    await supabase.from("advisors").insert([{ email: UNASSIGNED_POOL_EMAIL, name: UNASSIGNED_POOL_NAME, role: "sales" }]);
  };

  const addAdvisor = async () => {
    const e = email.trim().toLowerCase();
    const n = name.trim();
    if (!e || !n) { setMsg("נא למלא אימייל ושם"); return; }
    if (!e.includes("@")) { setMsg("אימייל לא תקין"); return; }
    if (!supabase) { setMsg("Supabase לא מחובר"); return; }
    setBusy(true); setMsg("");
    try {
      const { error } = await supabase.from("advisors").insert([{ email: e, name: n, role: "sales" }]);
      if (error) {
        setMsg(error.message.includes("duplicate") ? "מוכרן עם אימייל זה כבר קיים" : error.message);
      } else {
        setEmail(""); setName("");
        setMsg("✓ המוכרן נוסף לרשימה");
        await refresh();
        setTimeout(() => setMsg(""), 2500);
      }
    } catch(err) {
      setMsg(err?.message || "שגיאה");
    } finally {
      setBusy(false);
    }
  };

  // קידום לאדמין — מותר לכל admin (כולל super_admin)
  const promoteToAdmin = async (e) => {
    if (!supabase) return;
    if (!window.confirm(`לקדם את ${e} לדרגת אדמין?\nאדמין יכול לראות ולערוך לידים של כל המוכרנים.`)) return;
    const { error } = await supabase.from("advisors").update({ role: "admin" }).eq("email", e);
    if (error) { alert(error.message); return; }
    await refresh();
  };

  // הדחה מאדמין בחזרה לאיש מכירות — סופר-אדמין בלבד
  const demoteToSales = async (e) => {
    if (!isSuperAdmin) { alert("רק אדמין ראשי יכול להדיח אדמין."); return; }
    if (!supabase) return;
    if (!window.confirm(`להדיח את ${e} בחזרה לאיש מכירות רגיל?`)) return;
    const { error } = await supabase.from("advisors").update({ role: "sales" }).eq("email", e);
    if (error) { alert(error.message); return; }
    await refresh();
  };

  // הסרת מוכרן — לא מוחקת את הלקוחות שלו! מעבירה אותם לפרופיל "לידים ולקוחות למיון"
  const removeAdvisor = async (a) => {
    if (a.role === "admin" || a.role === "super_admin") {
      if (!isSuperAdmin) { alert("רק אדמין ראשי יכול להסיר אדמין מהמערכת."); return; }
    }
    if (a.email === UNASSIGNED_POOL_EMAIL) { alert('לא ניתן להסיר את פרופיל הסינון "לידים ולקוחות למיון" עצמו.'); return; }
    if (!window.confirm(`להסיר את ${a.name} (${a.email}) מהמערכת?\n\nכל הלידים/לקוחות ששויכו אליו יועברו אוטומטית לפרופיל "${UNASSIGNED_POOL_NAME}" — הם לא יימחקו.`)) return;
    if (!supabase) return;
    setBusy(true);
    try {
      await ensurePoolProfileExists();
      // שלב 1: העבר את כל הלקוחות של המוכרן המוסר לפרופיל הסינון, *לפני* מחיקתו —
      // כך נמנעים ממצב ביניים שבו ללקוחות יש advisor_email שכבר לא קיים בטבלת advisors
      const { error: reassignError } = await supabase
        .from("clients")
        .update({ advisor_email: UNASSIGNED_POOL_EMAIL })
        .eq("advisor_email", a.email);
      if (reassignError) { alert(`שגיאה בהעברת הלקוחות: ${reassignError.message}`); setBusy(false); return; }

      // שלב 2: מחק את רשומת המוכרן עצמו מטבלת advisors
      const { error: deleteError } = await supabase.from("advisors").delete().eq("email", a.email);
      if (deleteError) { alert(`שגיאה בהסרת המוכרן: ${deleteError.message}`); setBusy(false); return; }

      await refresh();
      setMsg(`✓ ${a.name} הוסר; הלידים שלו הועברו ל"${UNASSIGNED_POOL_NAME}"`);
      setTimeout(() => setMsg(""), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, fontFamily:"'Heebo',sans-serif", padding:16,
    }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{
        background:panelBg, borderRadius:16, border:`1px solid ${bdr}`,
        width:480, maxWidth:"95vw", maxHeight:"88vh",
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"0 24px 70px rgba(0,0,0,.5)",
      }}>
        {/* כותרת */}
        <div style={{
          padding:"16px 22px", borderBottom:`1px solid ${bdr}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background: isLight ? "linear-gradient(135deg,#f0eeff,#e8f0ff)" : "linear-gradient(135deg,#16163a,#111128)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:20 }}>👥</span>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:txt }}>ניהול מוכרנים</div>
              <div style={{ fontSize:11, color:sub }}>
                {list.filter(a => a.email !== UNASSIGNED_POOL_EMAIL).length} מוכרנים רשומים
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        {/* תוכן */}
        <div style={{ overflowY:"auto", flex:1, padding:"16px 22px" }}>
          {/* הסבר */}
          <div style={{
            background: isLight ? "#fff8e8" : "#2a2410",
            border:`1px solid ${isLight ? "#f0d890" : "#5a4a20"}`,
            borderRadius:9, padding:"10px 12px", marginBottom:16,
            fontSize:11, color: isLight ? "#8a6a10" : "#d8b860", lineHeight:1.6,
          }}>
            ⚠️ הוספת מוכרן כאן רק רושמת אותו ברשימה. כדי שהמוכרן יוכל להתחבר, יש ליצור לו משתמש ב-Supabase: Authentication → Add user → עם אותו אימייל בדיוק.
          </div>

          {/* טופס הוספה */}
          <div style={{ background:cardBg, borderRadius:11, padding:14, marginBottom:16, border:`1px solid ${bdr}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:txt, marginBottom:10 }}>➕ הוסף מוכרן חדש</div>
            <input
              value={name} onChange={e => { setName(e.target.value); setMsg(""); }}
              placeholder="שם המוכרן" dir="rtl"
              style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", marginBottom:8,
                background:inBg, border:`1px solid ${bdr}`, borderRadius:8, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }}
            />
            <input
              value={email} onChange={e => { setEmail(e.target.value); setMsg(""); }}
              placeholder="agent@email.com" dir="ltr"
              onKeyDown={e => e.key==="Enter" && addAdvisor()}
              style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", marginBottom:10,
                background:inBg, border:`1px solid ${bdr}`, borderRadius:8, color:txt, fontSize:13, outline:"none", fontFamily:"inherit" }}
            />
            <button
              onClick={addAdvisor} disabled={busy}
              style={{ width:"100%", padding:"10px", background: busy ? "#888" : "linear-gradient(135deg,#7c6fcd,#2d88d4)",
                color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:800, cursor: busy?"default":"pointer" }}
            >{busy ? "מוסיף…" : "הוסף מוכרן"}</button>
            {msg && (
              <div style={{ marginTop:10, fontSize:12, fontWeight:700,
                color: msg.startsWith("✓") ? "#2a9a50" : "#c03030" }}>{msg}</div>
            )}
          </div>

          {/* רשימת מוכרנים */}
          <div style={{ fontSize:11, fontWeight:800, color:sub, marginBottom:8, letterSpacing:.5 }}>מוכרנים רשומים</div>
          {list.filter(a => a.email !== UNASSIGNED_POOL_EMAIL).length === 0 ? (
            <div style={{ fontSize:13, color:sub, textAlign:"center", padding:20 }}>אין מוכרנים רשומים עדיין</div>
          ) : list.filter(a => a.email !== UNASSIGNED_POOL_EMAIL).map(a => {
            const isAdminRow = a.role === "admin" || a.role === "super_admin";
            const isThisSuperAdmin = a.email === SUPER_ADMIN_EMAIL;
            return (
            <div key={a.email} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              background:cardBg, border:`1px solid ${bdr}`, borderRadius:9,
              padding:"10px 14px", marginBottom:7, gap:8,
            }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:txt }}>{a.name}</span>
                  {isThisSuperAdmin ? (
                    <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:10,
                      background:"#e8a83822", color:"#b07818", border:"1px solid #e8a83866" }}>👑 אדמין ראשי</span>
                  ) : isAdminRow ? (
                    <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:10,
                      background:"#3dba7e22", color:"#2a8a5a", border:"1px solid #3dba7e66" }}>⚡ אדמין</span>
                  ) : null}
                </div>
                <div style={{ fontSize:11, color:sub, direction:"ltr", textAlign:"right" }}>{a.email}</div>
              </div>

              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                {/* קידום לאדמין — מותר לכל אדמין, רק על מוכרן רגיל */}
                {!isAdminRow && (
                  <button
                    onClick={() => promoteToAdmin(a.email)}
                    title="קדם לאדמין"
                    style={{ background:"none", border:`1px solid ${isLight?"#b0d0e0":"#205a5a"}`,
                      color:"#2a8a5a", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                  >קדם לאדמין</button>
                )}
                {/* הדחה — סופר-אדמין בלבד, ולא ניתן להדיח את עצמו (super_admin הקשיח) */}
                {isAdminRow && !isThisSuperAdmin && isSuperAdmin && (
                  <button
                    onClick={() => demoteToSales(a.email)}
                    title="הדח לאיש מכירות"
                    style={{ background:"none", border:`1px solid ${isLight?"#e0d0a0":"#5a4a20"}`,
                      color:"#b07818", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                  >הדח</button>
                )}
                {/* הסרה מהמערכת — חסומה לחלוטין על ה-super_admin הקשיח; על אדמין רגיל רק super_admin יכול */}
                {!isThisSuperAdmin && (
                  <button
                    onClick={() => removeAdvisor(a)}
                    disabled={busy}
                    style={{ background:"none", border:`1px solid ${isLight?"#e0b0b0":"#5a2020"}`,
                      color:"#c04444", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700,
                      cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
                  >הסר</button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

