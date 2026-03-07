'use client';

import { Palette, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  applyTheme,
  getAppliedTheme,
  getCurrentTheme,
  isThemeStorageKey,
  seedThemeForUserFromLegacy,
  themes,
} from '@/lib/themeUtils';

type ThemeSelectorProps = {
  variant?: 'desktop' | 'mobile';
  userId?: string;
};

export default function ThemeSelector({ variant = 'desktop', userId = '' }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const pathname = usePathname();
  const hideOnLandingPage = pathname === '/landing-page';
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const trimmedUserId = userId.trim();

  useEffect(() => {
    if (!trimmedUserId) return;
    seedThemeForUserFromLegacy(trimmedUserId);
  }, [trimmedUserId]);

  const resolveTheme = useCallback(() => {
    try {
      const appliedTheme = getAppliedTheme();
      if (appliedTheme !== 'default') {
        return appliedTheme;
      }
      return getCurrentTheme(trimmedUserId || undefined);
    } catch {
      return 'default';
    }
  }, [trimmedUserId]);

  const [currentTheme, setCurrentTheme] = useState<string>('default');

  useEffect(() => {
    setCurrentTheme(resolveTheme());
  }, [resolveTheme]);

  useEffect(() => {
    const syncTheme = () => setCurrentTheme(resolveTheme());
    const onStorage = (event: StorageEvent) => {
      if (isThemeStorageKey(event.key)) {
        syncTheme();
      }
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        syncTheme();
      }
    };
    const observer = new MutationObserver(syncTheme);

    window.addEventListener('themeChange', syncTheme as EventListener);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', syncTheme);
    window.addEventListener('pageshow', syncTheme);
    document.addEventListener('visibilitychange', onVisibilityChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => {
      window.removeEventListener('themeChange', syncTheme as EventListener);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', syncTheme);
      window.removeEventListener('pageshow', syncTheme);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observer.disconnect();
    };
  }, [resolveTheme]);

  useEffect(() => {
    if (!trimmedUserId) return;
    applyTheme(resolveTheme(), trimmedUserId);
  }, [resolveTheme, trimmedUserId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const desiredWidth = 224;
    const maxWidth = window.innerWidth - viewportPadding * 2;
    const menuWidth = Math.max(160, Math.min(desiredWidth, maxWidth));

    const availableBelow = window.innerHeight - rect.bottom - 8;
    const availableAbove = rect.top - 8;
    const openUp = availableBelow < 220 && availableAbove > availableBelow;

    const availableSpace = openUp ? availableAbove : availableBelow;
    const maxHeight = Math.max(120, Math.min(320, availableSpace));

    const top = openUp
      ? Math.max(viewportPadding, rect.top - maxHeight - 8)
      : Math.min(window.innerHeight - maxHeight - viewportPadding, rect.bottom + 8);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - menuWidth - viewportPadding
    );

    setMenuStyle({
      top,
      left,
      width: menuWidth,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();

    const handleViewportChange = () => {
      updateMenuPosition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  const selectTheme = (themeValue: string) => {
    applyTheme(themeValue, trimmedUserId || undefined);
    setCurrentTheme(themeValue);
    // Dispatch custom event to notify other components of theme change
    window.dispatchEvent(new CustomEvent('themeChange', { detail: themeValue }));
    setIsOpen(false);
  };

  const currentThemeName = themes.find(t => t.value === currentTheme)?.name || 'Default';

  // Don't render on landing page
  if (hideOnLandingPage) {
    return null;
  }

  const buttonClassName =
    variant === 'mobile'
      ? 'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-teal-100/90 transition hover:bg-white/10 hover:text-white'
      : 'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-teal-100/90 transition hover:bg-white/10 hover:text-white';

  const labelClassName = variant === 'mobile' ? 'flex items-center gap-3' : 'flex items-center gap-2';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName}
        title="Select theme"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span className={labelClassName}>
          <Palette className="w-4 h-4" />
          <span>Theme</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-teal-200/75">
          <span className="truncate max-w-[7rem]">{currentThemeName}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed z-[70] overflow-y-auto rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-lg"
          style={menuStyle}
        >
          {themes.map((theme) => (
            <button
              key={theme.value}
              onClick={() => selectTheme(theme.value)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                currentTheme === theme.value
                  ? 'bg-[#f1f5f9] text-[#0f172a] font-medium'
                  : 'text-[#334155] hover:bg-[#f8fafc]'
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
