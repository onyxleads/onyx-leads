import { useState } from "react";
import { supabase } from "../lib/supabase";

/* ─── מסך התחברות — Supabase Auth ─────────────────────────────────────────── */
export function LoginScreen({ onSuccess }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("נא להזין אימייל וסיסמה"); return; }
    if (!supabase) { setError("חיבור ל-Supabase לא מוגדר"); return; }
    setLoading(true); setError("");
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (authErr) {
      const msg =
        authErr.message.includes("Invalid login") ? "אימייל או סיסמה שגויים" :
        authErr.message.includes("Email not confirmed") ? "יש לאשר את כתובת המייל" :
        authErr.message;
      setError(msg);
    }
    // הצלחה — onAuthStateChange ב-CRMApp יטפל בהמשך
  };

  return (
    <div dir="rtl" style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#f0eeff 0%,#e8f0ff 50%,#f4f0ff 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Heebo',sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{
        background:"#ffffff", borderRadius:20,
        border:"1px solid #d8d0f0",
        padding:"40px 36px", width:360, maxWidth:"92vw",
        boxShadow:"0 16px 60px rgba(100,80,200,.18)",
        animation:"fadeUp .3s ease",
      }}>
        {/* לוגו */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{
            width:52, height:52, borderRadius:13,
            background:"linear-gradient(135deg,#7c6fcd,#2d88d4)",
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            fontWeight:900, fontSize:24, color:"#fff",
            boxShadow:"0 0 24px #6c5ecf44", marginBottom:12,
          }}>O</div>
          <div style={{ fontSize:19, fontWeight:900, color:"#1a1a3a", marginBottom:4 }}>Onyx Mortgages</div>
          <div style={{ fontSize:12, color:"#8080b0" }}>מערכת ניהול משכנתאות</div>
        </div>

        {/* שדה אימייל */}
        <div style={{ marginBottom:12 }}>
          <label style={{ display:"block", fontSize:11, color:"#7070a0", fontWeight:700, marginBottom:5 }}>אימייל</label>
          <input
            type="email" value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key==="Enter" && handleLogin()}
            placeholder="your@email.com"
            dir="ltr"
            disabled={loading}
            style={{
              width:"100%", padding:"11px 14px",
              background:"#f4f2ff", border:"2px solid #d0c8f0",
              borderRadius:10, fontSize:14, outline:"none",
              fontFamily:"inherit", color:"#2a2050",
            }}
            autoFocus
          />
        </div>

        {/* שדה סיסמה */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:11, color:"#7070a0", fontWeight:700, marginBottom:5 }}>סיסמה</label>
          <input
            type="password" value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => e.key==="Enter" && handleLogin()}
            placeholder="••••••••"
            disabled={loading}
            style={{
              width:"100%", padding:"11px 14px",
              background:"#f4f2ff", border:"2px solid #d0c8f0",
              borderRadius:10, fontSize:14, outline:"none",
              fontFamily:"inherit", color:"#2a2050",
            }}
          />
        </div>

        {/* שגיאה */}
        {error && (
          <div style={{
            background:"#fff0f0", border:"1px solid #f0b0b0",
            borderRadius:8, padding:"8px 12px", marginBottom:14,
            color:"#c03030", fontSize:13, fontWeight:700,
            display:"flex", alignItems:"center", gap:7,
          }}>⚠️ {error}</div>
        )}

        {/* כניסה */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width:"100%", padding:"12px",
            background: loading ? "#c0b8e8" : "linear-gradient(135deg,#7c6fcd,#2d88d4)",
            color:"#fff", border:"none", borderRadius:10,
            fontSize:15, fontWeight:900,
            cursor: loading ? "default" : "pointer",
            boxShadow:"0 4px 18px #6c5ecf33",
            transition:"background .2s",
          }}
        >{loading ? "מתחבר…" : "כניסה למערכת"}</button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:"#b0b0c8" }}>
          גישה לעובדי WISELI בלבד
        </div>
      </div>
    </div>
  );
}

