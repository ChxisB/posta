'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { IconButton } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <IconButton label={`Switch to ${next} theme`} size="sm" onClick={toggle}>
      {theme === 'dark' ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </IconButton>
  );
}
