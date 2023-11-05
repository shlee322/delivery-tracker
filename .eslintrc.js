module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  plugins: ["prettier"],
  extends: ["standard-with-typescript", "plugin:prettier/recommended"],
  overrides: [],
  parserOptions: {
    ecmaVersion: "latest",
    project: ["tsconfig.json"],
    sourceType: "module",
  },
  rules: {},
};
