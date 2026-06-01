/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#1a1f2e',
        sidebar: '#111827',
        card: '#1f2937',
        accent: '#00BCD4',
        'accent-hover': '#00A5BB',
        primary: '#F9FAFB',
        secondary: '#9CA3AF',
        success: '#84CC16',
        danger: '#EF4444',
        border: '#374151',
      },
    },
  },
  plugins: [],
};
