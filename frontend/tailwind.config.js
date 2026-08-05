/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // True-neutral gray (Tailwind's default `gray` is blue-tinted in the
        // dark shades), so the whole UI reads monochrome.
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        // Muted oxide-red accent scale, centered on the brand red #a04040.
        red: {
          50: '#f7eded',
          100: '#efdcdc',
          200: '#e0bcbc',
          300: '#c99595',
          400: '#b56c6c',
          500: '#a85050',
          600: '#a04040',
          700: '#883434',
          800: '#6d2828',
          900: '#521c1c',
        },
      },
    },
  },
  plugins: [],
}
