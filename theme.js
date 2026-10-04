const baseStatusColors = {
  placeholder: '#94A3B8',
  border: '#D8C3B5',
  softBorder: '#EFE7E1',
  success: '#5B7065',
  successSoft: '#EBF0ED',
  warning: '#B85A32',
  warningSoft: '#FBECE6',
  purple: '#6B5B52',
  purpleSoft: '#EFE7E1',
  danger: '#C94A4A',
  dangerSoft: '#FDECEC',
  white: '#FFFFFF',
  transparent: 'transparent',
};

export const COLOR_THEMES = [
  {
    id: 'cashmere-sage-copper',
    name: 'Cashmere, Muted Sage & Antique Copper (60-30-10)',
    colors: {
      // 60% Dominant Base Canvas: Cashmere / Warm Taupe (#F7F4F0 / #FAF7F4)
      background: '#F7F4F0',
      lightBackground: '#FAF7F4',
      card: '#FFFFFF',
      
      // 30% Secondary Structure: Muted Sage (#4A5D52 / #5B7065 / #37473E)
      primary: '#37473E',
      secondary: '#4A5D52',
      muted: '#7A8C82',
      
      // 10% Accent Callouts: Antique Copper (#B85A32 / #C86940 / #FBECE6)
      accent: '#B85A32',
      accentSecondary: '#C86940',
      accentSoft: '#FBECE6',
      accentLight: '#F7D9CC',
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