/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-2': 'var(--panel-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        accent: {
          DEFAULT: 'var(--accent)',
          2: 'var(--accent-2)',
          3: 'var(--accent-3)',
        },
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 10px 30px rgba(0, 0, 0, 0.35)',
        glow: '0 0 20px rgba(0, 229, 255, 0.45)',
        accent: '0 0 0 1px rgba(0, 229, 255, 0.35)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.2rem',
      },
      backgroundImage: {
        'accent-gradient': 'var(--grad-1)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '350ms',
      },
      keyframes: {
        'pulse-lane': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'pulse-lane': 'pulse-lane 3s ease-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
