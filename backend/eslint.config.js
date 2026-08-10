const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        ignores: ["public/", "node_modules/"],
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-console": "off",
            "no-undef": "off" // To avoid module/require errors without full env setup
        }
    }
];
