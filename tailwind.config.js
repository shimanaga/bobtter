/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0e0d0c',
          900: '#161412',
          800: '#1e1c19',
          700: '#2a2724',
          600: '#3a3632',
          500: '#504b46',
          400: '#706860',
          300: '#9c9088',
          200: '#c5bdb4',
          100: '#e8e0d8',
          50:  '#f5f0eb',
        },
        amber: {
          500: '#e8a060',
          400: '#f0b478',
          300: '#f5c898',
          600: '#d08840',
          700: '#b87030',
        },
        rose: {
          400: '#e87878',
          500: '#d86060',
        },
        teal: {
          400: '#68c0b0',
          500: '#50a898',
        },
      },
      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
