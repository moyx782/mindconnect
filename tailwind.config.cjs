module.exports = {
      content: ['./ui/**/*.{html,js}'],
 darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
          },
          boxShadow: {
            'card': '0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 1px 3px -1px rgba(15, 23, 42, 0.04)',
            'card-hover': '0 8px 20px -4px rgba(15, 23, 42, 0.12), 0 4px 8px -2px rgba(15, 23, 42, 0.06)',
            'card-selected': '0 0 0 2px #3b82f6, 0 10px 24px -4px rgba(59, 130, 246, 0.22)',
            'float': '0 10px 30px -5px rgba(15, 23, 42, 0.14), 0 4px 10px -3px rgba(15, 23, 42, 0.06)',
          }
        }
      }
    }