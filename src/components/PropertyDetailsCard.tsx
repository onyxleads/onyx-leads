import { useState, useEffect } from "react";

/* ─── כרטיסיית פרטי הנכס למכירה ──────────────────────────────────────────── */
/* ─── שדה הערות המוכר במודעה — Textarea מתרחב עם שמירה אוטומטית ב-blur ──────
   רכיב נפרד (לא inline) כדי למנוע איבוד פוקוס בזמן הקלדת פסקאות ארוכות:
   רכיב מוגדר-inline מקבל זהות חדשה בכל render ועלול לגרום ל-React למאונט מחדש
   את ה-textarea ולאבד את הסמן. כאן ה-state מקומי ונשמר רק ב-blur. */
export function PropertyNotesField({ value, onSave, label, icon, inputBg, cardBdr, textMain, textSub }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  return (
    <div style={{ gridColumn:"1 / -1" }}>
      <label style={{ fontSize:11, fontWeight:700, color:textSub, marginBottom:5, display:"flex", alignItems:"center", gap:5 }}>
        <span>{icon}</span>{label}
      </label>
      <textarea
        className="wiseli-prop-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value || "")) onSave(draft); }}
        placeholder="הדבק כאן את תיאור המודעה המלא של המוכר…"
        dir="rtl"
        rows={3}
        style={{
          width:"100%", boxSizing:"border-box", fontSize:13, lineHeight:1.6,
          color:textMain,
          background:inputBg, border:`1px solid ${cardBdr}`, borderRadius:7,
          padding:"9px 11px", outline:"none", fontFamily:"inherit",
          resize:"vertical", minHeight:64,
        }}
      />
    </div>
  );
}

/* ─── שדה טקסט בודד בכרטיסיית הנכס — רכיב top-level (לא inline!) ────────────
   קריטי: הרכיב הזה חייב להיות מוגדר ברמת המודול ולא בתוך PropertyDetailsCard.
   כשהוא היה מוגדר inline, כל הקלדה גרמה ל-onUpdate→render→זהות-פונקציה-חדשה,
   ו-React מאונט מחדש את ה-<input> ומאבד פוקוס אחרי כל תו. כרכיב יציב ברמת
   המודול, ה-<input> נשאר ממואנט והפוקוס נשמר. */
export function PropertyTextField({ value, onChange, label, icon, type="text", placeholder="", inputBg, cardBdr, textMain, textSub }) {
  const isDate = type === "date";
  // סגנון בסיס זהה לחלוטין לכל סוגי השדות — גובה, padding, גבול ויישור אנכי.
  // הערה: לא קובעים WebkitTextFillColor כאן — הוא דרס את צבע ה-::placeholder ב-WebKit
  // (Safari/iOS) וגרם ל-placeholder להיראות כהה כמו טקסט אמיתי.
  const baseInputStyle = {
    width:"100%", boxSizing:"border-box", fontSize:13, height:38, lineHeight:"20px",
    color: (isDate && !value) ? textSub : textMain,
    background:inputBg, border:`1px solid ${cardBdr}`, borderRadius:7,
    padding:"0 11px", outline:"none", fontFamily:"inherit",
    display:"block", margin:0, verticalAlign:"middle",
    // איפוס מראה ברירת-המחדל של input[type=date] בספארי/וובקיט כדי שיתנהג כמו שדה טקסט
    WebkitAppearance:"none", MozAppearance:"textfield", appearance:"none",
  };
  return (
    <div>
      <label style={{ fontSize:11, fontWeight:700, color:textSub, marginBottom:5, display:"flex", alignItems:"center", gap:5 }}>
        <span>{icon}</span>{label}
      </label>
      {isDate ? (
        // שדה תאריך — עטיפה בגובה קבוע זהה לשדות הטקסט, עם כפתור ניקוי
        <div style={{ position:"relative", width:"100%", height:38 }}>
          <input
            className="wiseli-prop-input"
            type="date"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            dir="rtl"
            style={{ ...baseInputStyle, paddingLeft: value ? 30 : 11 }}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              title="נקה תאריך"
              style={{
                position:"absolute", left:6, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:textSub, fontSize:15,
                cursor:"pointer", padding:"0 4px", lineHeight:1,
              }}
            >✕</button>
          )}
        </div>
      ) : (
        <input
          className="wiseli-prop-input"
          type={type}
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          dir={type==="number" ? "ltr" : "rtl"}
          style={baseInputStyle}
        />
      )}
    </div>
  );
}

export function PropertyDetailsCard({ client, onUpdate, theme:TH={} }) {
  const isLight  = TH.name === "Light Mode";
  const cardBg   = TH.drawerCard    || "#12122a";
  const cardBdr  = TH.drawerBorder  || "#2a2a48";
  const inputBg  = TH.drawerInput   || "#1a1a2e";
  const textMain = TH.drawerText    || "#d8d8f0";
  const textSub  = TH.drawerSubText || "#8080b0";
  const TEAL     = "#1a8a8a";

  const set = (field, val) => onUpdate && onUpdate(client.id, field, val);

  // עזר ליצירת שדה — מעביר את כל ה-props היציבים לרכיב ה-top-level
  const fld = (field, label, icon, opts={}) => (
    <PropertyTextField
      value={client[field]}
      onChange={val => set(field, val)}
      label={label} icon={icon}
      type={opts.type || "text"} placeholder={opts.placeholder || ""}
      inputBg={inputBg} cardBdr={cardBdr} textMain={textMain} textSub={textSub}
    />
  );

  return (
    <div style={{
      background:cardBg, borderRadius:12,
      border:`1px solid ${TEAL}66`, marginTop:24, marginBottom:24, overflow:"hidden",
    }}>
      {/* צבע placeholder אחיד ועדין לכל שדות הכרטיסייה (input + textarea).
          !important מבטיח שהכלל ינצח כל צבע טקסט שמוגדר inline על השדה. */}
      <style>{`
        .wiseli-prop-input::placeholder{color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;opacity:1 !important;-webkit-text-fill-color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;}
        .wiseli-prop-input::-webkit-input-placeholder{color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;-webkit-text-fill-color:${isLight ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.50)"} !important;}
      `}</style>
      {/* כותרת */}
      <div style={{
        background: isLight ? "linear-gradient(135deg,#e8f6f6,#d8f0f0)" : "linear-gradient(135deg,#0a2424,#0d1f1f)",
        borderBottom:`1px solid ${TEAL}55`,
        padding:"11px 16px", display:"flex", alignItems:"center", gap:9,
      }}>
        <span style={{ fontSize:16 }}>🏠</span>
        <span style={{ fontSize:13, fontWeight:900, color:TEAL, letterSpacing:.5, textTransform:"uppercase" }}>פרטי הנכס למכירה</span>
      </div>

      {/* גריד שדות — 2 עמודות, RTL (השדה הראשון בכל זוג מופיע מימין) */}
      <div style={{
        padding:"16px", display:"grid",
        gridTemplateColumns:"1fr 1fr", gap:16,
      }}>
        {/* שורה 1: רחוב + מספר בית */}
        {fld("property_street",       "רחוב",            "📍", { placeholder:"שם הרחוב…" })}
        {fld("property_house_number", "מספר בית",        "🔢", { placeholder:"מס׳…" })}
        {/* שורה 2: שכונה + עיר */}
        {fld("property_neighborhood", "שכונה",           "🏘️", { placeholder:"שם השכונה…" })}
        {fld("property_city",         "עיר",             "🏙️", { placeholder:"שם העיר…" })}
        {/* שורה 3: גודל בנוי במ״ר + מספר חדרים */}
        {fld("property_size_sqm",     "גודל בנוי במ״ר",  "📐", { type:"number", placeholder:"0" })}
        {fld("property_rooms",        "מספר חדרים",      "🛏️", { type:"number", placeholder:"0" })}
        {/* שורה 4: קומה + סוג הנכס */}
        {fld("property_floor",        "קומה",            "🏢", { placeholder:"קרקע / 1 / 2…" })}
        {fld("property_type",         "סוג הנכס",        "🏠", { placeholder:"דירה / פנטהאוז…" })}
        {/* שורה 5: מרפסת + ממ״ד */}
        {fld("property_balcony",      "מרפסת",           "🌿", { placeholder:"מרפסת שמש 12 מ״ר…" })}
        {fld("property_mamad",        "ממ״ד",            "🛡️", { placeholder:"יש / אין / תיאור…" })}
        {/* שורה 6: חניה + מעלית */}
        {fld("property_parking",      "חניה",            "🚗", { placeholder:"חניה כפולה מקורה…" })}
        {fld("property_elevator",     "מעלית",           "🛗", { placeholder:"יש מעלית / אין…" })}
        {/* שורה 7: מצב הנכס + מחיר מבוקש */}
        {fld("property_condition",    "מצב הנכס",        "🛠️", { placeholder:"חדש / משופץ…" })}
        {fld("property_price",        "מחיר מבוקש",      "💰", { type:"number", placeholder:"₪" })}
        {/* שורה 8: נמצאת בשוק מאז + פורסם ב- */}
        {fld("property_on_market_since", "נמצאת בשוק מאז", "📅", { type:"date" })}
        {fld("property_published_on", "פורסם ב-",        "📰", { placeholder:"יד2 / פייסבוק / מדלן…" })}
        {/* שורה 9: לינק למודעה — רוחב מלא */}
        <div style={{ gridColumn:"1 / -1" }}>
          <PropertyTextField
            value={client.property_ad_link}
            onChange={val => set("property_ad_link", val)}
            label="לינק למודעה" icon="🔗"
            placeholder="הדבק כאן קישור ישיר למודעה (יד2, פייסבוק, מדלן וכו')..."
            inputBg={inputBg} cardBdr={cardBdr} textMain={textMain} textSub={textSub}
          />
        </div>
        {/* שורה 10: הערות המוכר במודעה — רוחב מלא */}
        <PropertyNotesField
          value={client.property_seller_notes}
          onSave={val => set("property_seller_notes", val)}
          label="הערות המוכר במודעה"
          icon="📝"
          inputBg={inputBg} cardBdr={cardBdr} textMain={textMain} textSub={textSub}
        />
      </div>
    </div>
  );
}

