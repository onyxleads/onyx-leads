import { baseInput } from "../lib/utils";

/* ─── רכיב RInput ──────────────────────────────────────────────────────────── */
export function RInput({ value, onChange, placeholder, style={} }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir="rtl"
      style={baseInput(style)}
    />
  );
}

