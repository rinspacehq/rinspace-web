import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createPayloadGate, businessPayloadLimit, filePayloadLimit } from './payload.mjs';

const incoming = (headers = {}, path = '/api/file') => {
  const request = new PassThrough(); request.headers = headers; request.method = 'POST'; request.url = path;
  request.on('end', () => { request.complete = true; }); return request;
};
const code = expected => error => { assert.equal(error.code, expected); assert.doesNotMatch(error.message, /PRIVATE_TOKEN/); return true; };

test('limits match the existing formal file handler and remain narrow', async () => {
  assert.equal(filePayloadLimit, 81 * 1024 * 1024); assert.equal(businessPayloadLimit, 32 * 1024 * 1024);
  const read = createPayloadGate();
  for (const [path, length] of [['/api/file', filePayloadLimit + 1], ['/api/content', businessPayloadLimit + 1], ['/api/file/other', businessPayloadLimit + 1]]) {
    const request = incoming({ 'content-length': String(length) }, path);
    await assert.rejects(read(request, path), code('local.payload_too_large')); request.destroy();
  }
  const invalid = incoming({ 'content-length': '9007199254740992' });
  await assert.rejects(read(invalid, '/api/file'), code('local.invalid_payload_length')); invalid.destroy();
  const compressed = incoming({ 'content-encoding': 'gzip' });
  await assert.rejects(read(compressed, '/api/file'), code('local.payload_encoding_rejected')); compressed.destroy();
});

test('the upload slot survives buffering, rejects concurrency and is released exactly once', async () => {
  const read = createPayloadGate();
  const first = incoming(); const pending = read(first, '/api/file'); first.end(Buffer.from([0, 255, 10]));
  const lease = await pending; assert.deepEqual(lease.body, Buffer.from([0, 255, 10]));
  const second = incoming(); await assert.rejects(read(second, '/api/file'), code('local.upload_busy')); second.destroy();
  const other = incoming({}, '/api/content'); const otherPending = read(other, '/api/content'); other.end('{}'); (await otherPending).release();
  lease.release(); lease.release();
  const third = incoming(); const thirdPending = read(third, '/api/file'); third.end('next'); (await thirdPending).release();
  assert.equal(first.listenerCount('error'), 0);
});

test('chunked bodies cannot bypass the ordinary transport limit', async () => {
  const read = createPayloadGate(); const request = incoming({}, '/api/content');
  const pending = assert.rejects(read(request, '/api/content'), code('local.payload_too_large'));
  request.write(Buffer.alloc(businessPayloadLimit + 1)); await pending; request.destroy();
});

test('partial and timed-out requests preserve errors, free the slot and do not wait indefinitely', async () => {
  const read = createPayloadGate({ readTimeout: 20 });
  const aborted = incoming(); const stopped = assert.rejects(read(aborted, '/api/file'), code('local.payload_interrupted'));
  aborted.write('partial'); aborted.emit('aborted'); aborted.destroy(new Error('PRIVATE_TOKEN')); await stopped;
  const slow = incoming();
  await Promise.all([assert.rejects(read(slow, '/api/file'), code('local.payload_timeout')), new Promise(resolve => setTimeout(resolve, 40))]);
  slow.destroy();
  const next = incoming(); const nextPending = read(next, '/api/file'); next.end('complete'); (await nextPending).release();
});
