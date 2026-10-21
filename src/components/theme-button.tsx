'use client';
import { Moon, Sun } from 'lucide-react';
export function ThemeButton() {
  function toggle() {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('forgeos-theme', theme);
    } catch {}
  }
  return (
    <button type="button" className="icon-button" aria-label="Toggle light and dark theme" onClick={toggle}>
      <Moon className="theme-moon" size={19} />
      <Sun className="theme-sun" size={19} />
    </button>
  );
}
