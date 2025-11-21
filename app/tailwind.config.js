/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF9F66',      // Soft orange/peach (Headspace-inspired)
        secondary: '#6FB3B8',    // Muted blue-green
        accent: '#E8B4BC',       // Soft pink
        cream: '#FAF9F7',        // Warm background
        'warm-gray': {
          50: '#F7F5F2',
          100: '#EDEAE5',
          200: '#D9D5CE',
          300: '#B8B3A8',
          400: '#9A9589',
          500: '#6D6A61',
          600: '#5A5750',
          700: '#3F3D38',
          800: '#2D2D2D',
          900: '#1A1A1A'
        }
      },
      fontFamily: {
        'headline': ['Space Grotesk', 'system-ui', 'sans-serif'],
        'sans': ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif']
      },
      letterSpacing: {
        'tighter': '-0.02em'
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem'
      }
    }
  },
  plugins: []
};
