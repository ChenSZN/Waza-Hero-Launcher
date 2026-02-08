/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                riot: {
                    gold: '#c8aa6e',
                    'gold-dark': '#a09b8c',
                    bg: '#010a13',
                    'bg-dark': '#010101',
                }
            },
            fontFamily: {
                sans: ['Inter', 'Spiegel', 'Beaufort for LoL', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
