/* ─── רכיב זוג שדות (מספר + שם בעלים) — ללא הגבלת כמות ─────────────────── */
export function PairFields({ pairs, onChange, numPlaceholder, namePlaceholder, addLabel="+ הוסף", inputBg, inputBdr, inputColor, keyA="number", keyB="ownerName", dirA="rtl" }) {
  const update = (i, key, val) =>
    onChange(pairs.map((p,j) => j===i ? { ...p, [key]:val } : p));
  const add    = () => onChange([...pairs, { [keyA]:"", [keyB]:"" }]);
  const remove = (i) => onChange(pairs.filter((_,j) => j!==i));

  const iStyle = {
    background: inputBg || "#1a1a2e",
    border:`1px solid ${inputBdr || "#2e2e50"}`,
    borderRadius:6, color: inputColor || "#e0e0f4",
    WebkitTextFillColor: inputColor || "#e0e0f4", opacity:1,
    padding:"7px 10px", fontSize:12, outline:"none",
    boxSizing:"border-box", fontFamily:"inherit", direction:"rtl",
  };

  return (
    <div>
      {pairs.map((p, i) => (
        <div key={i} style={{ display:"flex", gap:5, marginBottom:5, alignItems:"center" }}>
          <input
            value={p[keyA] || ""}
            onChange={e => update(i,keyA,e.target.value)}
            placeholder={numPlaceholder}
            dir={dirA}
            style={{ ...iStyle, flex:"0 0 128px", width:"auto", direction:dirA, textAlign: dirA==="ltr" ? "left" : "right" }}
          />
          <input
            value={p[keyB] || ""}
            onChange={e => update(i,keyB,e.target.value)}
            placeholder={namePlaceholder}
            dir="rtl"
            style={{ ...iStyle, flex:1, width:"auto" }}
          />
          {pairs.length > 1 && (
            <button onClick={() => remove(i)}
              style={{ background:"none", border:"none", color:"#774444", fontSize:15, cursor:"pointer", padding:"0 2px" }}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button onClick={add} style={{
        background:"none", border:`1px dashed ${inputBdr||"#3a3a60"}`, color: inputColor ? inputBdr||"#6060a0" : "#6060a0",
        borderRadius:5, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit",
      }}>{addLabel}</button>
    </div>
  );
}

