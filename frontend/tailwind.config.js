/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'text-text-on-interactive',
    'text-text-on-primary',
    'text-text-on-secondary',
    'text-text-on-surface',
    'text-text-on-status-success',
    'text-text-on-status-warning',
    'text-text-on-status-error',
    'text-text-on-status-info',
    'text-text-on-navigation',
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
          'interactive': 'var(--color-surface-interactive)',
          'interactive-hover': 'var(--color-surface-interactive-hover)',
        },
        // Text colors
        'text': {
          'primary': 'var(--color-text-primary)',
          'secondary': 'var(--color-text-secondary)',
          'tertiary': 'var(--color-text-tertiary)',
          'muted': 'var(--color-text-muted)',
          'disabled': 'var(--color-text-disabled)',
          'interactive-muted': 'var(--color-text-interactive-muted)',
          'interactive-on-dark': 'var(--color-text-interactive-on-dark)',
          'interactive-on-dark-hover': 'var(--color-text-interactive-on-dark-hover)',
          'interactive-on-dark-active': 'var(--color-text-interactive-on-dark-active)',
        },
        // Border colors
        'border': {
          'primary': 'var(--color-border-primary)',
          'secondary': 'var(--color-border-secondary)',
          'hover': 'var(--color-border-hover)',
          'focus': 'var(--color-border-focus)',
          'interactive-subtle': 'var(--color-border-interactive-subtle)',
          'interactive': 'var(--color-border-interactive)',
        },
        // Interactive colors
        'interactive': {
          'DEFAULT': 'var(--color-interactive-primary)',
          'hover': 'var(--color-interactive-hover)',
          'active': 'var(--color-interactive-active)',
          'text': 'var(--color-interactive-text)',
          'on-dark': 'var(--color-text-interactive-on-dark)',
          'on-dark-hover': 'var(--color-text-interactive-on-dark-hover)',
          'on-dark-active': 'var(--color-text-interactive-on-dark-active)',
          'on-dark-focus': 'var(--color-text-interactive-on-dark-focus)',
          'surface': 'var(--color-interactive-surface)',
          'surface-hover': 'var(--color-interactive-surface-hover)',
          'border': 'var(--color-interactive-border)',
          'border-hover': 'var(--color-interactive-border-hover)',
        },
        // Context-aware text colors (moved to root for proper generation)
        'text-on-primary': 'var(--color-text-on-primary)',
        'text-on-secondary': 'var(--color-text-on-secondary)',
        'text-on-tertiary': 'var(--color-text-on-tertiary)',
        'text-on-surface': 'var(--color-text-on-surface)',
        'text-on-interactive': 'var(--color-text-on-interactive)',
        'text-on-status-success': 'var(--color-text-on-status-success)',
        'text-on-status-warning': 'var(--color-text-on-status-warning)',
        'text-on-status-error': 'var(--color-text-on-status-error)',
        'text-on-status-info': 'var(--color-text-on-status-info)',
        'text-on-navigation': 'var(--color-text-on-navigation)',
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
        // Navigation-specific colors
        'surface-navigation': {
          'DEFAULT': 'var(--color-surface-navigation)',
          'hover': 'var(--color-surface-navigation-hover)',
          'active': 'var(--color-surface-navigation-active)',
          'selected': 'var(--color-surface-navigation-selected)',
          'selected-hover': 'var(--color-surface-navigation-selected-hover)',
        },
        'navigation': {
          'primary': 'var(--color-text-navigation-primary)',
          'secondary': 'var(--color-text-navigation-secondary)',
          'muted': 'var(--color-text-navigation-muted)',
          'selected': 'var(--color-text-navigation-selected)',
          'hover': 'var(--color-text-navigation-hover)',
          'section': 'var(--color-text-navigation-section)',
          'brand': 'var(--color-text-navigation-brand)',
        },
        'border-navigation': 'var(--color-border-navigation)',
        'divider-navigation': {
          'DEFAULT': 'var(--color-divider-navigation)',
          'subtle': 'var(--color-divider-navigation-subtle)',
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
        'dropdown-enhanced': 'var(--shadow-dropdown-enhanced)',
        'tactile': 'var(--shadow-tactile)',
        'tactile-hover': 'var(--shadow-tactile-hover)',
        'tactile-active': 'var(--shadow-tactile-active)',
        'dropdown-item': 'var(--shadow-dropdown-item)',
        'glow-interactive': 'var(--glow-interactive)',
        'glow-interactive-hover': 'var(--glow-interactive-hover)',
        'toggle-zone': 'var(--shadow-toggle-zone)',
        'toggle-zone-subtle': 'var(--shadow-toggle-zone-subtle)',
      },
      transitionDuration: {
        'fast': 'var(--duration-75)',
        'normal': 'var(--duration-150)',
        'slow': 'var(--duration-300)',
      },
      zIndex: {
        'dropdown-backdrop': 'var(--z-dropdown-backdrop)',
        'dropdown': 'var(--z-dropdown)',
        'sticky': 'var(--z-sticky)',
        'fixed': 'var(--z-fixed)',
        'modal-backdrop': 'var(--z-modal-backdrop)',
        'modal': 'var(--z-modal)',
        'popover': 'var(--z-popover)',
        'tooltip': 'var(--z-tooltip)',
      },
      borderColor: {
        'navigation': 'var(--color-border-navigation)',
        'divider-navigation': {
          'DEFAULT': 'var(--color-divider-navigation)',
          'subtle': 'var(--color-divider-navigation-subtle)',
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'in': 'in 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'zoom-in-95': 'zoom-in-95 0.2s ease-out',
        'dropdown-enter': 'dropdown-enter 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'dropdown-enter-up': 'dropdown-enter-up 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'in': {
          '0%': { opacity: 0, transform: 'scale(0.95)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'zoom-in-95': {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        'dropdown-enter': {
          '0%': { 
            opacity: 0, 
            transform: 'translateY(-8px) scale(0.96)' 
          },
          '100%': { 
            opacity: 1, 
            transform: 'translateY(0) scale(1)' 
          },
        },
        'dropdown-enter-up': {
          '0%': { 
            opacity: 0, 
            transform: 'translateY(8px) scale(0.96)' 
          },
          '100%': { 
            opacity: 1, 
            transform: 'translateY(0) scale(1)' 
          },
        },
      },
      ringColor: {
        'focus-ring-subtle': 'var(--color-focus-ring-subtle)',
      },
    },
  },
  plugins: [],
}