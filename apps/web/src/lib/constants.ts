export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'
export const APP_NAME = 'Syncra'
export const APP_VERSION = '1.0.0'

// Local storage keys
export const STORAGE_KEYS = {
  THEME: 'syncra_theme',
  ACCENT: 'syncra_accent',
} as const

// Accent color options for the customizable accent picker
// Yellow is the temporary default brand accent — will be swapped out in a later phase.
export const ACCENT_COLORS = [
  { name: 'Yellow', value: '#D97706', hover: '#F59E0B' },
  { name: 'Indigo', value: '#6366f1', hover: '#818cf8' },
  { name: 'Blue', value: '#3b82f6', hover: '#60a5fa' },
  { name: 'Purple', value: '#8b5cf6', hover: '#a78bfa' },
  { name: 'Teal', value: '#14b8a6', hover: '#2dd4bf' },
  { name: 'Rose', value: '#f43f5e', hover: '#fb7185' },
] as const

export type AccentColor = typeof ACCENT_COLORS[number]['name']
