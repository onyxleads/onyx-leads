/* ─── ערכות צבעים מוגדרות מראש ───────────────────────────────────────────── */
export const PRESETS = [
  {
    name:"Dark Classic", emoji:"🌑",
    bg:"#0a0a18", headerBg:"#0e0e20", cardBg:"#111122",
    groupBg:"#0f0f20", rowBg:"#0f0f22", rowHover:"#181830",
    textPrimary:"#d8d8f0", textSecondary:"#50508a",
    border:"#2a2a48", colHeader:"#60608a",
    drawerBg:"#10101f", drawerCard:"#16162c", drawerBorder:"#2a2a48",
    drawerText:"#e0e0f8", drawerSubText:"#6060a0", drawerInput:"#1a1a2e",
    phases:["#7c6fcd","#e8a838","#2d88d4","#3dba7e","#d4704a","#6abf6a"],
  },
  {
    name:"Light Mode", emoji:"☀️",
    bg:"#f0f2f8", headerBg:"#ffffff", cardBg:"#ffffff",
    groupBg:"#e8eaf4", rowBg:"#f8f8ff", rowHover:"#eeeef8",
    textPrimary:"#1a1a3a", textSecondary:"#6070a0",
    border:"#d0d4e8", colHeader:"#6070a0",
    drawerBg:"#f4f6ff", drawerCard:"#ffffff", drawerBorder:"#d0d4e8",
    drawerText:"#1a1a3a", drawerSubText:"#6070a0", drawerInput:"#eef0f8",
    phases:["#6c5ecf","#d4921a","#1a70c0","#1a9a5a","#c0501a","#2a9a2a"],
  },
];

export const LIGHT_PRESET   = PRESETS[1]; // Light Mode
export const DEFAULT_THEME  = LIGHT_PRESET;

// snapshot קפוא של ערכי Light Mode המקוריים — לשחזור מהימן
export const LIGHT_ORIGINAL = JSON.parse(JSON.stringify(LIGHT_PRESET));

/* ── כתיבת ברירות המחדל ל-localStorage בפעם הראשונה ──
   אם אין שמירה קיימת, שמור את Light Mode + גדלי טקסט ברירת מחדל.
   כך בכל פתיחה ראשונה (או לאחר ניקוי) נטענת Light Mode. */
(function seedDefaults() {
  try {
    if (!localStorage.getItem("onyx_theme")) {
      localStorage.setItem("onyx_theme",        JSON.stringify(LIGHT_ORIGINAL));
      localStorage.setItem("onyx_phase_colors",  JSON.stringify(LIGHT_ORIGINAL.phases));
    }
    // תמיד כתוב את גדלי הכתב הקבועים — שם לקוח 18px, התנהלות התיק 17px
    const savedFonts = (() => { try { return JSON.parse(localStorage.getItem("onyx_font_sizes")||"{}"); } catch{return {};} })();
    localStorage.setItem("onyx_font_sizes", JSON.stringify({
      ...savedFonts,
      name:     18,   // קבוע
      timeline: 17,   // קבוע
    }));
    // כתוב סדר עמודות רק אם לא קיים — כדי לשמור על סדר שהמשתמש הגדיר
    if (!localStorage.getItem("onyx_col_order")) {
      localStorage.setItem("onyx_col_order", JSON.stringify(
        ["name","timeline","phase","phone","fee"]
      ));
    }
  } catch(e) {}
})();


/* ─── פאנל גודל כתב ──────────────────────────────────────────────────────── */
export const FONT_COLS = [
  { key:"name",       label:"שם הלקוח",          group:"עמודות טבלה" },
  { key:"timeline",   label:"התנהלות התיק",       group:"עמודות טבלה" },
  { key:"phone",      label:"טלפון",              group:"עמודות טבלה" },
  { key:"fee",        label:"שכר טרחה",           group:"עמודות טבלה" },
  { key:"phase",      label:"שלב",                group:"עמודות טבלה" },
  { key:"colHeader",  label:"כותרת עמודות",       group:"כותרת טבלה" },
  { key:"drawerText", label:"טקסט כרטיס לקוח",   group:"כרטיס לקוח" },
  { key:"drawerSub",  label:"תוויות כרטיס לקוח", group:"כרטיס לקוח" },
];
export const DEFAULT_FONT_SIZES = {
  name:       18,
  timeline:   17,
  bank:       13,
  phone:      13,
  tid:        13,
  fee:        13,
  phase:      13,
  colHeader:  11,
  drawerText: 13,
  drawerSub:  11,
};

