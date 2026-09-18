import { createNodeAudioBucket } from './node-audio-bucket';

// Vite resolves cloudflare:workers to this module only for the Node server build.
// Values stay on the server and are read when the container starts, not at build time.
export const env = {
  ...process.env,
  LETRIA_RUNTIME: 'node',
  AUDIO: process.env.AUDIO_STORAGE_DIR
    ? createNodeAudioBucket(process.env.AUDIO_STORAGE_DIR)
    : undefined,
};
