/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg)',
        surface: 'var(--surface)',
        primary: 'var(--text)',
        muted: 'var(--muted)',
        line: 'var(--border)',
        ink: 'var(--ink)',
        leaf: 'var(--mastery)',
        clay: 'var(--hard)',
        sand: 'var(--ok)',
      },
      fontFamily: {
        serif: ['var(--font-head)', 'Georgia', 'serif'],
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
