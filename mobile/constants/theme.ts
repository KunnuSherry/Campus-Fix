export const Colors = {
  primary: '#1e3a8a',       // Deep Royal Blue
  primaryDark: '#0f172a',
  primaryLight: '#3b82f6',
  accent: '#f59e0b',        // Amber Gold
  background: '#f8fafc',    // Slate light background
  card: '#ffffff',
  text: '#0f172a',          // Slate 900
  textMuted: '#64748b',     // Slate 500
  textLight: '#94a3b8',
  border: '#e2e8f0',
  error: '#ef4444',
  errorLight: '#fee2e2',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  info: '#0ea5e9',
  infoLight: '#e0f2fe',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const Typography = {
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.text,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: Colors.textMuted,
  },
};

