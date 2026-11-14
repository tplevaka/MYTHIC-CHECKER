/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0C10",
        panel: "#111318",
        edge: "#1E222D",
        edgeLight: "#2A2F3D",
        accent: {
          DEFAULT: "#DC2626",
          dim: "#8A1515",
          glow: "rgba(220, 38, 38, 0.35)",
        },
        muted: "#8B93A7",
        faint: "#565D6E",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      boxShadow: {
        "accent-glow": "0 0 24px rgba(220, 38, 38, 0.25), inset 0 0 12px rgba(220, 38, 38, 0.08)",
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "scan-slide": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(300%)" },
        },
      },
      animation: {
        "fade-up": "fade-up .25s ease-out both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "scan-slide": "scan-slide 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
