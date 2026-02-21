/**
 * ESLint configuration for ursalock monorepo
 *
 * Install dependencies before using:
 *   npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // Strict: no implicit any
    "@typescript-eslint/no-explicit-any": "error",
    // Warn on unused vars (allow underscore-prefixed)
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // Enforce consistent type imports
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" },
    ],
  },
  ignorePatterns: ["dist/", "node_modules/", "*.js", "*.cjs"],
};
