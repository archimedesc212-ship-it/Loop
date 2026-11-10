'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const entryPath = require.resolve('../../api/index');
const originalLoad = Module._load;
let observedUrl = null;
const mockApp = (req) => { observedUrl = req.url; };
Module._load = function load(request, parent, isMain) {
  if (parent?.filename === entryPath && request === '../backend/src/app') return mockApp;
  return originalLoad.call(this, request, parent, isMain);
};
let handler;
try { handler = require(entryPath); } finally { Module._load = originalLoad; }

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('Vercel adapter restores the Express API path and preserves unrelated query parameters', () => {
  observedUrl = null;
  handler({ url: '/api?__loop_path=music%2Fyoutube&q=bollywood&limit=8' }, response());
  assert.equal(observedUrl, '/api/music/youtube?q=bollywood&limit=8');
});

test('Vercel adapter rejects missing, traversal and absolute API paths', () => {
  for (const url of ['/api', '/api?__loop_path=..%2Fsecret', '/api?__loop_path=%2Fhealth']) {
    const res = response();
    observedUrl = null;
    handler({ url }, res);
    assert.equal(res.statusCode, 400, url);
    assert.equal(res.body?.error?.code, 'INVALID_API_PATH', url);
    assert.equal(observedUrl, null, url);
  }
});
