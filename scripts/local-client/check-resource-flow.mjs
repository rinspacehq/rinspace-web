// Exercises the actual browser service modules and global request interceptor.
// All business responses come from the existing clean-room identity transport.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function checkResourceFlow({ page, fixture, baseline = false }) {
  const result = await page.evaluate(async () => {
    const download = await fetch('/api/file/synthetic-direct-download', { headers: { Range: 'bytes=0-3' } });
    const metadata = { status: download.status, disposition: download.headers.get('content-disposition'), range: download.headers.get('content-range'),
      cookie: download.headers.get('set-cookie'), cors: download.headers.get('access-control-allow-origin'), bytes: [...new Uint8Array(await download.arrayBuffer())] };
    const { uploadAnswerFile } = await import('/src/services/feed.ts');
    let largeUpload = false;
    try {
      await uploadAnswerFile('post_attachment', new File([new Uint8Array(33 * 1024 * 1024)], 'synthetic-paper.pdf', { type: 'application/pdf' }));
      largeUpload = true;
    } catch { /* The baseline has a known lower transport limit; record failure. */ }
    const { uploadAvatarFile, uploadCoverFile, saveProfile } = await import('/src/services/profile.ts');
    const owner = { id: 'synthetic-local-user' };
    const image = new File([new Uint8Array([0, 255, 13, 10])], 'synthetic-image.png', { type: 'image/png' });
    await uploadAvatarFile(owner, image); await uploadCoverFile(owner, image);
    let profileSaved = false;
    try { await saveProfile(owner, { username: 'synthetic', nickname: 'Synthetic account', avatarDataUrl: 'https://rinspace.com/assets/synthetic-upload.png', bio: '', website: '', location: '', aboutHtml: '' }); profileSaved = true; }
    catch { /* The baseline lacks the existing profile resource. */ }
    const envelope = await (await fetch('/api/identity/v1/session')).json();
    const uncertain = await fetch('/api/content/synthetic-uncertain-write', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Rinspace-CSRF': envelope.csrfToken }, body: '{}' });
    return { metadata, largeUpload, profileSaved, uncertainStatus: uncertain.status };
  });
  assert.equal(result.metadata.status, 206); assert.equal(result.metadata.range, 'bytes 0-3/10');
  assert.deepEqual(result.metadata.bytes, [0, 255, 13, 10]);
  assert.equal(result.metadata.cookie, null); assert.equal(result.metadata.cors, null);
  assert.equal(result.uncertainStatus, 401);
  assert.equal(result.largeUpload, !baseline); assert.equal(result.profileSaved, !baseline);
  if (baseline) {
    assert.equal(result.metadata.disposition, null); assert.equal(fixture.state.uncertainWrites, 2);
    console.log('Resource baseline reproduced: 33 MiB rejected, download filename stripped, profile blocked, and a local POST was sent twice after 401.');
  } else {
    assert.match(result.metadata.disposition, /filename\*=UTF-8''%E8%AE%BA%E6%96%87.bin/);
    assert.equal(fixture.state.uncertainWrites, 1);
    assert.deepEqual(fixture.state.uploads.map(item => item.source), ['post_attachment', 'avatar', 'cover']);
    assert.equal(fixture.state.uploads[0].bytes, 33 * 1024 * 1024);
    assert.equal(fixture.state.uploads[0].sha256, createHash('sha256').update(Buffer.alloc(33 * 1024 * 1024)).digest('hex'));
    console.log('Resource checks passed: existing upload/profile service modules, binary bytes/Range/international filename, and no local write replay. No production object or profile was changed.');
  }
}
