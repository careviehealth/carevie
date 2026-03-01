'use client';

import { Palette, ChevronDown } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { applyTheme, getCurrentTheme, themes } from '@/lib/themeUtils';

export default function ThemeSelector() {
  const [currentTheme, setCurrentTheme] = useState('default');
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isLightTheme = ['default', 'lemon', 'lavender'].includes(currentTheme);

  // Don't render on dashboard
  if (pathname === '/dashboard') {
    return null;
  }

  useEffect(() => {
    const storedTheme = getCurrentTheme();
    setCurrentTheme(storedTheme);
    applyTheme(storedTheme);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectTheme = (themeValue: string) => {
    setCurrentTheme(themeValue);
    applyTheme(themeValue);
    // Dispatch custom event to notify other components of theme change
    window.dispatchEvent(new CustomEvent('themeChange', { detail: themeValue }));
    setIsOpen(false);
  };

  useEffect(() => {
    const handleThemeChange = (event: CustomEvent) => {
      setCurrentTheme(event.detail);
    };
    window.addEventListener('themeChange', handleThemeChange as EventListener);
    return () => window.removeEventListener('themeChange', handleThemeChange as EventListener);
  }, []);

  const currentThemeName = themes.find(t => t.value === currentTheme)?.name || 'Default';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        title="Select theme"
      >
        <Palette className="w-4 h-4" />
        <span className="hidden sm:inline">{currentThemeName}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {themes.map((theme) => (
            <button
              key={theme.value}
              onClick={() => selectTheme(theme.value)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                currentTheme === theme.value ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700'
              }`}
            >
              {theme.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
