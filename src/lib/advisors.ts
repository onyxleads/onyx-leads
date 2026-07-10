import { supabase } from "./supabase";

/* ─── רישום יועצים ───────────────────────────────────────────────────────────
   רשימת היועצים נטענת מטבלת "advisors" ב-Supabase (ניהול דינמי).
   מנהל המערכת (אדמין) הוא כל אימייל שאינו ברשימת היועצים.
   הרשימה הקשיחה כאן משמשת רק כ-fallback אם הטבלה לא זמינה.
   ────────────────────────────────────────────────────────────────────────── */
export const ADVISORS_FALLBACK = [
  { email: "tom@bereshit.biz", name: "תום" },
];

// ── אימייל ה-Super Admin היחיד במערכת — קשיח בקוד, לא ניתן לשינוי/הדחה ──
// כל בדיקת super_admin עוברת דרך הקבוע הזה, אף פעם לא רק לפי metadata,
// כך שגם אם מישהו ישנה בטעות (או בזדון) את ה-user_metadata שלו ב-Supabase,
// הבדיקה כאן עדיין תזהה אותו נכון לפי כתובת המייל הקבועה.
export const SUPER_ADMIN_EMAIL = "bo4wiseli@gmail.com";

// קובע תפקיד לפי אובייקט המשתמש המלא מ-Supabase Auth (session.user) + רשימת advisors.
// היררכיה תלת-שכבתית, נבדקת בסדר עדיפויות קשיח:
//   1. super_admin  — רק bo4wiseli@gmail.com, תמיד, ללא יוצא מן הכלל, לא תלוי בשום טבלה
//   2. admin        — advisors.role==='admin' (המקור העיקרי, ניתן לעדכון מ"ניהול מוכרנים"),
//                      או user_metadata.role כגיבוי משני אם הוגדר ידנית ב-Supabase Dashboard
//   3. sales        — ברירת המחדל לכל משתמש אחר (מודל בעלות-סוכן מבודד, advisor_email===email)
export const getUserRole = (user, advisorList = ADVISORS_FALLBACK) => {
  if (!user) return null;
  const email = (user.email || "").toLowerCase().trim();
  if (email === SUPER_ADMIN_EMAIL) return "super_admin";
  const meta = user.user_metadata || {};
  if (meta.role === "admin" || meta.role === "super_admin" || meta.is_admin === true) return "admin";
  const row = advisorList.find(a => (a.email || "").toLowerCase().trim() === email);
  if (row && (row.role === "admin" || row.role === "super_admin")) return "admin";
  return "sales";
};

// תאימות לאחור: גרסה ישנה שמקבלת אימייל בלבד (ללא metadata) — נשמרת למקרים שאין session מלא זמין
export const getRoleByEmail = (email) =>
  (email || "").toLowerCase().trim() === SUPER_ADMIN_EMAIL ? "super_admin" : "sales";

// שם תצוגה של יועץ לפי אימייל
export const getAdvisorName = (email, advisorList = ADVISORS_FALLBACK) =>
  advisorList.find(a => a.email === (email || "").toLowerCase().trim())?.name
  || email || "";

// טעינת רשימת יועצים מ-Supabase
export const fetchAdvisors = async () => {
  if (!supabase) return ADVISORS_FALLBACK;
  try {
    const { data, error } = await supabase
      .from("advisors")
      .select("email, name, role")
      .order("name", { ascending: true });
    if (error || !data) return ADVISORS_FALLBACK;
    return data.map(a => ({ email: (a.email||"").toLowerCase().trim(), name: a.name || a.email, role: a.role || "sales" }));
  } catch {
    return ADVISORS_FALLBACK;
  }
};


