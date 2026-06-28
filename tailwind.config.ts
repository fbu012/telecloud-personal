import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        muted: 'var(--muted)',
        primary: 'var(--primary)',
        accent: 'var(--accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      borderRadius: {
        xl: 'var(--radius)',
        '2xl': 'calc(var(--radius) + 4px)',
      },
      boxShadow: {
        soft: '0 6px 18px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
