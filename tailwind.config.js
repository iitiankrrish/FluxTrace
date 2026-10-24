export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        paper: { DEFAULT: '#f7f5f0', 2: '#efece5', 3: '#e6e2d9' },
        ink: {
          900: '#23262d',
          800: '#33373f',
          700: '#4a4f5a',
          600: '#60656f',
          500: '#7b808a',
          400: '#9aa0a8',
          300: '#c5c8cc',
          200: '#dcdbd6',
          100: '#ebe9e3',
        },
        sky: { DEFAULT: '#d6e4f2', line: '#9fb9d6', ink: '#3d5f86' },
        sage: { DEFAULT: '#d8eadc', line: '#a3c6ab', ink: '#3f6b4c' },
        peach: { DEFAULT: '#f6e0cc', line: '#ddb48e', ink: '#8a5a32' },
        lilac: { DEFAULT: '#e3dcf1', line: '#b6a8d8', ink: '#5b4d87' },
        rose: { DEFAULT: '#f3dade', line: '#d7a7ae', ink: '#8b4450' },
        butter: { DEFAULT: '#f6edc4', line: '#d9c77c', ink: '#7a6420' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(35,38,45,.06), 0 1px 1px rgba(35,38,45,.04)',
        lift: '0 4px 10px -4px rgba(35,38,45,.25)',
      },
    },
  },
  plugins: [],
};
