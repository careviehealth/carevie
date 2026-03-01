export const applyTheme = (theme: string) => {
  const root = document.documentElement;

  // Remove existing theme classes
  root.classList.remove('theme-charcoal', 'theme-clay', 'theme-olive', 'theme-coffee', 'theme-ocean', 'theme-sunset', 'theme-lemon', 'theme-lavender', 'theme-cherryblue');

  // Apply new theme
  if (theme !== 'default') {
    root.classList.add(`theme-${theme}`);
  }

  // Store theme preference
  localStorage.setItem('vytara_theme', theme);
};

export const getCurrentTheme = (): string => {
  if (typeof window === 'undefined') return 'default';
  return localStorage.getItem('vytara_theme') || 'default';
};

export const themes = [
  { name: 'Default', value: 'default', color: '#14b8a6' },
  { name: 'Charcoal', value: 'charcoal', color: '#374151' },
  { name: 'Clay', value: 'clay', color: '#a855f7' },
  { name: 'Olive', value: 'olive', color: '#84cc16' },
  { name: 'Coffee', value: 'coffee', color: '#78350f' },
  { name: 'Ocean', value: 'ocean', color: '#0ea5e9' },
  { name: 'Sunset', value: 'sunset', color: '#f97316' },
  { name: 'Lemon', value: 'lemon', color: '#eab308' },
  { name: 'Lavender', value: 'lavender', color: '#c084fc' },
  { name: 'Cherryblue', value: 'cherryblue', color: '#2563eb' }
];
