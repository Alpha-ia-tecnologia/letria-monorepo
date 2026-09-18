import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { access, link, lstat, mkdir, mkdtemp, readdir, readFile, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createNodeAudioBucket, MAX_STORED_AUDIO_BYTES, type NodeAudioObject } from '../lib/server/node-audio-bucket';

const key = 'school-a/student-a/recording-a';
const buffer = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;
const collect = async (object: NodeAudioObject | null): Promise<Uint8Array> => {
  assert.ok(object);
  return new Uint8Array(await new Response(object.body).arrayBuffer());
};
async function fixture(t: TestContext) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'letria-audio-test-'));
  // This path is created by mkdtemp, then checked before recursive test cleanup.
  t.after(async () => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('letria-audio-test-'));
    await rm(temporary, { recursive: true, force: true });
  });
  const root = path.join(temporary, 'private-audio');
  return { temporary, root, bucket: createNodeAudioBucket(root) };
}
const absent = async (file: string) => assert.rejects(access(file, constants.F_OK), { code: 'ENOENT' });

test('the factory requires an absolute volume path and performs no filesystem writes', async t => {
  const { root, bucket } = await fixture(t);
  assert.throws(() => createNodeAudioBucket('relative/audio'), /absoluto/);
  assert.throws(() => createNodeAudioBucket(''), /absoluto/);
  assert.throws(() => createNodeAudioBucket(root + '\0'), /absoluto/);
  await absent(root);
  assert.equal(await bucket.get(key), null);
  await bucket.delete(key);
  await absent(root);
});

test('audio and metadata survive recreation while only audio bytes are streamed to the caller', async t => {
  const { root, bucket } = await fixture(t);
  const audio = buffer('RIFF private test audio, with accents: áudio');
  await bucket.put(key, audio, { httpMetadata: { contentType: 'audio/wav' } });
  const object = await createNodeAudioBucket(root).get(key);
  assert.ok(object);
  assert.equal(object.size, audio.byteLength);
  assert.deepEqual(object.httpMetadata, { contentType: 'audio/wav' });
  assert.ok(object.body instanceof ReadableStream);
  assert.deepEqual(await collect(object), new Uint8Array(audio));
  assert.deepEqual(await readdir(path.join(root, 'school-a', 'student-a')), ['recording-a']);
  if (process.platform !== 'win32') {
    assert.equal((await lstat(path.join(root, key))).mode & 0o777, 0o600);
    assert.equal((await lstat(path.join(root, 'school-a'))).mode & 0o777, 0o700);
  }
});

test('audio is streamed in bounded chunks up to 7 MB and an oversized write leaves the old object intact', async t => {
  const { bucket } = await fixture(t);
  const bytes = new Uint8Array(MAX_STORED_AUDIO_BYTES).fill(29);
  await bucket.put(key, bytes.buffer);
  const object = await bucket.get(key);
  assert.ok(object);
  const reader = object.body.getReader();
  let total = 0;
  let chunks = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    assert.ok(item.value.length <= 64 * 1024);
    assert.ok(item.value.every(value => value === 29));
    total += item.value.length;
    chunks++;
  }
  assert.equal(total, MAX_STORED_AUDIO_BYTES);
  assert.ok(chunks > 1);
  await assert.rejects(bucket.put(key, new ArrayBuffer(MAX_STORED_AUDIO_BYTES + 1)), /7 MB/);
  assert.equal((await collect(await bucket.get(key))).byteLength, MAX_STORED_AUDIO_BYTES);
});

test('a reader holds one complete version while atomic replacements use unique temporary files', async t => {
  const { root, bucket } = await fixture(t);
  const original = buffer('original recording');
  await bucket.put(key, original, { httpMetadata: { contentType: 'audio/ogg' } });
  const originalReader = await bucket.get(key);
  assert.ok(originalReader);
  // Linux volumes support renaming over an open reader. NTFS locks that destination;
  // do not weaken atomicity with an unlink-and-recreate workaround on Windows.
  if (process.platform === 'win32') assert.deepEqual(await collect(originalReader), new Uint8Array(original));
  const values = Array.from({ length: 8 }, (_, index) => buffer(`replacement-${index}`.repeat(300)));
  try {
    const writes = await Promise.allSettled(values.map(value => bucket.put(key, value, { httpMetadata: { contentType: 'audio/webm' } })));
    for (const result of writes) { if (result.status === 'rejected') throw result.reason; }
    if (process.platform !== 'win32') assert.deepEqual(await collect(originalReader), new Uint8Array(original));
  } finally {
    if (!originalReader.body.locked) await originalReader.body.cancel();
  }
  const latest = await bucket.get(key);
  assert.deepEqual(latest?.httpMetadata, { contentType: 'audio/webm' });
  const received = await collect(latest);
  assert.ok(values.some(value => Buffer.from(value).equals(Buffer.from(received))));
  assert.deepEqual(await readdir(path.join(root, 'school-a', 'student-a')), ['recording-a']);
});

test('cancelling a stream closes it and permits replacement and removal of that recording', async t => {
  const { bucket } = await fixture(t);
  await bucket.put(key, new Uint8Array(200_000).buffer);
  const object = await bucket.get(key);
  assert.ok(object);
  const reader = object.body.getReader();
  assert.equal((await reader.read()).done, false);
  await reader.cancel();
  assert.equal((await reader.read()).done, true);
  await bucket.put(key, buffer('replacement'));
  await bucket.delete(key);
  assert.equal(await bucket.get(key), null);
});

test('keys cannot traverse, become absolute paths, use backslashes, nulls, encoded paths or alternate streams', async t => {
  const { root, bucket } = await fixture(t);
  const invalid = [
    '../student/recording', 'school/../recording', 'school/student/..',
    '/school/student/recording', 'school/student/recording/', 'school//recording',
    'C:\\school\\student\\recording', 'school\\student/recording', 'school/student/recording\0',
    'school/student/recording:secret', 'school/student/%2e%2e', 'school/student/recording.exe',
    'school/student/recording/child', 'school/student', 'school/student/CON',
  ];
  for (const bad of invalid) {
    await assert.rejects(bucket.put(bad, buffer('unreachable')), /Chave/);
    await assert.rejects(bucket.get(bad), /Chave/);
    await assert.rejects(bucket.delete(bad), /Chave/);
  }
  await absent(root);
});

test('institution and student paths stay separate and deletion only removes explicitly named files', async t => {
  const { root, bucket } = await fixture(t);
  const keys = [key, 'school-a/student-b/recording-a', 'school-b/student-a/recording-a', 'school-a/student-a/recording-b'];
  await Promise.all(keys.map((id, index) => bucket.put(id, buffer(`audio-${index}`))));
  await assert.rejects(bucket.delete([key, '../student/recording']), /Chave/);
  assert.equal(new TextDecoder().decode(await collect(await bucket.get(key))), 'audio-0');
  await bucket.delete([key, 'school-a/student-a/missing', key]);
  await bucket.delete(key);
  assert.equal(await bucket.get(key), null);
  for (let index = 1; index < keys.length; index++) {
    assert.equal(new TextDecoder().decode(await collect(await bucket.get(keys[index]))), `audio-${index}`);
  }
  assert.ok((await lstat(path.join(root, 'school-a', 'student-a'))).isDirectory());
  await bucket.delete(keys.slice(1));
  assert.deepEqual(await readdir(path.join(root, 'school-a', 'student-a')), []);
});

test('symlinked roots and tenant directories are rejected without writing or reading outside the volume', async t => {
  const { temporary, root } = await fixture(t);
  const outside = path.join(temporary, 'outside');
  await mkdir(outside);
  const linkRoot = path.join(temporary, 'linked-volume');
  // Junction creation does not require Windows Developer Mode or administrator rights.
  await symlink(outside, linkRoot, process.platform === 'win32' ? 'junction' : 'dir');
  const redirected = createNodeAudioBucket(linkRoot);
  for (const operation of [() => redirected.get(key), () => redirected.put(key, buffer('private')), () => redirected.delete(key)]) {
    await assert.rejects(operation, /armazenamento privado/);
  }
  await mkdir(root);
  await symlink(outside, path.join(root, 'school-a'), process.platform === 'win32' ? 'junction' : 'dir');
  const bucket = createNodeAudioBucket(root);
  for (const operation of [() => bucket.get(key), () => bucket.put(key, buffer('private')), () => bucket.delete(key)]) {
    await assert.rejects(operation, /armazenamento privado/);
  }
  assert.deepEqual(await readdir(outside), []);
});

test('a redirect introduced after a successful operation is checked again for every access', async t => {
  const { temporary, root, bucket } = await fixture(t);
  await bucket.put(key, buffer('original'));
  await bucket.delete(key);
  const studentDirectory = path.join(root, 'school-a', 'student-a');
  await rmdir(studentDirectory); // Deliberately empty; never recursive.
  const outside = path.join(temporary, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'recording-a'), 'outside must remain untouched');
  await symlink(outside, studentDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(bucket.get(key), /armazenamento privado/);
  await assert.rejects(bucket.put(key, buffer('replacement')), /armazenamento privado/);
  await assert.rejects(bucket.delete(key), /armazenamento privado/);
  assert.equal(await readFile(path.join(outside, 'recording-a'), 'utf8'), 'outside must remain untouched');
});

test('objects that are directories or hard links are rejected instead of following or removing them', async t => {
  const { temporary, root, bucket } = await fixture(t);
  const parent = path.join(root, 'school-a', 'student-a');
  await mkdir(parent, { recursive: true });
  const outsideFile = path.join(temporary, 'outside-file');
  await writeFile(outsideFile, 'private external data');
  await link(outsideFile, path.join(parent, 'recording-a'));
  for (const operation of [() => bucket.get(key), () => bucket.put(key, buffer('replacement')), () => bucket.delete(key)]) {
    await assert.rejects(operation, /armazenamento privado/);
  }
  await mkdir(path.join(parent, 'recording-directory'));
  await writeFile(path.join(parent, 'recording-directory', 'keep'), 'keep this file');
  await assert.rejects(bucket.delete('school-a/student-a/recording-directory'), /armazenamento privado/);
  assert.equal(await readFile(outsideFile, 'utf8'), 'private external data');
  assert.equal(await readFile(path.join(parent, 'recording-directory', 'keep'), 'utf8'), 'keep this file');
});

test('corrupted containers and invalid metadata fail before exposing a body', async t => {
  const { root, bucket } = await fixture(t);
  await assert.rejects(bucket.put(key, buffer('audio'), { httpMetadata: { contentType: 'audio/wav\r\nprivate-header: value' } }), /Tipo/);
  await absent(root);
  await bucket.put(key, buffer('audio'));
  await writeFile(path.join(root, key), 'incomplete private file');
  await assert.rejects(bucket.get(key));
  await bucket.delete(key);
  assert.equal(await bucket.get(key), null);
});
