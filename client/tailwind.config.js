/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'tn-bg': '#F5F0E8',
        'tn-panel': '#FFFFFF',
        'tn-panel2': '#EDE8DF',
        'tn-cream': '#E8E0D0',
        'tn-border': '#D5CFC4',
        'tn-text': '#2C2C2C',
        'tn-muted': '#8A8580',
        'tn-primary': '#4A2DBF',
        'tn-primary-hover': '#6B4FD6',
        'tn-accent': '#ff6b9d',
        'tn-success': '#22c55e',
        'tn-warning': '#f59e0b',
        'tn-error': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
