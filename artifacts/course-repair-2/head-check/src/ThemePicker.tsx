export const themes = [
  { value: 'lagoon', label: '蓝绿' },
  { value: 'pearl', label: '黑白' },
  { value: 'sky', label: '冰蓝' },
  { value: 'mint', label: '薄荷绿' },
] as const;

export type Theme = typeof themes[number]['value'];
export const THEME_KEY = 'codewords-theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    const legacy: Record<string, Theme> = { minimal: 'lagoon', sketch: 'pearl', print: 'sky', graffiti: 'mint' };
    return themes.find(theme => theme.value === saved)?.value ?? legacy[saved ?? ''] ?? 'lagoon';
  } catch { return 'lagoon'; }
}

export default function ThemePicker({ value, onChange, className = '' }: {
  value: Theme;
  onChange: (value: Theme) => void;
  className?: string;
}) {
  return <label className={`theme-picker ${className}`}>
    <span>配色</span>
    <select aria-label="界面配色" value={value} onChange={event => {
      const choice = themes.find(theme => theme.value === event.target.value);
      if (choice) onChange(choice.value);
    }}>
      {themes.map(theme => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
    </select>
  </label>;
}
