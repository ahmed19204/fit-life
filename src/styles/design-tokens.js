/**
 * FitLife Design System - Midnight Emerald Theme
 * Source of truth: Stitch UI DESIGN.md
 */
export const COLORS = {
  surface: '#0e150e',
  'surface-dim': '#0e150e',
  'surface-bright': '#333b33',
  'surface-container-lowest': '#091009',
  'surface-container-low': '#161d16',
  'surface-container': '#1a221a',
  'surface-container-high': '#242c24',
  'surface-container-highest': '#2f372e',
  'on-surface': '#dce5d9',
  'on-surface-variant': '#bccbb9',
  'inverse-surface': '#dce5d9',
  'inverse-on-surface': '#2a322a',
  outline: '#869585',
  'outline-variant': '#3d4a3d',
  'surface-tint': '#4ae176',
  primary: '#4be277',
  'on-primary': '#003915',
  'primary-container': '#22c55e',
  'on-primary-container': '#004b1e',
  'inverse-primary': '#006e2f',
  secondary: '#9ddf2e',
  'on-secondary': '#213600',
  'secondary-container': '#83c300',
  'on-secondary-container': '#304b00',
  tertiary: '#ffb5ab',
  'on-tertiary': '#60130d',
  'tertiary-container': '#ff8b7c',
  'on-tertiary-container': '#76231b',
  error: '#ffb4ab',
  'on-error': '#690005',
  'error-container': '#93000a',
  'on-error-container': '#ffdad6',
  background: '#0e150e',
  'on-background': '#dce5d9',
};

export const TAILWIND_CONFIG = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: COLORS,
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
    },
  },
};
