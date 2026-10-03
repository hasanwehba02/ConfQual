import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const pages = ['index.html', 'login.html', '404.html'].map((name) => ({
    name,
    html: fs.readFileSync(path.join(directory, name), 'utf8')
}));

test('HTML pages have private, distinct, accessible document metadata', () => {
    const titles = new Set();
    for (const { name, html } of pages) {
        assert.match(html, /<html lang="en">/, `${name} needs a language`);
        assert.match(html, /<meta name="description" content="[^"]+">/, `${name} needs a description`);
        assert.match(html, /<meta name="robots" content="noindex, nofollow/, `${name} must not be indexed`);
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
        assert.ok(title, `${name} needs a title`);
        assert.ok(!titles.has(title), `${name} title must be unique`);
        titles.add(title);
        assert.equal((html.match(/<h1\b/g) || []).length, 1, `${name} must have exactly one H1`);
    }
});

test('static image elements always have alt text', () => {
    for (const { name, html } of pages) {
        const images = html.match(/<img\b[^>]*>/g) || [];
        for (const image of images) {
            assert.match(image, /\balt="[^"]*"/, `${name} has an image without alt text`);
        }
    }
});

test('drawer close controls have visible text and accessible names', () => {
    const index = pages.find(({ name }) => name === 'index.html').html;
    const buttons = index.match(/<button[^>]*class="[^"]*drawer-close-button[^"]*"[^>]*>[^<]+<\/button>/g) || [];
    assert.equal(buttons.length, 4);
    for (const button of buttons) {
        assert.match(button, /aria-label="Close [^"]+"/);
        assert.match(button, /&times;/);
    }
});

test('robots.txt blocks indexing of the private application', () => {
    const robots = fs.readFileSync(path.join(directory, 'robots.txt'), 'utf8');
    assert.match(robots, /User-agent: \*/);
    assert.match(robots, /Disallow: \//);
});

test('private application does not publish crawler discovery files', () => {
    assert.equal(fs.existsSync(path.join(directory, 'sitemap.xml')), false);
    assert.equal(fs.existsSync(path.join(directory, 'llms.txt')), false);
});
