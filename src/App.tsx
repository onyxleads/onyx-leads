import { useState, useEffect } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { MainDashboard } from "./components/MainDashboard";
import { ADVISORS_FALLBACK, fetchAdvisors, getUserRole } from "./lib/advisors";
import { supabase } from "./lib/supabase";

/* ─── CRMApp — שומר שער (Auth בלבד) ────────────────────────────────────────
   רכיב זה אחראי אך ורק על מצב ה-Auth.
   הוא מציג: טעינה / מסך כניסה / MainDashboard לפי מצב ה-session.
   כל ה-hooks של CRM נמצאים ב-MainDashboard — אין hooks לאחר return מותנה.
   ────────────────────────────────────────────────────────────────────────── */
function CRMApp() {
  const [authSession, setAuthSession] = useState(undefined); // undefined=בודק | null=לא מחובר | object=מחובר
  const [userRole,    setUserRole]    = useState(null);
  const [advisors,    setAdvisors]    = useState(ADVISORS_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    // טען את רשימת היועצים, ואז קבע session + תפקיד
    fetchAdvisors().then(list => {
      if (cancelled) return;
      setAdvisors(list);

      supabase?.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        setAuthSession(session ?? null);
        setUserRole(session ? getUserRole(session.user, list) : null);
      });

      const { data: sub } = supabase?.auth.onAuthStateChange((_e, session) => {
        setAuthSession(session ?? null);
        setUserRole(session ? getUserRole(session.user, list) : null);
      }) ?? {};
      cancelled && sub?.subscription?.unsubscribe();
    });
    return () => { cancelled = true; };
  }, []);

  // רענון רשימת היועצים (נקרא מפאנל הניהול — חשוב: חייב לרענן גם תפקיד,
  // כי promote/demote לאדמין משנה את advisors.role, שהוא מקור האמת ל-getUserRole)
  const reloadAdvisors = async () => {
    const list = await fetchAdvisors();
    setAdvisors(list);
    if (authSession) setUserRole(getUserRole(authSession.user, list));
  };

  const handleLogout = async () => { await supabase?.auth.signOut(); };

  // ── טעינה (בודק session) ──
  if (authSession === undefined) return (
    <div style={{
      minHeight:"100vh", background:"#f0eeff",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Heebo',sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{
          width:48, height:48, borderRadius:12,
          background:"linear-gradient(135deg,#7c6fcd,#2d88d4)",
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontWeight:900, fontSize:22, color:"#fff", marginBottom:14,
          animation:"spin 1.8s linear infinite",
        }}>O</div>
        <div style={{ color:"#8080b0", fontSize:13 }}>טוען…</div>
      </div>
    </div>
  );

  // ── אין session → מסך כניסה ──
  if (!authSession) return <LoginScreen />;

  // ── יש session → Dashboard ──
  return <MainDashboard
    userRole={userRole}
    userEmail={authSession.user?.email || ""}
    advisors={advisors}
    onReloadAdvisors={reloadAdvisors}
    onLogout={handleLogout}
  />;
}


export default CRMApp;
