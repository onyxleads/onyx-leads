/* ─── סרגל פעולות מרובות צף ─────────────────────────────────────────────── */
export function BulkActionBar({ count, phases, advisors, isAdmin, onMoveStage, onDelete, onReassign, onCancel, theme:T={} }) {
  const isLight = T.name === "Light Mode";
  const barBg   = isLight ? "#ffffff" : "#16162c";
  const bdr     = isLight ? "#d0d4e8" : "#2a2a48";
  const txt     = isLight ? "#1a1a3a" : "#e0e0f4";
  const sub     = isLight ? "#6070a0" : "#8080b0";
  const inputBg = isLight ? "#f4f2ff" : "#1a1a35";

  const selStyle = {
    background:inputBg, border:`1px solid ${bdr}`, borderRadius:8,
    color:txt, padding:"8px 10px", fontSize:12.5, outline:"none",
    fontFamily:"inherit", cursor:"pointer", maxWidth:160,
  };

  return (
    <div style={{
      position:"fixed", bottom:18, left:"50%", transform:"translateX(-50%)",
      zIndex:1050, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
      justifyContent:"center", maxWidth:"94vw",
      background:barBg, border:`1px solid ${bdr}`, borderRadius:14,
      padding:"12px 18px", boxShadow:"0 12px 40px rgba(0,0,0,.4)",
    }} dir="rtl">
      {/* מונה נבחרים */}
      <span style={{ fontSize:13, fontWeight:900, color:txt, whiteSpace:"nowrap" }}>
        {count} נבחרו
      </span>

      {/* A: העברת שלב — לכולם */}
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onMoveStage(e.target.value); e.target.value=""; } }}
        style={selStyle}
        title="העבר לשלב אחר"
      >
        <option value="">↪ העבר לשלב…</option>
        {phases.filter(p => p.id !== "archive").map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      {/* C: שיוך מחדש — אדמין בלבד */}
      {isAdmin && (
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) { onReassign(e.target.value); e.target.value=""; } }}
          style={selStyle}
          title="שייך לאיש מכירות"
        >
          <option value="">👤 שייך למוכרן…</option>
          {(advisors||[]).map(a => (
            <option key={a.email} value={a.email}>{a.name || a.email}</option>
          ))}
        </select>
      )}

      {/* B: מחיקה — אדמין בלבד */}
      {isAdmin && (
        <button
          onClick={onDelete}
          style={{
            background:"#c0303018", color:"#e05555",
            border:"1px solid #c0303055", borderRadius:8,
            padding:"8px 14px", fontSize:12.5, fontWeight:800,
            cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
          }}
        >🗑 מחק נבחרים</button>
      )}

      {/* ביטול */}
      <button
        onClick={onCancel}
        style={{
          background:"transparent", color:sub,
          border:`1px solid ${bdr}`, borderRadius:8,
          padding:"8px 14px", fontSize:12.5, cursor:"pointer", fontFamily:"inherit",
        }}
      >ביטול</button>
    </div>
  );
}

