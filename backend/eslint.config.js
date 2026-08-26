const js = require("@eslint/js");

const browserGlobals = {
    window: "readonly",
    document: "readonly",
    console: "readonly",
    fetch: "readonly",
    localStorage: "readonly",
    sessionStorage: "readonly",
    URLSearchParams: "readonly",
    FormData: "readonly",
    FileReader: "readonly",
    navigator: "readonly",
    location: "readonly",
    history: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    setInterval: "readonly",
    clearInterval: "readonly",
    requestAnimationFrame: "readonly",
    alert: "readonly",
    confirm: "readonly",
    prompt: "readonly",
    AbortController: "readonly",
    structuredClone: "readonly",
    Chart: "readonly",
    XLSX: "readonly",
    Blob: "readonly",
    URL: "readonly"
};

module.exports = [
    js.configs.recommended,
    {
        ignores: ["node_modules/"],
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-console": "off",
            "no-undef": "off" // To avoid module/require errors without full env setup
        }
    },
    {
        files: ["public/js/**/*.js", "public/js/**/*.mjs"],
        languageOptions: {
            sourceType: "module",
            globals: browserGlobals
        },
        rules: {
            "no-undef": "error"
        }
    }
];
