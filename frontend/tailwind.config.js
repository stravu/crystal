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
        // Git-specific colors from main branch
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
        // Design token colors
        // Background colors
        'bg': {
          'primary': 'var(--color-bg-primary)',
          'secondary': 'var(--color-bg-secondary)',
          'tertiary': 'var(--color-bg-tertiary)',
          'hover': 'var(--color-bg-hover)',
          'active': 'var(--color-bg-active)',
        },
        // Surface colors
        'surface': {
          'primary': 'var(--color-surface-primary)',
          'secondary': 'var(--color-surface-secondary)',
          'hover': 'var(--color-surface-hover)',
        },
        // Text colors
        'text': {
          'primary': 'var(--color-text-primary)',
          'secondary': 'var(--color-text-secondary)',
          'tertiary': 'var(--color-text-tertiary)',
          'muted': 'var(--color-text-muted)',
          'disabled': 'var(--color-text-disabled)',
        },
        // Border colors
        'border': {
          'primary': 'var(--color-border-primary)',
          'secondary': 'var(--color-border-secondary)',
          'hover': 'var(--color-border-hover)',
          'focus': 'var(--color-border-focus)',
        },
        // Interactive colors
        'interactive': {
          'DEFAULT': 'var(--color-interactive-primary)',
          'hover': 'var(--color-interactive-hover)',
          'active': 'var(--color-interactive-active)',
          'text': 'var(--color-interactive-text)',
        },
        // Status colors
        'status': {
          'success': 'var(--color-status-success)',
          'success-hover': 'var(--color-status-success-hover)',
          'warning': 'var(--color-status-warning)',
          'warning-hover': 'var(--color-status-warning-hover)',
          'error': 'var(--color-status-error)',
          'error-hover': 'var(--color-status-error-hover)',
          'info': 'var(--color-status-info)',
          'neutral': 'var(--color-status-neutral)',
        },
        // Brand colors
        'discord': {
          'DEFAULT': 'var(--discord-primary)',
          'hover': 'var(--discord-hover)',
          'secondary': 'var(--discord-secondary)',
        },
        // Modal colors
        'modal': {
          'overlay': 'var(--color-modal-overlay)',
        },
      },
      spacing: {
        // Component spacing
        'button-x': 'var(--button-padding-x)',
        'button-y': 'var(--button-padding-y)',
        'button-x-sm': 'var(--button-padding-x-sm)',
        'button-y-sm': 'var(--button-padding-y-sm)',
        'button-x-lg': 'var(--button-padding-x-lg)',
        'button-y-lg': 'var(--button-padding-y-lg)',
        'card': 'var(--card-padding)',
        'card-sm': 'var(--card-padding-sm)',
        'card-lg': 'var(--card-padding-lg)',
        'input-x': 'var(--input-padding-x)',
        'input-y': 'var(--input-padding-y)',
        'modal': 'var(--modal-padding)',
      },
      borderRadius: {
        'button': 'var(--button-radius)',
        'card': 'var(--card-radius)',
        'input': 'var(--input-radius)',
        'modal': 'var(--modal-radius)',
        'badge': 'var(--badge-radius)',
      },
      fontSize: {
        'heading-1': ['var(--heading-1-size)', { lineHeight: 'var(--heading-1-line-height)', fontWeight: 'var(--heading-1-weight)' }],
        'heading-2': ['var(--heading-2-size)', { lineHeight: 'var(--heading-2-line-height)', fontWeight: 'var(--heading-2-weight)' }],
        'heading-3': ['var(--heading-3-size)', { lineHeight: 'var(--heading-3-line-height)', fontWeight: 'var(--heading-3-weight)' }],
        'body': ['var(--body-size)', { lineHeight: 'var(--body-line-height)', fontWeight: 'var(--body-weight)' }],
        'body-sm': ['var(--body-sm-size)', { lineHeight: 'var(--body-sm-line-height)', fontWeight: 'var(--body-sm-weight)' }],
        'button': ['var(--button-size)', { fontWeight: 'var(--button-weight)' }],
        'label': ['var(--label-size)', { fontWeight: 'var(--label-weight)' }],
        'caption': ['var(--caption-size)', { fontWeight: 'var(--caption-weight)' }],
      },
      boxShadow: {
        'button': 'var(--button-shadow)',
        'button-hover': 'var(--button-shadow-hover)',
        'card': 'var(--card-shadow)',
        'modal': 'var(--modal-shadow)',
        'dropdown': 'var(--dropdown-shadow)',
      },
      transitionDuration: {
        'fast': 'var(--duration-75)',
        'normal': 'var(--duration-150)',
        'slow': 'var(--duration-300)',
      },
      zIndex: {
        'dropdown': 'var(--z-dropdown)',
        'sticky': 'var(--z-sticky)',
        'fixed': 'var(--z-fixed)',
        'modal-backdrop': 'var(--z-modal-backdrop)',
        'modal': 'var(--z-modal)',
        'popover': 'var(--z-popover)',
        'tooltip': 'var(--z-tooltip)',
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