import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["**/*.js", "**/*.ts"],
    rules: {
      "max-lines": [
        "error",
        {
          max: 200,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },

  {
    files: ["**/*.jsx", "**/*.tsx"],
    rules: {
      "max-lines": [
        "error",
        {
          max: 400,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },

  {
    ignores: ["dist/**", "build/**", "coverage/**"],
  },
);