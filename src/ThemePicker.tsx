export const themes = [
  { value: 'minimal', label: '简约高级' },
  { value: 'sketch', label: '手绘笔记' },
  { value: 'print', label: '彩色版画' },
  { value: 'graffiti', label: '美式涂鸦' },
] as const;

export type Theme = typeof themes[number]['value'];
export const THEME_KEY = 'codewords-theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return themes.find(theme => theme.value === saved)?.value ?? 'minimal';
  } catch { return 'minimal'; }
}

export default function ThemePicker({ value, onChange, className = '' }: {
  value: Theme;
  onChange: (value: Theme) => void;
  className?: string;
}) {
  return <label className={`theme-picker ${className}`}>
    <span>界面风格</span>
    <select aria-label="界面风格" value={value} onChange={event => {
      const choice = themes.find(theme => theme.value === event.target.value);
      if (choice) onChange(choice.value);
    }}>
      {themes.map(theme => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
    </select>
  </label>;
}
