import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as waitForFile } from 'node:timers/promises';

export const MAX_STORED_AUDIO_BYTES = 7 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const MAGIC = Buffer.from('LETRIA-AUDIO\0', 'ascii');
const PREFIX_BYTES = MAGIC.length + 4;
const COMPONENT = /^[A-Za-z0-9_-]{1,128}$/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

type AudioMetadata = { version: 1; size: number; contentType?: string };
export interface NodeAudioObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpMetadata?: { contentType?: string };
}
export interface NodeAudioBucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata: { contentType: string } }): Promise<void>;
  get(key: string): Promise<NodeAudioObject | null>;
  delete(key: string | string[]): Promise<void>;
}

function storageError(): Error { return new Error('O arquivo de áudio não está disponível no armazenamento privado.'); }
function missing(error: unknown): boolean { return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'; }
function alreadyExists(error: unknown): boolean { return !!error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'; }
function comparable(value: string): string { return process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value); }

function keyParts(key: string): [string, string, string] {
  if (typeof key !== 'string') throw new TypeError('Chave de áudio inválida.');
  const parts = key.split('/');
  if (parts.length !== 3 || parts.some(part => !COMPONENT.test(part) || WINDOWS_DEVICE.test(part))) {
    throw new TypeError('Chave de áudio inválida.');
  }
  return parts as [string, string, string];
}

function contentType(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.length || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new TypeError('Tipo de áudio inválido.');
  }
  return value;
}

async function statEntry(file: string) {
  try { return await lstat(file); }
  catch (error) { if (missing(error)) return null; throw error; }
}

/** Each ancestor is checked, including existing parents of the configured root. */
async function safeDirectory(directory: string, create: boolean): Promise<boolean> {
  const parsed = path.parse(directory);
  const parts = path.relative(parsed.root, directory).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat = await statEntry(current);
    if (!stat && create) {
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) { if (!alreadyExists(error)) throw error; }
      stat = await statEntry(current);
    }
    if (!stat) return false;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw storageError();
  }
  // Also rejects directory junctions/reparse redirects resolved by the platform.
  if (comparable(await realpath(directory)) !== comparable(directory)) throw storageError();
  return true;
}

function requireRegularFile(stat: Awaited<ReturnType<typeof lstat>>): void {
  // Hard links must not expose content shared with another location either.
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw storageError();
}

async function readExact(handle: FileHandle, count: number, position: number): Promise<Buffer> {
  const bytes = Buffer.alloc(count);
  let offset = 0;
  while (offset < count) {
    const result = await handle.read(bytes, offset, count - offset, position + offset);
    if (!result.bytesRead) throw storageError();
    offset += result.bytesRead;
  }
  return bytes;
}

function audioStream(handle: FileHandle, offset: number, size: number): ReadableStream<Uint8Array> {
  let position = 0;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await handle.close();
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (position >= size) { await close(); controller.close(); return; }
        const bytes = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, size - position));
        const result = await handle.read(bytes, 0, bytes.length, offset + position);
        if (closed) return;
        if (!result.bytesRead) throw storageError();
        position += result.bytesRead;
        controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset, result.bytesRead));
        if (position === size) { await close(); controller.close(); }
      } catch (error) {
        if (!closed) controller.error(error);
        await close();
      }
    },
    cancel: close,
  }, { highWaterMark: 0 });
}

/**
 * Private volume adapter for the small R2 contract used by storage.ts.
 * No directories are inspected or created until an operation is requested.
 * A single container keeps metadata and audio in the same atomic replacement.
 */
export function createNodeAudioBucket(root: string): NodeAudioBucket {
  if (typeof root !== 'string' || !root || root.includes('\0') || !path.isAbsolute(root)) {
    throw new TypeError('AUDIO_STORAGE_DIR deve ser um caminho absoluto.');
  }
  const directory = path.resolve(root);

  function location(key: string) {
    const [institutionId, studentId, recordingId] = keyParts(key);
    const parent = path.join(directory, institutionId, studentId);
    return { parent, file: path.join(parent, recordingId) };
  }

  return {
    async put(key, value, options) {
      const target = location(key);
      if (!(value instanceof ArrayBuffer) || value.byteLength > MAX_STORED_AUDIO_BYTES) {
        throw new TypeError('O áudio deve ter no máximo 7 MB.');
      }
      const metadata: AudioMetadata = { version: 1, size: value.byteLength, contentType: contentType(options?.httpMetadata?.contentType) };
      const encoded = Buffer.from(JSON.stringify(metadata), 'utf8');
      const prefix = Buffer.alloc(PREFIX_BYTES);
      MAGIC.copy(prefix);
      prefix.writeUInt32BE(encoded.length, MAGIC.length);
      await safeDirectory(target.parent, true);
      const existing = await statEntry(target.file);
      if (existing) requireRegularFile(existing);
      const temporary = path.join(target.parent, `.audio-${randomUUID()}.tmp`);
      let handle: FileHandle | undefined;
      let published = false;
      try {
        handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
        if (!await safeDirectory(target.parent, false)) throw storageError();
        await handle.writeFile(prefix);
        await handle.writeFile(encoded);
        await handle.writeFile(new Uint8Array(value));
        await handle.sync();
        await handle.close();
        handle = undefined;
        for (let attempt = 0; ; attempt++) {
          if (!await safeDirectory(target.parent, false)) throw storageError();
          const destination = await statEntry(target.file);
          if (destination) requireRegularFile(destination);
          try { await rename(temporary, target.file); published = true; break; }
          catch (error) {
            // NTFS can briefly lock a destination during another atomic replacement.
            // Retry the rename itself; never unlink a valid object to force a write.
            const transient = process.platform === 'win32' && !!error && typeof error === 'object'
              && 'code' in error && ['EPERM', 'EACCES', 'EBUSY'].includes(String(error.code));
            if (!transient || attempt >= 4) throw error;
            await waitForFile(20 * 2 ** attempt);
          }
        }
      } finally {
        await handle?.close();
        if (!published) {
          // Revalidate before cleanup: never unlink through a redirected parent.
          if (await safeDirectory(target.parent, false)) {
            try { await unlink(temporary); } catch (error) { if (!missing(error)) throw error; }
          }
        }
      }
    },

    async get(key) {
      const target = location(key);
      if (!await safeDirectory(target.parent, false)) return null;
      const before = await statEntry(target.file);
      if (!before) return null;
      requireRegularFile(before);
      let handle: FileHandle;
      try { handle = await open(target.file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0)); }
      catch (error) { if (missing(error)) return null; throw error; }
      try {
        const stat = await handle.stat();
        requireRegularFile(stat);
        if (stat.dev !== before.dev || stat.ino !== before.ino) throw storageError();
        if (!await safeDirectory(target.parent, false)) throw storageError();
        if (stat.size < PREFIX_BYTES || stat.size > PREFIX_BYTES + MAX_METADATA_BYTES + MAX_STORED_AUDIO_BYTES) throw storageError();
        const prefix = await readExact(handle, PREFIX_BYTES, 0);
        if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw storageError();
        const metadataBytes = prefix.readUInt32BE(MAGIC.length);
        if (!metadataBytes || metadataBytes > MAX_METADATA_BYTES) throw storageError();
        let parsed: unknown;
        try { parsed = JSON.parse((await readExact(handle, metadataBytes, PREFIX_BYTES)).toString('utf8')); }
        catch { throw storageError(); }
        if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !('size' in parsed)
          || !Number.isSafeInteger(parsed.size) || Number(parsed.size) < 0 || Number(parsed.size) > MAX_STORED_AUDIO_BYTES) throw storageError();
        const size = Number(parsed.size);
        const type = contentType('contentType' in parsed ? parsed.contentType : undefined);
        const audioOffset = PREFIX_BYTES + metadataBytes;
        if (stat.size !== audioOffset + size) throw storageError();
        return { size, ...(type ? { httpMetadata: { contentType: type } } : {}), body: audioStream(handle, audioOffset, size) };
      } catch (error) {
        await handle.close();
        throw error;
      }
    },

    async delete(key) {
      const keys = Array.isArray(key) ? key : [key];
      // Validate the entire batch before deleting any object.
      const targets = [...new Set(keys)].map(location);
      for (const target of targets) {
        if (!await safeDirectory(target.parent, false)) continue;
        const stat = await statEntry(target.file);
        if (!stat) continue;
        requireRegularFile(stat);
        if (!await safeDirectory(target.parent, false)) throw storageError();
        try { await unlink(target.file); }
        catch (error) { if (!missing(error)) throw error; }
      }
    },
  };
}
