/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#030712',   // gray-950 — app canvas
        panel: '#111827',  // gray-900 — chrome surfaces (top bar, side panels, waveform dock)
        raised: '#1F2937', // gray-800 — hover fills, chips, inset elements on panels
        line: '#1F2937',   // gray-800 — dividers on panel surfaces
      },
    },
  },
  plugins: [],
};
