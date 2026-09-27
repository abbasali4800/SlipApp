const baseStatusColors = {
  placeholder: '#94A3B8',
  border: '#E2E8F0',
  softBorder: '#CBD5E1',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#F97316',
  warningSoft: '#FFEDD5',
  purple: '#7C3AED',
  purpleSoft: '#F3E8FF',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  white: '#FFFFFF',
  transparent: 'transparent',
};

export const COLOR_THEMES = [
  {
    id: 'sage-rosegold',
    name: 'Sage & Rose Gold',
    colors: {
      primary: '#2F4336',
      background: '#FAF9F6',
      accent: '#B76E79',
      lightBackground: '#FFFFFF',
      muted: '#6B8E7B',
      accentSoft: '#F8ECEE',
      accentLight: '#E8C5CA',
    },
  },
  {
    id: 'deep-teal-ivory-bronze',
    name: 'Deep Teal',
    colors: {
      primary: '#123C3A',
      background: '#F7F2E8',
      accent: '#B9824A',
      lightBackground: '#FFFBF3',
      muted: '#6F7F7B',
      accentSoft: '#EFE2D2',
      accentLight: '#E7CBAA',
    },
  },
  {
    id: 'burgundy-beige-charcoal',
    name: 'Burgundy',
    colors: {
      primary: '#2F2F2F',
      background: '#F4EDE4',
      accent: '#6B1F2B',
      lightBackground: '#FBF6EF',
      muted: '#74665E',
      accentSoft: '#EFE0E2',
      accentLight: '#E7C6CC',
    },
  },
  {
    id: 'forest-cream-gold',
    name: 'Forest Gold',
    colors: {
      primary: '#244A3A',
      background: '#FFF9F0',
      accent: '#C8A35F',
      lightBackground: '#FFFCF7',
      muted: '#6B776F',
      accentSoft: '#F4EAD4',
      accentLight: '#EBD59F',
    },
  },
  {
    id: 'slate-warm-copper',
    name: 'Slate Copper',
    colors: {
      primary: '#34495E',
      background: '#FAF7F2',
      accent: '#B87333',
      lightBackground: '#FFFFFF',
      muted: '#6D7780',
      accentSoft: '#EFE2D6',
      accentLight: '#E7C7A6',
    },
  },
];

export const theme = {
  colors: {
    ...COLOR_THEMES[0].colors,
    ...baseStatusColors,
  },
};

export function applyTheme(themeId) {
  const selected = COLOR_THEMES.find((item) => item.id === themeId) || COLOR_THEMES[0];
  theme.colors = {
    ...selected.colors,
    ...baseStatusColors,
  };
  return selected;
}

export function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}