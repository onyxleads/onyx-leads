import { supabase } from "./supabase";
import { fmtDate2, splitName, todayStr } from "./utils";

/* ─── מיגרציה: מזג משימות ישנות מ-custom_calendar_events לתוך ה-timeline ───────
   מופרד לפונקציה משותפת כדי שגם שאילתת ה-fallback (כש-sort_order חסר בטבלה)
   תעבור את אותה מיגרציה בלי לשכפל קוד.
   ──────────────────────────────────────────────────────────────────────── */
export function migrateClientRows(rows) {
  return (rows || []).map(r => {
    let base = { ...r, requestedMix: r.requested_mix || r.requestedMix || "" };
    // השלמת first_name/last_name מרשומות ישנות שיש בהן רק name (לתצוגה/עריכה).
    // לא דורסים ערכים קיימים; לא כותבים חזרה ל-DB (יישמר בעריכה הבאה).
    if (!((r.first_name || "").trim()) && !((r.last_name || "").trim()) && (r.name || "").trim()) {
      const sp = splitName(r.name);
      base = { ...base, first_name: sp.first_name, last_name: sp.last_name };
    }
    const oldEvents = Array.isArray(r.custom_calendar_events) ? r.custom_calendar_events : [];
    if (oldEvents.length === 0) return base;
    const asTasks = oldEvents
      .filter(ev => ev && (ev.text || ev.date))
      .map(ev => ({
        date: ev.date ? fmtDate2(ev.date) : todayStr(),
        note: ev.text || "",
        is_calendar_task: true,
        task_date: ev.date || "",
        completed: !!ev.completed,
        _migrated: true,
      }));
    const existingTl = Array.isArray(r.timeline) ? r.timeline : [];
    const alreadyMigrated = existingTl.some(e => e._migrated);
    const newTl = alreadyMigrated ? existingTl : [...asTasks, ...existingTl];
    if (!alreadyMigrated && supabase) {
      supabase.from("clients").update({ timeline: newTl, custom_calendar_events: [] }).eq("id", r.id)
        .then(({ error }) => { if (error) console.error("שגיאת מיגרציה:", error.message); });
    }
    return { ...base, timeline: newTl, custom_calendar_events: [] };
  });
}

