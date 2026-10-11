const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const MODEL_ID = 'philschmid/MiniLM-L6-H384-uncased-sst2';
const MODEL_ROOT = path.resolve(__dirname, '..', 'models', MODEL_ID);
const FILES = [
    ['config.json', 830, '3b31ca2ace86e10d0a738e72ce52143b09bbba9e7100306eff91448e1d64ca9f'],
    ['tokenizer.json', 466247, 'be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037'],
    ['tokenizer_config.json', 512, 'c12bf6c7c8a25f696582ac6d9fc38c606c93a8a5bdf71bcdf6af35a37c3c6e4e'],
    ['onnx/model_quantized.onnx', 23075378, 'f446516c826577aaa42b2bc6e874b9fc4c9d3fc836d80a540707a289f42184b9'],
];

async function sha256(filePath) {
    const hash = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(filePath), hash);
    return hash.digest('hex');
}

async function isValid(filePath, expectedSize, expectedSha256) {
    try {
        if (fs.statSync(filePath).size !== expectedSize) return false;
        return !expectedSha256 || await sha256(filePath) === expectedSha256;
    } catch {
        return false;
    }
}

async function main() {
    for (const [relativePath, expectedSize, expectedSha256] of FILES) {
        if (!await isValid(path.join(MODEL_ROOT, relativePath), expectedSize, expectedSha256)) {
            throw new Error(`MiniLM bundle missing or invalid: ${relativePath}. Run npm run model:export.`);
        }
    }
    const actualFiles = [];
    const visit = directory => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else actualFiles.push(path.relative(MODEL_ROOT, entryPath));
    });
    visit(MODEL_ROOT);
    const expectedFiles = FILES.map(([relativePath]) => relativePath).sort();
    if (JSON.stringify(actualFiles.sort()) !== JSON.stringify(expectedFiles)) {
        throw new Error('MiniLM bundle contains unexpected files. Run npm run model:export.');
    }
    console.log(`Verified local MiniLM sentiment model at ${MODEL_ROOT}`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
