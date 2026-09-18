/** Bounded pass-through: PCM frames reach the player before synthesis finishes. */
export function checkedSpeechStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder('utf-8', { fatal: true }), encoder = new TextEncoder();
  let pending = '', started = false, ended = false, bytes = 0, samples = 0;
  const invalid = () => new Error('Invalid speech stream');
  function line(value: string): Record<string, unknown> {
    if (!value || value.length > 256 * 1024 || ended) throw invalid();
    const event: unknown = JSON.parse(value);
    if (!event || typeof event !== 'object' || !('type' in event)) throw invalid();
    if (event.type === 'start') {
      if (started || !('sampleRate' in event) || event.sampleRate !== 24000) throw invalid();
      if ('bufferUntilEnd' in event && typeof event.bufferUntilEnd !== 'boolean') throw invalid();
      if ('channels' in event && event.channels !== 1) throw invalid();
      if ('encoding' in event && event.encoding !== 'pcm_s16le') throw invalid();
      started = true;
      return { type: 'start', sampleRate: 24000, ...('bufferUntilEnd' in event ? { bufferUntilEnd: event.bufferUntilEnd } : {}) };
    } else if (event.type === 'audio') {
      if (!started || !('data' in event) || typeof event.data !== 'string'
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.data)) throw invalid();
      const count = atob(event.data).length;
      if (!count || count % 2) throw invalid();
      samples += count / 2;
      if (samples > 24000 * 90) throw invalid();
      return { type: 'audio', data: event.data };
    } else if (event.type === 'end') {
      if (!started || !samples) throw invalid();
      ended = true;
      return { type: 'end' };
    } else if (event.type === 'error') {
      if (!('code' in event) || typeof event.code !== 'string' || !/^SPEECH_[A-Z_]{1,40}$/.test(event.code)) throw invalid();
      ended = true;
      return { type: 'error', code: event.code };
    } else throw invalid();
  }
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      signal.throwIfAborted();
      bytes += chunk.byteLength;
      if (bytes > 8 * 1024 * 1024) throw invalid();
      pending += decoder.decode(chunk, { stream: true });
      let newline;
      const validated: string[] = [];
      while ((newline = pending.indexOf('\n')) >= 0) {
        const value = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        validated.push(JSON.stringify(line(value)) + '\n');
      }
      if (pending.length > 256 * 1024) throw invalid();
      if (validated.length) controller.enqueue(encoder.encode(validated.join('')));
    },
    flush() {
      pending += decoder.decode();
      if (pending || !ended) throw invalid();
    },
  }), { signal });
}
