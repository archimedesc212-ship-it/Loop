'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { localMediaEnabled } = require('../src/providers/runtimeCapabilities');

test('serverless runtimes always disable local filesystem media', () => {
  assert.equal(localMediaEnabled({ isServerless: true, configured: 'true' }), false);
  assert.equal(localMediaEnabled({ isServerless: true, configured: undefined }), false);
});

test('persistent hosts enable local media by default', () => {
  assert.equal(localMediaEnabled({ isServerless: false, configured: undefined }), true);
  assert.equal(localMediaEnabled({ isServerless: false, configured: '' }), true);
});

test('persistent hosts can explicitly disable local media', () => {
  assert.equal(localMediaEnabled({ isServerless: false, configured: 'false' }), false);
  assert.equal(localMediaEnabled({ isServerless: false, configured: 'true' }), true);
});
