import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        portal: {
          50: "#f7f7fb",
          100: "#ececf5",
          500: "#5b5bd6",
          700: "#3730a3"
        }
      }
    },
  },
  plugins: [],
};
export default config;
