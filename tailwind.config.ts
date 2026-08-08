import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#05060a",
          900: "#0a0c12",
          800: "#12151d",
          700: "#1b1f2b",
          600: "#262b3a",
        },
        aura: {
          blue: "#3b6bff",
          blueSoft: "#5b8bff",
          red: "#ff3b5c",
          redSoft: "#ff6b85",
        },
      },
      backgroundImage: {
        "aura-gradient":
          "radial-gradient(circle at 20% 20%, rgba(59,107,255,0.35), transparent 45%), radial-gradient(circle at 80% 30%, rgba(255,59,92,0.30), transparent 50%), radial-gradient(circle at 50% 90%, rgba(59,107,255,0.20), transparent 55%)",
        "aura-line": "linear-gradient(90deg, #3b6bff, #ff3b5c)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pulse-bar": {
          "0%, 100%": { transform: "scaleY(0.55)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "pulse-bar": "pulse-bar 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
