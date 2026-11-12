// Lint holds only the mechanical rules that a review found (see CODING_STANDARDS.md).
// Types and tests have their own commands: `npm run typecheck` and `npm test`.
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", ".claude/", "src/api/schema.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "import-x": importX, "react-hooks": reactHooks },
    rules: {
      // All imports at the top of the file, and one import for each module.
      "import-x/first": "error",
      "import-x/no-duplicates": "error",
      // The code already has disable comments for this rule, so the rule must exist.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
