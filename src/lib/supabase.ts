import { createClient } from "@supabase/supabase-js";


/* ══════════════════════════════════════════════════════════════════════════════
   ─── Supabase — חיבור מסד נתונים חי ─────────────────────────────────────────
   גישה ישירה עם Anon Key, ללא מסך כניסה.
   הגדר ב-Vercel / .env:
     VITE_SUPABASE_URL      = https://xxxx.supabase.co
     VITE_SUPABASE_ANON_KEY = eyJ...
   ════════════════════════════════════════════════════════════════════════════ */
export const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = SUPABASE_URL && SUPABASE_ANON
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,      // שמור את הסשן ב-localStorage בין רענונים
        autoRefreshToken: true,    // רענן את ה-JWT אוטומטית לפני פקיעה
        detectSessionInUrl: true,  // טפל ב-callback של התחברות
      },
    })
  : null;

