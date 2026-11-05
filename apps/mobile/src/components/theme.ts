import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  primary: '#4F46E5',
  primaryText: '#FFFFFF',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
};

const dark: typeof light = {
  bg: '#0B0F17',
  card: '#151B26',
  text: '#F1F5F9',
  muted: '#94A3B8',
  border: '#273041',
  primary: '#818CF8',
  primaryText: '#0B0F17',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
