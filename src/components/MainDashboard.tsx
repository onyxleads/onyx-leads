import { useState, useEffect, useCallback, useMemo } from "react";
import { AdvisorManagementPanel, UNASSIGNED_POOL_EMAIL } from "./AdvisorManagementPanel";
import { BulkActionBar } from "./BulkActionBar";
import { CalendarView } from "./CalendarView";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { FontSizePanel } from "./FontSizePanel";
import { ImportLeadsModal } from "./ImportLeadsModal";
import { PipelineStageManager } from "./PipelineStageManager";
import { TimelineDrawer } from "./TimelineDrawer";
import { UnifiedTable } from "./UnifiedTable";
import { WhatsAppTemplatesPanel } from "./WhatsAppTemplatesPanel";
import { useColumns } from "./columns";
import { ADVISORS_FALLBACK, getAdvisorName } from "../lib/advisors";
import { PHASES } from "../lib/constants";
import { migrateClientRows } from "../lib/migrate";
import { supabase } from "../lib/supabase";
import { DEFAULT_FONT_SIZES, DEFAULT_THEME, LIGHT_ORIGINAL } from "../lib/theme";
import { LS, mkClient, nowTimeStr, sanitizeClientPayload, todayStr } from "../lib/utils";

export function MainDashboard({ userRole, userEmail, advisors = ADVISORS_FALLBACK, onReloadAdvisors, onLogout }) {
  // ── מודל 3 רמות: super_admin (קשיח, bo4wiseli@gmail.com בלבד) / admin (metadata) / sales (ברירת מחדל) ──
  const isSuperAdmin = userRole === "super_admin";
  const isAdmin       = userRole === "admin" || isSuperAdmin; // super_admin הוא תמיד גם admin לצורך הרשאות
  const isSales        = !isAdmin; // "איש מכירות" — מבודד לחלוטין ללידים שלו (advisor_email===email)

  // רשימת מוכרנים "נקייה" לתפריטים/דרופדאונים — לא כוללת את פרופיל הסינון
  // "לידים ולקוחות למיון", שהוא יעד מערכתי טכני ולא מוכרן אמיתי לבחירה
  const selectableAdvisors = useMemo(
    () => advisors.filter(a => a.email !== UNASSIGNED_POOL_EMAIL),
    [advisors]
  );

  // פאנל ניהול מוכרנים — נגיש רק לאדמין/סופר-אדמין (לא לאנשי מכירות רגילים)
  const [showAdvisorMgmt, setShowAdvisorMgmt] = useState(false);

  // בורר "כל המוכרנים" — רלוונטי ופועל רק לאדמין/סופר-אדמין; איש מכירות תמיד נעול על עצמו
  const myEmailNorm = (userEmail || "").toLowerCase().trim();
  const [selectedAdvisor, setSelectedAdvisor] = useState(isAdmin ? "all" : myEmailNorm);

  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [dbError,      setDbError]      = useState(null);
  const [dbErrorVisible, setDbErrorVisible] = useState(false);
  const [activeClient, setActiveClient] = useState(null);

  // ── שמירת הבאנר בתצוגה רגע נוסף אחרי שdbError מתאפס, כדי לאפשר אנימציית fade-out חלקה ──
  useEffect(() => {
    if (dbError) { setDbErrorVisible(true); return; }
    if (!dbErrorVisible) return; // כבר מוסתר — אין צורך בטיימר
    const t = setTimeout(() => setDbErrorVisible(false), 350); // תואם למשך dbErrorOut
    return () => clearTimeout(t);
  }, [dbError]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [toast,        setToast]        = useState(null); // {msg, type}
  const [refreshTick,  setRefreshTick]  = useState(0);    // הגדלה → רענון ידני של הנתונים
  const [refreshing,   setRefreshing]   = useState(false);// אנימציית סיבוב בזמן רענון
  const [showWaTemplates, setShowWaTemplates] = useState(false); // מנהל תבניות ווטסאפ

  // 5 תבניות ווטסאפ גלובליות — נשמרות ב-localStorage (קונפיג ברמת-אפליקציה כמו ערכת צבעים).
  // מבנה: { id, title, body }. ה-title נשמר/מוצג כ-"{מספר} - {כותרת}".
  // נרמול תבניות: בדיוק 6, תבנית 1 תמיד "רישום חופשי" (כותרת נעולה).
  const normalizeWaTemplates = (arr) => {
    const base = [
      { id: 1, title: "רישום חופשי", body: "" },
      { id: 2, title: "תזכורת",       body: "" },
      { id: 3, title: "מעקב",          body: "" },
      { id: 4, title: "הצעת מחיר",     body: "" },
      { id: 5, title: "סגירה",         body: "" },
      { id: 6, title: "תבנית 6",       body: "" },
    ];
    const src = Array.isArray(arr) ? arr : [];
    return base.map(def => {
      const existing = src.find(t => Number(t.id) === def.id);
      if (def.id === 1) return { id: 1, title: "רישום חופשי", body: existing?.body || "" }; // כותרת נעולה
      return existing ? { id: def.id, title: existing.title || def.title, body: existing.body || "" } : def;
    });
  };

  const [waTemplates, setWaTemplates] = useState(() =>
    normalizeWaTemplates(LS.get("wiseli_wa_templates", null))
  );
  const saveWaTemplates = useCallback((next) => {
    const normalized = normalizeWaTemplates(next);
    setWaTemplates(normalized);
    LS.set("wiseli_wa_templates", normalized);
  }, []);

  // רענון ידני — מפעיל מחדש את שליפת הלקוחות + טעינת המוכרנים
  // ── שלבי הצנרת — מקור האמת הדינמי מטבלת pipeline_stages ב-Supabase ──
  // PHASES משמש כ-seed/נפילה-אחורה בלבד אם הטבלה לא נטענת (מונע דשבורד ריק).
  // חשוב: מוצהר לפני ה-handlers של ניהול השלבים, שמפנים אליו במערכי התלות.
  const [pipelineStages, setPipelineStages] = useState(() =>
    PHASES.map((p, i) => ({ id: p.id, label: p.label, color: p.color, sort_order: i, is_archive: p.id === "archive" }))
  );
  const [stagesTick, setStagesTick] = useState(0);
  const [showStageManager, setShowStageManager] = useState(false);

  const loadPipelineStages = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("pipeline_stages").select("*").order("sort_order", { ascending: true });
    if (error) {
      console.warn("טעינת pipeline_stages נכשלה — משתמש בברירת מחדל מקומית:", error.message);
      return;
    }
    if (Array.isArray(data) && data.length) setPipelineStages(data);
  }, []);
  useEffect(() => { loadPipelineStages(); }, [loadPipelineStages, stagesTick]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshTick(t => t + 1);          // מפעיל מחדש את useEffect של שליפת הלקוחות
    try { if (onReloadAdvisors) await onReloadAdvisors(); } catch (e) { console.error(e); }
    // השאר את הסיבוב לפחות 600ms לחיווי ויזואלי נעים
    setTimeout(() => setRefreshing(false), 700);
  }, [onReloadAdvisors]);

  // ════════════════ ניהול שלבי מכירות (אדמין/סופר-אדמין בלבד) ════════════════
  // כל הפעולות מוגנות בבדיקת isAdmin בנוסף ל-RLS ברמת ה-DB.
  const persistStages = useCallback(async (nextStages) => {
    setPipelineStages(nextStages); // עדכון אופטימי
    if (!supabase) return { error: null };
    // upsert מלא של כל השורות (פשוט ועמיד לשינויי סדר/צבע/שם/ארכיון)
    const rows = nextStages.map(s => ({
      id: s.id, label: s.label, color: s.color,
      sort_order: s.sort_order, is_archive: !!s.is_archive,
    }));
    const { error } = await supabase.from("pipeline_stages").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("שגיאת שמירת שלבים:", error.message);
      // זיהוי שגיאת סכמה (טבלה/עמודה חסרה) — הודעה ברורה ופעולתית
      if (/schema cache|could not find|does not exist|relation .* does not exist/i.test(error.message || "")) {
        return { error: { ...error, message: "טבלת pipeline_stages חסרה או לא מעודכנת ב-Supabase. הרץ את קובץ ה-SQL (wiseli_pipeline_stages_FIX.sql) ב-SQL Editor, ואז רענן." } };
      }
    }
    return { error };
  }, []);

  const addStage = useCallback(async (label, color) => {
    if (!isAdmin) return;
    const name = (label || "").trim();
    if (!name) { alert("יש להזין שם לשלב."); return; }
    // מזהה יציב ייחודי (לא תלוי בשם — שינוי שם בעתיד לא ישבור לידים)
    const id = `stage_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const maxOrder = pipelineStages.reduce((m, s) => Math.max(m, s.sort_order ?? 0), -1);
    const next = [...pipelineStages, { id, label: name, color: color || "#7c6fcd", sort_order: maxOrder + 1, is_archive: false }];
    const { error } = await persistStages(next);
    if (error) setToast({ msg: `שגיאה בהוספת שלב: ${error.message}`, type: "error" });
    else setToast({ msg: `השלב "${name}" נוסף`, type: "success" });
  }, [isAdmin, pipelineStages, persistStages]);

  const updateStage = useCallback(async (id, patch) => {
    if (!isAdmin) return;
    // שינוי שם = שינוי label בלבד. clients.phase שומר id יציב — אין צורך ב-cascade.
    const next = pipelineStages.map(s => s.id === id ? { ...s, ...patch } : s);
    const { error } = await persistStages(next);
    if (error) setToast({ msg: `שגיאה בעדכון שלב: ${error.message}`, type: "error" });
  }, [isAdmin, pipelineStages, persistStages]);

  const deleteStage = useCallback(async (id) => {
    if (!isAdmin) return;
    // הגנת בטיחות: אסור למחוק שלב עם לקוחות פעילים
    const count = clients.filter(c => c.phase === id).length;
    if (count > 0) {
      alert("לא ניתן למחוק שלב זה כיוון שיש בו לקוחות פעילים. העבר אותם שלב תחילה.");
      return;
    }
    if (!window.confirm("למחוק את השלב? פעולה זו אינה ניתנת לביטול.")) return;
    const next = pipelineStages.filter(s => s.id !== id).map((s, i) => ({ ...s, sort_order: i }));
    setPipelineStages(next);
    if (supabase) {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) { setToast({ msg: `שגיאה במחיקה: ${error.message}`, type: "error" }); return; }
      await persistStages(next); // עדכון sort_order לשאר
    }
    setToast({ msg: "השלב נמחק", type: "success" });
  }, [isAdmin, clients, pipelineStages, persistStages]);

  const reorderStage = useCallback(async (id, dir) => {
    if (!isAdmin) return;
    const sorted = [...pipelineStages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapWith = dir === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    [sorted[idx], sorted[swapWith]] = [sorted[swapWith], sorted[idx]];
    const next = sorted.map((s, i) => ({ ...s, sort_order: i }));
    const { error } = await persistStages(next);
    if (error) setToast({ msg: `שגיאה בשינוי סדר: ${error.message}`, type: "error" });
  }, [isAdmin, pipelineStages, persistStages]);

  // טוסט הצלחה/שגיאה — נעלם אוטומטית
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // נעילת גלילת הרקע כשלוח השנה פתוח
  useEffect(() => {
    if (showCalendar) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [showCalendar]);

  const [showColors,   setShowColors]   = useState(false);
  const [showFont,     setShowFont]     = useState(false);
  const [theme,        setTheme]        = useState(() => LS.get("onyx_theme", DEFAULT_THEME));
  const [phaseColors,  setPhaseColors]  = useState(() => LS.get("onyx_phase_colors", DEFAULT_THEME.phases));
  const [fontSizes,    setFontSizes]    = useState(() => LS.get("onyx_font_sizes", DEFAULT_FONT_SIZES));

  const colControls = useColumns();

  /* ── טעינת לקוחות מ-Supabase ──
     מודל 3 רמות:
       • איש מכירות (sales) — תמיד מסונן אך ורק ללידים שלו (advisor_email===email).
       • admin/super_admin — שולף הכל כברירת מחדל, או מסנן לפי selectedAdvisor אם נבחר סוכן ספציפי.
     הסינון כאן הוא תיאום UI בלבד — האכיפה האמיתית היא ב-RLS של Supabase (ראה
     wiseli_rls_3tier_update.sql), שבודק את אותו תנאי בדיוק ברמת ה-DB.
     ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!supabase) {
      setClients([]);
      setDbError("משתני הסביבה לא מוגדרים");
      setLoading(false);
      return;
    }
    // קביעת מסנן: sales תמיד נעול על עצמו; admin/super_admin לפי selectedAdvisor ("all" = הכל)
    const filterEmail = isSales
      ? myEmailNorm
      : (selectedAdvisor !== "all" ? selectedAdvisor : null);

    let query = supabase.from("clients").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
    if (filterEmail) query = query.eq("advisor_email", filterEmail);
    query.then(({ data, error }) => {
      if (cancelled) return;
      // ── עמודת sort_order חסרה בטבלה (סכמה ישנה/לא מעודכנת) ──
      // נסה שוב ללא מיון לפי sort_order, כדי שהאפליקציה תמשיך לעבוד
      // (להוספת העמודה בפועל: ראה ה-SQL בהערה למעלה ב-PHASES, יש להריץ פעם אחת ב-Supabase SQL editor)
      if (error && /sort_order/i.test(error.message || "")) {
        console.warn("עמודת sort_order חסרה ב-DB — שולף ללא מיון לפי סדר ידני. הרץ את ה-ALTER TABLE המצורף כדי לתקן לצמיתות.");
        let fallbackQuery = supabase.from("clients").select("*").order("created_at", { ascending: true });
        if (filterEmail) fallbackQuery = fallbackQuery.eq("advisor_email", filterEmail);
        fallbackQuery.then(({ data: fbData, error: fbError }) => {
          if (cancelled) return;
          if (fbError) { setDbError(fbError.message); setClients([]); setLoading(false); return; }
          setDbError("עמודת sort_order חסרה בטבלת clients — הסדר הידני מושבת עד שהעמודה תתווסף (ראה הוראות SQL)");
          setClients(migrateClientRows(fbData));
          setLoading(false);
        });
        return;
      }
      if (error) { setDbError(error.message); setClients([]); setLoading(false); return; }
      setClients(migrateClientRows(data));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isSales, myEmailNorm, selectedAdvisor, refreshTick]);

  const handleThemeChange  = useCallback((t) => { setTheme(t);       LS.set("onyx_theme", t); }, []);
  const handlePhasesChange = useCallback((p) => { setPhaseColors(p); LS.set("onyx_phase_colors", p); }, []);
  const handleFontChange   = useCallback((f) => { setFontSizes(f);   LS.set("onyx_font_sizes", f); }, []);

  // ── מיפוי שלבים לתצוגה — נגזר מטבלת pipeline_stages (מקור האמת) ──
  // כל שלב מביא את הצבע וה-is_archive שלו מה-DB. dim נגזר מהצבע לרקע מעומעם.
  const themedPhases = useMemo(() =>
    [...pipelineStages]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(p => ({
        id: p.id,
        label: p.label,
        color: p.color || "#7c6fcd",
        dim: (p.color || "#7c6fcd") + "30",
        is_archive: !!p.is_archive,
      })),
  [pipelineStages]);

  // קבוצת מזהי שלבי ארכיון — לסינון מטריקות
  const archivePhaseIds = useMemo(() => new Set(themedPhases.filter(p => p.is_archive).map(p => p.id)), [themedPhases]);

  /* ── המרת אובייקט לקוח → שורת DB ── */
  const toDbRow = useCallback((obj) => {
    try {
      const row = {};
      // הערה: collateral_security_date/signing_date, mortgage_*, final_execution_*,
      // insurance_*, signing_day_order/final_day_order, approvals, requested_mix —
      // כל אלה הוסרו מהרשימה הלבנה. אין יותר שום רכיב UI שכותב אליהם (ApprovalCard,
      // ExecutionDates, ושלושת פריטי הצ'ק-ליסט שהוסרו — כולם נמחקו). collateral_approval_date
      // ו-collateral_appraisal_date נשארים: הם עדיין גב הנתונים של "נשלח WhatsApp"/"נשלח Email"
      // בצ'ק-ליסט (רק שונה התווית/אייקון, לא העמודה עצמה).
      const SCALAR = ["id","phase","name","first_name","last_name","handler","opFor","case_type","lead_source","advisor_email","fee","fee_paid_notes","description","dropbox_url","collateral_approval_date","collateral_appraisal_date","fee_paid_date","property_street","property_house_number","property_neighborhood","property_city","property_floor","property_type","property_condition","property_mamad","property_on_market_since","property_published_on","property_balcony","property_elevator","property_parking","property_seller_notes","property_ad_link","whatsapp_initial_sent_at"];
      const DATE_COLS = ["collateral_approval_date","collateral_appraisal_date","fee_paid_date","property_on_market_since","whatsapp_initial_sent_at"];
      SCALAR.forEach(k => {
        if (!(k in obj)) return;
        // עמודות date — מחרוזת ריקה הופכת ל-null (Postgres דוחה "" עבור date)
        if (DATE_COLS.includes(k)) row[k] = obj[k] ? obj[k] : null;
        else row[k] = obj[k] ?? "";
      });
      // עמודות boolean — V ביצוע
      const BOOL = ["collateral_approval_completed","collateral_appraisal_completed","fee_paid"];
      BOOL.forEach(k => { if (k in obj) row[k] = !!obj[k]; });
      // עמודות מספריות — מחרוזת ריקה/לא-תקינה הופכת ל-null (Postgres דוחה "" עבור NUMERIC).
      // כולל את שדות הנכס המספריים (גודל/חדרים/מחיר) שגרמו לקריסת "invalid input syntax for type numeric".
      // null תקין גם ל-NUMERIC וגם ל-TEXT, כך שהתיקון בטוח ללא תלות בטיפוס העמודה בפועל.
      const NUM = ["sort_order","property_size_sqm","property_rooms","property_price"];
      NUM.forEach(k => {
        if (!(k in obj)) return;
        const v = obj[k];
        if (v === null || v === undefined || String(v).trim() === "" || isNaN(Number(v))) row[k] = null;
        else row[k] = Number(v);
      });
      const JSONB = ["banks","phones","tids","timeline","custom_calendar_events","emails_list","securities","whatsapp_log"];
      JSONB.forEach(k => {
        if (!(k in obj)) return;
        const v = obj[k];
        if (typeof v === "string") { try { row[k] = JSON.parse(v); } catch { row[k] = (k==="securities") ? {} : []; } }
        else row[k] = v ?? ((k==="securities") ? {} : []);
      });
      // whatsapp_last_sent — אובייקט JSONB או null (לא מערך/אובייקט ריק)
      if ("whatsapp_last_sent" in obj) {
        const v = obj.whatsapp_last_sent;
        if (v && typeof v === "object") row.whatsapp_last_sent = v;
        else if (typeof v === "string" && v.trim()) { try { row.whatsapp_last_sent = JSON.parse(v); } catch { row.whatsapp_last_sent = null; } }
        else row.whatsapp_last_sent = null;
      }
      // שמירת תאימות: עמודת name נגזרת מ-first_name+last_name כשהם קיימים בעדכון,
      // כדי שכל הקריאות הקיימות של client.name ימשיכו לעבוד.
      if ("first_name" in row || "last_name" in row) {
        const fn = (row.first_name ?? obj.first_name ?? "").trim();
        const ln = (row.last_name  ?? obj.last_name  ?? "").trim();
        const combined = [fn, ln].filter(Boolean).join(" ");
        if (combined) row.name = combined;
      }
      return sanitizeClientPayload(row);
    } catch(err) {
      console.error("שגיאה ב-toDbRow:", err);
      return {};
    }
  }, []);

  /* ── הוספת לקוח ── */
  const addClient = useCallback(async (c) => {
    // קביעת שיוך הליד:
    //   • איש מכירות (sales) — תמיד ובאופן בלעדי לעצמו. אין שדה/דרופדאון שמאפשר לו
    //     לבחור סוכן אחר (ראה InlineAddRow — לא מציג את הבורר עבור sales).
    //     גם אם איכשהו יישלח advisor_email אחר, הוא נדרס כאן ללא תנאי.
    //   • admin/super_admin — יכול לבחור סוכן יעד מפורשות בטופס (c.advisor_email),
    //     אחרת נופל לסוכן שנבחר בכותרת (selectedAdvisor), אחרת לעצמו.
    const myEmail = (userEmail || "").toLowerCase().trim();
    const assignedAdvisor = isSales
      ? myEmail
      : (c.advisor_email || (selectedAdvisor !== "all" ? selectedAdvisor : myEmail));
    const clientWithAdvisor = { ...c, advisor_email: assignedAdvisor };

    if (!supabase) {
      setClients(p => [...p, clientWithAdvisor]);
      return;
    }
    try {
      const row = toDbRow(clientWithAdvisor);
      if (!row.id) { alert("שגיאה: לא ניתן ליצור לקוח ללא ID"); return; }
      const { data, error } = await supabase
        .from("clients")
        .insert([row])
        .select()
        .single();
      if (error) {
        console.error("שגיאת Supabase בהוספת לקוח:", error);
        alert(`שגיאה בשמירת הלקוח:\n${error.message}`);
        return;
      }
      const normalized = { ...data, requestedMix: data.requested_mix || "" };
      setClients(p => [...p, normalized]);
      // שמירה הצליחה — אם הייתה התרעת DB ישנה (למשל מבעיית סכמה שכבר תוקנה), הסר אותה
      setDbError(null);
    } catch(err) {
      console.error("שגיאה לא צפויה בהוספת לקוח:", err);
      alert(`שגיאה בלתי צפויה:\n${err?.message || err}`);
    }
  }, [toDbRow, userEmail, isSales, selectedAdvisor]);

  /* ── יבוא לידים בכמות (Bulk) מקובץ Excel/CSV ──
     כל ליד מקבל:
       • advisor_email — אותה לוגיקה בדיוק כמו addClient (sales=עצמו תמיד; admin=הבורר/עצמו).
         זה קריטי ל-RLS: בלי advisor_email נכון, Supabase דוחה את ה-insert.
       • phase = "incoming" — תמיד נכנס לעמודת "ליד נכנס".
       • phone → ממופה למערך phones [{number, ownerName}] לפי מבנה הנתונים הקיים.
     מחזיר את מספר הלידים שיובאו בהצלחה (לטוסט). זורק שגיאה אם ה-insert נכשל. */
  const handleImportLeads = useCallback(async (leads) => {
    if (!Array.isArray(leads) || leads.length === 0) return 0;
    const myEmail = (userEmail || "").toLowerCase().trim();
    const assignedAdvisor = isSales
      ? myEmail
      : (selectedAdvisor !== "all" ? selectedAdvisor : myEmail);

    // בנה אובייקט לקוח מלא לכל ליד דרך mkClient (ברירות מחדל תקינות לכל השדות),
    // ואז דרך toDbRow (רשימה לבנה) — בדיוק כמו addClient, רק בכמות.
    // toDbRow מבצע את הסניטציה המספרית (size/rooms/price ריק→null) ואת טיפול התאריך,
    // כך שאין צורך לסנן כאן ידנית — מספיק להעביר את הערכים כפי שהם.
    const rows = leads.map(ld => {
      // העבר את כל שדות הליד פרט ל-phone (שמטופל בנפרד למבנה phones), name ו-phase
      const { phone, ...rest } = ld;
      const client = mkClient({
        ...rest,                       // כל שדות הנכס הממופים: city/street/number/neighborhood/type/condition/size/rooms/floor/balcony/mamad/parking/elevator/price/market_since/published_on/ad_link/seller_notes/lead_source
        name: ld.name || "",
        phase: "incoming",              // תמיד עמודת "ליד נכנס"
        advisor_email: assignedAdvisor, // הטבעת RLS — קריטי
        // טלפון בודד מהקובץ → מבנה phones הקיים
        phones: (phone || "").trim()
          ? [{ number: phone.trim(), ownerName: ld.name || "" }]
          : [],
      });
      return toDbRow(client);
    });

    if (!supabase) {
      // מצב ללא DB (תצוגה מקדימה) — הוסף ל-state המקומי בלבד
      setClients(p => [...p, ...rows]);
      return rows.length;
    }

    const { data, error } = await supabase.from("clients").insert(rows).select();
    if (error) {
      console.error("שגיאת Supabase ביבוא לידים:", error);
      throw new Error(error.message);
    }
    const normalized = (data || []).map(d => ({ ...d, requestedMix: d.requested_mix || "" }));
    setClients(p => [...p, ...normalized]);
    setDbError(null);
    return normalized.length;
  }, [toDbRow, userEmail, isSales, selectedAdvisor]);

  const changePhase = useCallback(async (id, phase) => {
    setClients(p => p.map(c => c.id!==id ? c : { ...c, phase }));
    setActiveClient(prev => prev?.id===id ? { ...prev, phase } : prev);
    if (!supabase) return;
    const { error } = await supabase.from("clients").update({ phase }).eq("id", id);
    if (error) {
      console.error("שגיאת Supabase בשינוי שלב:", error);
      alert(`שגיאה בשינוי שלב:\n${error.message}`);
    }
  }, []);

  const addNote = useCallback(async (id, text) => {
    try {
      if (!id || !text?.trim()) return;
      const authorName = getAdvisorName(userEmail, advisors) || userEmail || "";
      const entry = { date: todayStr(), time: nowTimeStr(), author_name: authorName, note: text.trim() };
      let newTimeline;
      setClients(p => p.map(c => {
        if (c.id !== id) return c;
        newTimeline = [entry, ...(Array.isArray(c.timeline) ? c.timeline : [])];
        return { ...c, timeline: newTimeline };
      }));
      setActiveClient(prev => {
        if (prev?.id !== id) return prev;
        return { ...prev, timeline: [entry, ...(Array.isArray(prev.timeline) ? prev.timeline : [])] };
      });
      if (!supabase || !newTimeline) return;
      const { error } = await supabase.from("clients").update({ timeline: newTimeline }).eq("id", id);
      if (error) console.error("שגיאת DB בהוספת הערה:", error.message);
    } catch(err) {
      console.error("שגיאה לא צפויה בהוספת הערה:", err);
    }
  }, [userEmail, advisors]);

  const updateField = useCallback(async (id, fieldOrPatch, val) => {
    try {
      if (!id) { console.error("updateField: חסר ID"); return; }
      const patch = typeof fieldOrPatch === "string"
        ? { [fieldOrPatch]: val }
        : (fieldOrPatch && typeof fieldOrPatch === "object" ? fieldOrPatch : {});

      // עדכון state מקומי — וודא שכל לקוח מחזיר אובייקט תקין
      setClients(p => p.map(c => {
        if (c.id !== id) return c;
        return { ...c, ...patch };
      }));
      setActiveClient(prev => {
        if (!prev || prev.id !== id) return prev;
        return { ...prev, ...patch };
      });

      if (!supabase) return;

      // בנה dbPatch רק עם שדות הpatch — דרך toDbRow
      const dbPatch = toDbRow({ ...patch, id });
      delete dbPatch.id; // id הולך ב-.eq() ולא בתוכן ה-update
      if (Object.keys(dbPatch).length === 0) return;

      const { error } = await supabase.from("clients").update(dbPatch).eq("id", id);
      if (error) {
        console.error("שגיאת Supabase בעדכון שדה:", error);
        alert(`שגיאה בשמירת נתונים:\n${error.message}`);
      }
    } catch(err) {
      console.error("שגיאה לא צפויה ב-updateField:", err);
      alert(`שגיאה בלתי צפויה:\n${err?.message || err}`);
    }
  }, [toDbRow]);

  const deleteClient = useCallback(async (id) => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק את הלקוח לצמיתות?\nפעולה זו אינה ניתנת לביטול.")) return;
    // שמור snapshot לrollback אם המחיקה תיכשל
    const snapshot = clients.find(c => c.id === id);
    setClients(p => p.filter(c => c.id !== id));
    setActiveClient(null);
    if (!supabase) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      console.error("שגיאת Supabase במחיקת לקוח:", error);
      alert(`שגיאה במחיקת הלקוח:\n${error.message}`);
      // rollback — החזר את הלקוח למצב המקומי
      if (snapshot) setClients(p => [...p, snapshot].sort((a,b) => a.id > b.id ? 1 : -1));
    }
  }, [clients]);

  // ════════════════ פעולות מרובות (Bulk / Multi-Select) ════════════════
  // selectionPhase = id השלב שנמצא כרגע במצב בחירה (בלעדי לעמודה אחת), או null.
  // selectedIds = Set של מזהי לקוחות מסומנים.
  const [selectionPhase, setSelectionPhase] = useState(null);
  const [selectedIds,    setSelectedIds]    = useState(() => new Set());

  // יציאה ממצב בחירה + איפוס מלא
  const clearSelection = useCallback(() => {
    setSelectionPhase(null);
    setSelectedIds(new Set());
  }, []);

  // הפעלה/כיבוי מצב בחירה עבור שלב מסוים (בלעדי — מעבר לשלב אחר מאפס)
  const toggleSelectionMode = useCallback((phaseId) => {
    setSelectionPhase(prev => {
      setSelectedIds(new Set()); // תמיד התחל נקי בעת החלפת מצב/עמודה
      return prev === phaseId ? null : phaseId;
    });
  }, []);

  // סימון/ביטול לקוח בודד
  const toggleSelectId = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // בחר הכל / נקה הכל עבור רשימת מזהים נתונה (של העמודה הפעילה)
  const setSelectAll = useCallback((ids, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) ids.forEach(id => next.add(id));
      else ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  // ── פעולה A: העברת שלב לכל המסומנים (זמין לכולם) ──
  const bulkMoveStage = useCallback(async (targetPhase) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !targetPhase) return;
    setClients(p => p.map(c => ids.includes(c.id) ? { ...c, phase: targetPhase } : c));
    if (supabase) {
      const { error } = await supabase.from("clients").update({ phase: targetPhase }).in("id", ids);
      if (error) {
        console.error("שגיאת Supabase בהעברת שלב מרובה:", error);
        setToast({ msg: `שגיאה בהעברת שלב: ${error.message}`, type: "error" });
        return;
      }
    }
    setToast({ msg: `הועברו בהצלחה ${ids.length} לקוחות`, type: "success" });
    clearSelection();
  }, [selectedIds, clearSelection]);

  // ── פעולה B: מחיקת כל המסומנים (אדמין בלבד) ──
  const bulkDelete = useCallback(async () => {
    if (!isAdmin) return; // הגנת הרשאה
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק ${ids.length} לקוחות?\nפעולה זו אינה ניתנת לביטול.`)) return;
    const snapshot = clients.filter(c => ids.includes(c.id));
    setClients(p => p.filter(c => !ids.includes(c.id)));
    if (supabase) {
      const { error } = await supabase.from("clients").delete().in("id", ids);
      if (error) {
        console.error("שגיאת Supabase במחיקה מרובה:", error);
        setToast({ msg: `שגיאה במחיקה: ${error.message}`, type: "error" });
        if (snapshot.length) setClients(p => [...p, ...snapshot]); // rollback
        return;
      }
    }
    setToast({ msg: `נמחקו בהצלחה ${ids.length} לקוחות`, type: "success" });
    clearSelection();
  }, [isAdmin, selectedIds, clients, clearSelection]);

  // ── פעולה C: שיוך מחדש לאיש מכירות (אדמין בלבד) ──
  const bulkReassign = useCallback(async (advisorEmail) => {
    if (!isAdmin) return; // הגנת הרשאה
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !advisorEmail) return;
    const email = advisorEmail.toLowerCase().trim();
    setClients(p => p.map(c => ids.includes(c.id) ? { ...c, advisor_email: email } : c));
    if (supabase) {
      const { error } = await supabase.from("clients").update({ advisor_email: email }).in("id", ids);
      if (error) {
        console.error("שגיאת Supabase בשיוך מרובה:", error);
        setToast({ msg: `שגיאה בשיוך: ${error.message}`, type: "error" });
        return;
      }
    }
    setToast({ msg: `שויכו בהצלחה ${ids.length} לקוחות`, type: "success" });
    clearSelection();
  }, [isAdmin, selectedIds, clearSelection]);

  // שכפול לקוח — מעתיק שם + פרטי קשר בלבד, שאר השדות ריקים
  const duplicateClient = useCallback(async (src) => {
    if (!src) return;
    const dup = mkClient({
      phase:     "incoming",
      name:      src.name || "",
      case_type: "לקוח משוכפל, הזן פירטי התיק",
      // פרטי קשר וזיהוי בלבד
      phones:    Array.isArray(src.phones) ? src.phones : [],
      tids:      Array.isArray(src.tids) ? src.tids : [],
      emails_list: Array.isArray(src.emails_list) ? src.emails_list : [],
      // שיוך יועץ נשמר כדי שהלקוח יופיע באותו מסך
      advisor_email: src.advisor_email || "",
      // כל השאר — ערכי ברירת מחדל ריקים (מ-mkClient)
    });
    if (!supabase) {
      setClients(p => [...p, dup]);
      setActiveClient(dup);
      return;
    }
    try {
      const row = toDbRow(dup);
      const { data, error } = await supabase.from("clients").insert([row]).select().single();
      if (error) {
        console.error("שגיאת Supabase בשכפול לקוח:", error);
        alert(`שגיאה בשכפול הלקוח:\n${error.message}`);
        return;
      }
      const normalized = { ...data, requestedMix: data.requested_mix || "" };
      setClients(p => [...p, normalized]);
      setActiveClient(normalized); // פתח את הלקוח החדש
    } catch(err) {
      console.error("שגיאה לא צפויה בשכפול לקוח:", err);
      alert(`שגיאה בלתי צפויה:\n${err?.message || err}`);
    }
  }, [toDbRow]);

  // שינוי סדר לקוחות בתוך קבוצת שלב — שומר sort_order ל-Supabase
  const reorderClients = useCallback(async (phaseId, orderedIds) => {
    // עדכון אופטימי של ה-state המקומי: הקצה sort_order רץ לכל לקוחות הקבוצה
    const orderMap = Object.fromEntries(orderedIds.map((id, i) => [id, i]));
    setClients(prev => prev.map(c =>
      c.phase === phaseId && (c.id in orderMap) ? { ...c, sort_order: orderMap[c.id] } : c
    ));
    if (!supabase) return;
    try {
      // שמירה מקבילה של כל השורות בקבוצה
      await Promise.all(orderedIds.map((id, i) =>
        supabase.from("clients").update({ sort_order: i }).eq("id", id)
      ));
    } catch (err) {
      console.error("שגיאה בשמירת סדר הלקוחות:", err);
      alert(`שגיאה בשמירת הסדר:\n${err?.message || err}`);
    }
  }, []);

  // השליפה מ-Supabase כבר מסוננת באופן בלתי-מותנה לפי advisor_email === המשתמש המחובר
  // (ראה ה-useEffect למעלה) — אין יותר מושג של "כל הסוכנים" או בחירת סוכן לצפייה.
  // advisorScoped נשאר כשם משתנה pass-through כדי לא לגעת בכל נקודות הצריכה שלו למטה.
  const advisorScoped = clients;

  const grouped = useMemo(() => themedPhases.map(p => ({
    phase: p,
    clients: advisorScoped
      .filter(c => c.phase===p.id)
      .slice()
      .sort((a, b) => {
        // מיון לפי sort_order (null אחרון), ואז לפי created_at ליציבות
        const sa = (a.sort_order === null || a.sort_order === undefined) ? Infinity : Number(a.sort_order);
        const sb = (b.sort_order === null || b.sort_order === undefined) ? Infinity : Number(b.sort_order);
        if (sa !== sb) return sa - sb;
        const ca = a.created_at || "", cb = b.created_at || "";
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      }),
  })), [themedPhases, advisorScoped]);

  const stats = useMemo(() => {
    // סינון חכם: לקוחות בשלב ארכיון (is_archive===true) מוחרגים מהמדדים הפעילים.
    const active = advisorScoped.filter(c => !archivePhaseIds.has(c.phase));
    return [
      { label:"סה״כ לידים",              val: active.length },
      { label:"פולואו אפ - מעוניינים",    val: active.filter(c=>c.phase==="followup_interested").length },
      { label:"נסגרו כלקוח",              val: active.filter(c=>c.phase==="closed_client").length },
      { label:"לא מעוניינים / לא להתקשר", val: active.filter(c=>["followup_not_interested","do_not_call"].includes(c.phase)).length },
    ];
  }, [advisorScoped, archivePhaseIds]);

  const T = theme;
  if (loading) return (
    <div dir="rtl" style={{
      minHeight:"100vh", background:T.bg || "#f0f2f8",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Heebo',sans-serif", gap:16,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width:44, height:44, borderRadius:12,
        background:"linear-gradient(135deg,#7c6fcd,#2d88d4)",
        display:"flex", alignItems:"center", justifyContent:"center",
        color:"#fff", fontWeight:900, fontSize:22,
        animation:"spin 1.8s linear infinite",
      }}>O</div>
      <div style={{ color:T.textSecondary||"#6070a0", fontSize:14, fontWeight:700 }}>
        טוען נתונים…
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:${T.bg};font-family:'Heebo',sans-serif}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${T.bg}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        input:focus,textarea:focus,select:focus{border-color:#5050a0!important;outline:none}
        @keyframes slideIn{from{transform:translateX(-40px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .gear-btn{transition:transform .3s ease, background .2s, border-color .2s, box-shadow .2s !important}
        @keyframes dbErrorOut{to{opacity:0; transform:translateY(-100%)}}
      `}</style>

      {/* ── באנר שגיאת DB (לא קורס — רק מודיע) ── */}
      {/* dbErrorVisible נשאר מורכב רגע נוסף אחרי שdbError מתאפס, כדי שתתבצע אנימציית היעלמות חלקה ולא הסרה מיידית */}
      {dbErrorVisible && (
        <div dir="rtl" style={{
          position:"fixed", top:0, left:0, right:0, zIndex:9999,
          background:"linear-gradient(135deg,#2a1010,#1a0808)",
          border:"none", borderBottom:"2px solid #c03030",
          padding:"10px 22px",
          display:"flex", alignItems:"center", gap:10,
          fontFamily:"'Heebo',sans-serif",
          animation: dbError ? "none" : "dbErrorOut .35s ease forwards",
        }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <span style={{ color:"#f08080", fontSize:13, fontWeight:700 }}>
            מסד הנתונים לא זמין — מוצגים נתוני דוגמה בלבד. ({dbError})
          </span>
          <button
            onClick={() => setDbError(null)}
            style={{ marginRight:"auto", background:"none", border:"none", color:"#f08080", fontSize:18, cursor:"pointer" }}
          >✕</button>
        </div>
      )}

      <div dir="rtl" style={{ minHeight:"100vh", background:T.bg, color:T.textPrimary, paddingTop: dbError ? 44 : 0 }}>

        {/* ── Header ── */}
        <div style={{
          background:T.headerBg, borderBottom:`1px solid ${T.border}`,
          padding:"0 12px", height:60,
          display:"flex", alignItems:"center", gap:8,
          position:"sticky", top:0, zIndex:200,
          boxShadow:"0 2px 24px #0009",
        }}>
          {/* לוגו */}
          <div style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
            <div style={{ lineHeight:1.2 }}>
              <div style={{ fontWeight:900, fontSize:16, color:T.textPrimary, letterSpacing:-.3 }}>ONYX LEADS</div>
              <div style={{ fontSize:9, color:T.textSecondary, fontWeight:600 }}>ניהול לידים</div>
            </div>
          </div>

          {/* מרווח גמיש */}
          <div style={{ flex:1, minWidth:0 }} />

          {/* ── בורר "כל המוכרנים" — אדמין/סופר-אדמין בלבד; איש מכירות לא רואה את זה כלל ── */}
          {isAdmin && selectableAdvisors.length > 0 && (
            <select
              value={selectedAdvisor}
              onChange={e => setSelectedAdvisor(e.target.value)}
              dir="rtl"
              title="סינון לפי מוכרן"
              style={{
                background:T.rowBg, border:`1px solid ${T.border}`,
                borderRadius:8, color:T.textPrimary, fontSize:11,
                padding:"6px 8px", outline:"none", fontFamily:"inherit",
                cursor:"pointer", flexShrink:0, maxWidth:120,
                fontWeight:700,
              }}
            >
              <option value="all">👥 כל המוכרנים</option>
              {selectableAdvisors.map(a => (
                <option key={a.email} value={a.email}>{a.name}</option>
              ))}
            </select>
          )}

          {/* ── תג זהות + תפקיד ── */}
          <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
            <span style={{
              background: isSuperAdmin ? "#e8a83822" : isAdmin ? "#3dba7e22" : "#7c6fcd22",
              color:       isSuperAdmin ? "#b07818"   : isAdmin ? "#2a8a5a"  : "#7c6fcd",
              border:`1px solid ${isSuperAdmin ? "#e8a83866" : isAdmin ? "#3dba7e66" : "#7c6fcd66"}`,
              borderRadius:20, padding:"3px 8px",
              fontSize:10, fontWeight:800, whiteSpace:"nowrap",
            }}>
              {isSuperAdmin ? "👑 אדמין ראשי" : isAdmin ? "⚡ אדמין" : `👤 ${getAdvisorName(userEmail, advisors) || userEmail || "משתמש"}`}
            </span>
          </div>

          {/* ── כפתור לוח שנה ── */}
          <button
            onClick={() => setShowCalendar(true)}
            title="לוח שנה"
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:40, height:40, flexShrink:0,
              background:"linear-gradient(135deg,#1e1a40,#12203a)",
              border:"1px solid #3a3a6088",
              borderRadius:10, cursor:"pointer",
              boxShadow:"0 2px 10px #0006", transition:"all .2s",
              fontSize:18, marginLeft:8,
            }}
          >🗓️</button>

          {/* ── כפתור גלגל שיניים + תפריט ── */}
          <div style={{ position:"relative", flexShrink:0 }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              title="הגדרות"
              style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:40, height:40,
                background: showSettings
                  ? "linear-gradient(135deg,#3a2a7e,#2a4080)"
                  : "linear-gradient(135deg,#1e1a40,#12203a)",
                border:`1px solid ${showSettings ? "#7c6fcd" : "#3a3a6088"}`,
                borderRadius:10, cursor:"pointer",
                boxShadow: showSettings ? "0 0 18px #7c6fcd55" : "0 2px 10px #0006",
                transition:"all .2s",
                fontSize:18,
                transform: showSettings ? "rotate(45deg)" : "rotate(0deg)",
              }}
            >⚙️</button>

            {/* תפריט נפתח */}
            {showSettings && (
              <div style={{
                position:"absolute", left:0, top:"calc(100% + 8px)",
                background:"#13132b", border:"1px solid #3030608a",
                borderRadius:12, overflow:"hidden",
                boxShadow:"0 16px 48px #000d",
                animation:"fadeUp .15s ease",
                zIndex:500, minWidth:200,
              }}>
                {/* חיצי פאנל */}
                <div style={{
                  padding:"10px 14px 6px",
                  fontSize:10, color:"#50508a", fontWeight:800,
                  letterSpacing:.8, textTransform:"uppercase",
                  borderBottom:"1px solid #2020408a",
                }}>הגדרות</div>

                {/* 0a. רענון נתונים — הפריט הראשון */}
                <button
                  onClick={() => { handleManualRefresh(); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    color:"#9fd4ff", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#16213a"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16, display:"inline-block", animation: refreshing ? "spin 0.7s linear infinite" : "none" }}>↻</span>
                  <span>רענן נתונים</span>
                </button>

                {/* 0b. הגדר ווטסאפ */}
                <button
                  onClick={() => { setShowWaTemplates(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#5fd98a", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#0d2418"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>⚙️</span>
                  <span>הגדר ווטסאפ</span>
                </button>

                {/* 0b2. ניהול שלבי מכירות — אדמין/סופר-אדמין בלבד */}
                {isAdmin && (
                  <button
                    onClick={() => { setShowStageManager(true); setShowSettings(false); }}
                    style={{
                      display:"flex", alignItems:"center", gap:10,
                      width:"100%", padding:"12px 16px",
                      background:"transparent", border:"none",
                      borderTop:"1px solid #2020408a",
                      color:"#9d8cff", fontSize:13, fontWeight:700,
                      cursor:"pointer", textAlign:"right",
                      transition:"background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background="#1a1635"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}
                  >
                    <span style={{ fontSize:16 }}>📋</span>
                    <span>ניהול שלבי מכירות</span>
                  </button>
                )}

                {/* 0c. יבוא לידים — זמין לכל המשתמשים */}
                <button
                  onClick={() => { setShowImport(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#5fd4c4", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#0d2a28"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>📥</span>
                  <span>יבוא לידים</span>
                </button>

                {/* 1. בחירת צבעים */}
                <button
                  onClick={() => { setShowColors(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#c0c0f8", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#1e1e40"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>🎨</span>
                  <span>בחירת צבעים</span>
                </button>

                {/* 2. גודל כתב */}
                <button
                  onClick={() => { setShowFont(true); setShowSettings(false); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#80d8a0", fontSize:13, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#1a2820"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:16 }}>🔤</span>
                  <span>גודל כתב</span>
                </button>

                {/* 3. הגדר את הנוכחי כברירת מחדל */}
                <button
                  onClick={() => {
                    LS.set("onyx_theme", theme);
                    LS.set("onyx_phase_colors", phaseColors);
                    LS.set("onyx_font_sizes", fontSizes);
                    setShowSettings(false);
                    const btn = document.getElementById("set-default-flash");
                    if (btn) { btn.style.display="block"; setTimeout(()=>{ btn.style.display="none"; },2000); }
                  }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#60c080", fontSize:12, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#102018"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:14 }}>⭐</span>
                  <span>הגדר את הנוכחי כברירת מחדל</span>
                </button>

                {/* 4. איפוס לברירת מחדל מערכת */}
                <button
                  onClick={() => {
                    LS.clear(["onyx_theme","onyx_phase_colors","onyx_font_sizes","onyx_col_order","onyx_col_widths"]);
                    LS.set("onyx_theme", LIGHT_ORIGINAL);
                    LS.set("onyx_phase_colors", LIGHT_ORIGINAL.phases);
                    LS.set("onyx_font_sizes", DEFAULT_FONT_SIZES);
                    setShowSettings(false);
                    window.location.reload();
                  }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#808090", fontSize:12, fontWeight:700,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#1a1a30"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:14 }}>↺</span>
                  <span>איפוס לברירת מחדל מערכת (Light Mode)</span>
                </button>

                {/* 5. ניהול מוכרנים — אדמין/סופר-אדמין בלבד. איש מכירות לא רואה את הכפתור הזה כלל. */}
                {isAdmin && (
                  <button
                    onClick={() => { setShowAdvisorMgmt(true); setShowSettings(false); }}
                    style={{
                      display:"flex", alignItems:"center", gap:10,
                      width:"100%", padding:"12px 16px",
                      background:"transparent", border:"none",
                      borderTop:"1px solid #2020408a",
                      color:"#a0a0f8", fontSize:13, fontWeight:700,
                      cursor:"pointer", textAlign:"right",
                      transition:"background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background="#1e1e40"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}
                  >
                    <span style={{ fontSize:16 }}>👥</span>
                    <span>ניהול מוכרנים</span>
                  </button>
                )}

                {/* 6. התנתק */}
                <button
                  onClick={() => { setShowSettings(false); onLogout && onLogout(); }}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    width:"100%", padding:"12px 16px",
                    background:"transparent", border:"none",
                    borderTop:"1px solid #2020408a",
                    color:"#e06060", fontSize:13, fontWeight:800,
                    cursor:"pointer", textAlign:"right",
                    transition:"background .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#2a1010"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  <span style={{ fontSize:15 }}>🔓</span>
                  <span>התנתק</span>
                </button>
              </div>
            )}
          </div>

          {/* סגירת תפריט בלחיצה מחוץ */}
          {showSettings && (
            <div
              style={{ position:"fixed", inset:0, zIndex:499 }}
              onClick={() => setShowSettings(false)}
            />
          )}
        </div>

        {/* ── סטטיסטיקות ── */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(2, 1fr)",
          gap:8,
          padding:"12px 12px",
          borderBottom:`1px solid ${T.border}`,
        }}
          className="stats-grid"
        >
          <style>{`@media(min-width:600px){.stats-grid{grid-template-columns:repeat(4,1fr)!important;gap:12px!important;padding:14px 22px!important;}}`}</style>
          {stats.map(s => (
            <div key={s.label} style={{
              background:T.cardBg, borderRadius:10,
              padding:"10px 12px",
              border:`1px solid ${T.border}`,
              textAlign:"center",
              minWidth:0,
            }}>
              <div style={{ fontSize:22, fontWeight:900, color:T.textPrimary }}>{s.val}</div>
              <div style={{ fontSize:10, color:T.textSecondary, marginTop:2, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── לוחות — טבלה מאוחדת ── */}
        {/* הערה: עריכת לידים בלתי-מותנית לכל משתמש על לידים שהוא רואה (RLS כבר מבטיח
            ראייה נכונה לפי תפקיד). שיוך/הקצאת ליד לסוכן אחר מוגבל לאדמין/סופר-אדמין
            בלבד — ראה isAdmin המועבר ל-InlineAddRow ולמגירת הלקוח. */}
        <div style={{ paddingBottom:60 }}>
          <UnifiedTable
            grouped={grouped}
            onOpen={setActiveClient}
            onPhaseChange={changePhase}
            onAddClient={addClient}
            theme={T}
            cols={colControls.cols}
            widths={colControls.widths}
            colControls={colControls}
            fontSizes={fontSizes}
            onReorder={reorderClients}
            advisors={selectableAdvisors}
            isAdmin={isAdmin}
            myName={getAdvisorName(userEmail, advisors) || userEmail}
            selectionPhase={selectionPhase}
            selectedIds={selectedIds}
            onToggleSelectionMode={toggleSelectionMode}
            onToggleSelectId={toggleSelectId}
            onSelectAll={setSelectAll}
          />
        </div>
      </div>

      {/* סרגל פעולות מרובות צף — מופיע כשיש לקוחות מסומנים */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          phases={themedPhases}
          advisors={selectableAdvisors}
          isAdmin={isAdmin}
          onMoveStage={bulkMoveStage}
          onDelete={bulkDelete}
          onReassign={bulkReassign}
          onCancel={clearSelection}
          theme={T}
        />
      )}

      {/* מגירת לוח זמנים */}
      {activeClient && (() => {
        // מקור-אמת יחיד: שלוף את הגרסה העדכנית מתוך clients (נמנע מ-state כפול מנותק)
        const liveClient = clients.find(c => c.id === activeClient.id) || activeClient;
        return (
        <TimelineDrawer
          client={liveClient}
          onClose={() => setActiveClient(null)}
          onAddNote={addNote}
          onUpdate={updateField}
          onNotesUpdate={updateField}
          onDelete={deleteClient}
          onDuplicate={duplicateClient}
          readOnly={false}
          isAdmin={isAdmin}
          advisors={selectableAdvisors}
          waTemplates={waTemplates}
          myName={getAdvisorName(userEmail, advisors) || userEmail || ""}
          phases={themedPhases}
          theme={T}
          fontSizes={fontSizes}
        />
        );
      })()}

      {/* פאנל בחירת צבעים */}
      {showColors && (
        <ColorPickerPanel
          theme={theme}
          onThemeChange={handleThemeChange}
          onClose={() => setShowColors(false)}
          phases={phaseColors}
          onPhasesChange={handlePhasesChange}
        />
      )}

      {/* פאנל גודל כתב */}
      {showFont && (
        <FontSizePanel
          sizes={fontSizes}
          onChange={handleFontChange}
          onClose={() => setShowFont(false)}
          theme={T}
        />
      )}

      {/* פאנל ניהול מוכרנים — אדמין/סופר-אדמין בלבד (גם ברמת render, לא רק כפתור התפריט) */}
      {showAdvisorMgmt && isAdmin && (
        <AdvisorManagementPanel
          advisors={advisors}
          onReload={onReloadAdvisors}
          onClose={() => setShowAdvisorMgmt(false)}
          isSuperAdmin={isSuperAdmin}
          theme={T}
        />
      )}

      {/* מודל יבוא לידים */}
      {showImport && (
        <ImportLeadsModal
          theme={T}
          onClose={() => setShowImport(false)}
          onImport={async (leads) => {
            const count = await handleImportLeads(leads);
            // הצלחה — סגור מודל, הצג טוסט, ה-state כבר רוענן בתוך handleImportLeads
            setShowImport(false);
            setToast({ msg: `נקלטו בהצלחה ${count} לידים חדשים`, type: "success" });
          }}
        />
      )}

      {/* מנהל תבניות ווטסאפ */}
      {showWaTemplates && (
        <WhatsAppTemplatesPanel
          templates={waTemplates}
          onSave={saveWaTemplates}
          onClose={() => setShowWaTemplates(false)}
          theme={T}
        />
      )}

      {/* מנהל שלבי מכירות — אדמין בלבד */}
      {showStageManager && isAdmin && (
        <PipelineStageManager
          stages={pipelineStages}
          onAdd={addStage}
          onUpdate={updateStage}
          onDelete={deleteStage}
          onReorder={reorderStage}
          onClose={() => setShowStageManager(false)}
          theme={T}
        />
      )}

      {/* טוסט הודעה */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
          zIndex:1100, display:"flex", alignItems:"center", gap:9,
          background: toast.type === "success" ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "linear-gradient(135deg,#c03030,#e04444)",
          color:"#fff", padding:"12px 22px", borderRadius:10,
          fontSize:13.5, fontWeight:800, boxShadow:"0 8px 30px rgba(0,0,0,.4)",
          maxWidth:"90vw",
        }}>
          <span style={{ fontSize:16 }}>{toast.type === "success" ? "✅" : "⚠️"}</span>
          {toast.msg}
        </div>
      )}

      {/* לוח שנה כללי */}
      {showCalendar && (
        <CalendarView
          clients={advisorScoped}
          onClose={() => setShowCalendar(false)}
          onOpenClient={(c) => setActiveClient(c)}
          onToggleComplete={(client, ev) => {
            // משימת לוח שנה מתוך ה-timeline
            if (ev.tlIndex !== undefined && ev.tlIndex !== null) {
              let nextTl = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const tl = Array.isArray(c.timeline) ? c.timeline : [];
                nextTl = tl.map((e,i) => i === ev.tlIndex ? { ...e, completed: !e.completed } : e);
                return { ...c, timeline: nextTl };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextTl) ? { ...prev, timeline: nextTl } : prev);
              if (supabase && nextTl) {
                supabase.from("clients").update({ timeline: nextTl }).eq("id", client.id)
                  .then(({ error }) => { if (error) console.error("שגיאה בשמירת סטטוס:", error.message); });
              }
              return;
            }
            // טיפול באירועים מותאמים (custom) — signing/final הוסרו (ראה הערה למעלה)
            if (ev.type === "custom") {
              let nextArr = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                nextArr = evList.map(x => x.id === ev.id ? { ...x, completed: !x.completed } : x);
                return { ...c, custom_calendar_events: nextArr };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
              if (supabase && nextArr) {
                supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                  .then(({ error }) => { if (error) { console.error("שגיאה בשמירת סטטוס:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
              }
            }
          }}
          onReorder={(client, orderedIds) => {
            let nextArr = null;
            setClients(prev => prev.map(c => {
              if (c.id !== client.id) return c;
              const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
              const byId = Object.fromEntries(evList.map(ev => [ev.id, ev]));
              const reordered = orderedIds.map(id => byId[id]).filter(Boolean);
              const untouched = evList.filter(ev => !orderedIds.includes(ev.id));
              nextArr = [...reordered, ...untouched];
              return { ...c, custom_calendar_events: nextArr };
            }));
            setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
            if (supabase && nextArr) {
              supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                .then(({ error }) => { if (error) { console.error("שגיאה בשמירת סדר:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
            }
          }}
          onSaveNote={(client, ev, noteText) => {
            if (ev.type === "custom") {
              let nextArr = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                nextArr = evList.map(x => x.id === ev.id ? { ...x, notes: noteText } : x);
                return { ...c, custom_calendar_events: nextArr };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
              if (supabase && nextArr) {
                supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                  .then(({ error }) => { if (error) { console.error("שגיאה בשמירת הערה:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
              }
            }
          }}
          onReschedule={(client, ev, newDate) => {
            // משימת לוח שנה מתוך ה-timeline — עדכן task_date
            if (ev.tlIndex !== undefined && ev.tlIndex !== null) {
              let nextTl = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const tl = Array.isArray(c.timeline) ? c.timeline : [];
                nextTl = tl.map((e,i) => i === ev.tlIndex ? { ...e, task_date: newDate } : e);
                return { ...c, timeline: nextTl };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextTl) ? { ...prev, timeline: nextTl } : prev);
              if (supabase && nextTl) {
                supabase.from("clients").update({ timeline: nextTl }).eq("id", client.id)
                  .then(({ error }) => { if (error) console.error("שגיאה בשינוי תאריך:", error.message); });
              }
              return;
            }
            if (ev.type === "custom") {
              let nextArr = null;
              setClients(prev => prev.map(c => {
                if (c.id !== client.id) return c;
                const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                nextArr = evList.map(x => x.id === ev.id ? { ...x, date: newDate } : x);
                return { ...c, custom_calendar_events: nextArr };
              }));
              setActiveClient(prev => (prev && prev.id === client.id && nextArr) ? { ...prev, custom_calendar_events: nextArr } : prev);
              if (supabase && nextArr) {
                supabase.from("clients").update({ custom_calendar_events: nextArr }).eq("id", client.id)
                  .then(({ error }) => { if (error) { console.error("שגיאה בשינוי תאריך:", error); alert(`שגיאה בשמירה:\n${error.message}`); } });
              }
            }
          }}
          onSwapDay={(items) => {
            // items: [{ ev, order }] — כל אירועי היום עם הסדר החדש (כולם type==="custom" כעת)
            // קבץ את העדכונים לפי לקוח (מניעת race: עדכון אחד לכל לקוח)
            const patchByClient = {}; // clientId -> { custom:{id:order} }
            items.forEach(({ ev, order }) => {
              const cid = ev.client?.id; if (!cid) return;
              patchByClient[cid] = patchByClient[cid] || { custom:{} };
              if (ev.type === "custom") patchByClient[cid].custom[ev.id] = order;
            });

            Object.entries(patchByClient).forEach(([cid, patch]) => {
              const dbUpdates = []; // אוסף עדכוני DB נפרדים (כדי שעמודה חסרה לא תפיל את כולם)
              setClients(prev => prev.map(c => {
                if (c.id !== cid) return c;
                const upd = { ...c };
                if (Object.keys(patch.custom).length) {
                  const evList = Array.isArray(c.custom_calendar_events) ? c.custom_calendar_events : [];
                  const nextArr = evList.map(x => (x.id in patch.custom) ? { ...x, day_order: patch.custom[x.id] } : x);
                  upd.custom_calendar_events = nextArr;
                  dbUpdates.push({ custom_calendar_events: nextArr });
                }
                return upd;
              }));
              setActiveClient(prev => {
                if (!prev || prev.id !== cid) return prev;
                const merged = { ...prev };
                dbUpdates.forEach(u => Object.assign(merged, u));
                return merged;
              });
              if (supabase) {
                dbUpdates.forEach(u => {
                  supabase.from("clients").update(u).eq("id", cid)
                    .then(({ error }) => { if (error) console.error("שגיאה בשמירת סדר:", error.message); });
                });
              }
            });
          }}
          theme={T}
        />
      )}

      {/* הודעת "הוגדר כברירת מחדל" */}
      <div id="set-default-flash" style={{
        display:"none",
        position:"fixed", bottom:28, right:"50%", transform:"translateX(50%)",
        background:"linear-gradient(135deg,#1a4a28,#0d3020)",
        border:"1px solid #3dba7e88",
        color:"#3dba7e", borderRadius:10, padding:"12px 24px",
        fontSize:13, fontWeight:800, zIndex:2000,
        boxShadow:"0 8px 32px #0009",
        animation:"fadeUp .2s ease",
      }}>
        ⭐ ההגדרות נשמרו כברירת מחדל
      </div>
    
    </>
  );
}  // סוף MainDashboard

