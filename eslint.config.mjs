import htmlParser from "@html-eslint/parser";
import tsParser from "@typescript-eslint/parser";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import pluginVue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

const tailwind = {
  plugins: {
    "better-tailwindcss": betterTailwindcss,
  },
  settings: {
    "better-tailwindcss": {
      entryPoint: "src/style.css",
    },
  },
  rules: {
    "better-tailwindcss/no-unknown-classes": "error",
    "better-tailwindcss/no-duplicate-classes": "error",
    "better-tailwindcss/no-conflicting-classes": "warn",
  },
};

export default [
  {
    ignores: ["out/**", "release/**", "pg-data/**"],
  },
  ...pluginVue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      "vue/no-unused-vars": "error",
    },
  },
  {
    files: ["src/**/*.vue"],
    ...tailwind,
  },
  {
    files: ["src/**/*.html"],
    languageOptions: {
      parser: htmlParser,
    },
    ...tailwind,
  },
];
