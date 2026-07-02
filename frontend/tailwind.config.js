/** @type {import('tailwindcss').Config} */

// Semantic design tokens. Values live as RGB triplets in globals.css
// (:root = light, `.dark .app-surface` = dark) so one utility class is
// correct in both themes — no `dark:` variants needed on token utilities.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: token('surface'),
          page: token('surface-page'),
          muted: token('surface-muted'),
          rail: token('surface-rail'),
        },
        ink: {
          DEFAULT: token('ink'),
          secondary: token('ink-secondary'),
          muted: token('ink-muted'),
          faint: token('ink-faint'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          text: token('accent-text'),
          surface: token('accent-surface'),
          border: token('accent-border'),
        },
        danger: {
          DEFAULT: token('danger'),
          hover: token('danger-hover'),
        },
        line: {
          DEFAULT: token('line'),
          subtle: token('line-subtle'),
        },
      },
      boxShadow: {
        // Depth for interactive surfaces; tracks theme via --shadow-color.
        lift: '0 8px 24px -8px rgb(var(--shadow-color) / 0.18), 0 2px 6px -2px rgb(var(--shadow-color) / 0.10)',
        pop: '0 16px 40px -12px rgb(var(--shadow-color) / 0.24), 0 4px 12px -4px rgb(var(--shadow-color) / 0.12)',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
        'fade-in': 'fadeIn 0.3s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
    },
  },
  plugins: [],
}
