'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './theme-provider';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle"
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {resolvedTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    );
  }

  return (
    <div className="theme-segmented" role="group" aria-label="Theme selector">
      {([
        { value: 'light', icon: Sun, label: 'Light' },
        { value: 'system', icon: Monitor, label: 'System' },
        { value: 'dark', icon: Moon, label: 'Dark' },
      ] as const).map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={`theme-segmented-btn${theme === value ? ' active' : ''}`}
          aria-pressed={theme === value}
          title={label}
        >
          <Icon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
