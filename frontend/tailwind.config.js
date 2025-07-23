/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'git-synced': {
          DEFAULT: '#22C55E',
          dark: '#16A34A',
        },
        'git-merge': {
          DEFAULT: '#10B981',
          dark: '#059669',
        },
        'git-active': {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
        },
        'git-ahead': {
          DEFAULT: '#3B82F6',
          dark: '#2563EB',
        },
        'git-behind': {
          DEFAULT: '#D97706',
          dark: '#EA580C',
        },
        'git-diverged': {
          DEFAULT: '#8B5CF6',
          dark: '#7C3AED',
        },
        'git-conflict': {
          DEFAULT: '#DC2626',
          dark: '#EF4444',
        },
        'git-untracked': {
          DEFAULT: '#1E3A8A',
          dark: '#1E40AF',
        },
        'git-unknown': {
          DEFAULT: '#9CA3AF',
          dark: '#6B7280',
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
}