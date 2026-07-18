import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["dist/**", "coverage/**"] },
  { files: ["**/*.{js,mjs,cjs,jsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  pluginReact.configs.flat.recommended,
  {
    settings: { react: { version: "detect" } },
    rules: {
      // Vite compiles with the automatic JSX runtime, so React need not be in scope.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // This codebase does not use PropTypes; props are documented by usage.
      "react/prop-types": "off",
    },
  },
  // Vitest files run under Node-flavored jsdom (__dirname, process, etc.).
  {
    files: ["src/**/*.test.{js,jsx}", "src/test/**/*.{js,jsx}", "vitest.config.js", "vite.config.js", "tailwind.config.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
]);
