/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ps-purple': '#8B00FF',
        'ps-purple-dark': '#6A0DAD',
        'ps-accent': '#FF007F',
        'ps-cyan': '#00FFFF',
        'ps-bg': '#0F0C20',
        'ps-card': '#1A1633',
        'ps-card-alt': '#252044',
      }
    },
  },
  plugins: [],
}
