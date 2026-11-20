import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        signal: "0 0 0 1px rgba(0,229,255,.14), 0 18px 42px rgba(0,0,0,.28)",
      },
      animation: {
        beacon: "beacon 1.7s ease-in-out infinite",
        scan: "scan 4s linear infinite",
      },
      keyframes: {
        beacon: { "0%, 100%": { opacity: "0.75", transform: "scale(1)" }, "50%": { opacity: "1", transform: "scale(1.12)" } },
        scan: { "0%": { transform: "translateY(-110%)" }, "100%": { transform: "translateY(110%)" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
