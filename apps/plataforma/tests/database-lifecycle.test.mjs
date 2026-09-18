import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const environment = {
  DATABASE_DRIVER: 'postgres',
  DATABASE_URL: 'postgresql://example:example@database.example.test:5432/lifecycle',
  DATABASE_SCHEMA: 'letria',
};
const poolState = { instances: [], onQuery: undefined };

// Only the driver is mocked: queries still pass through the real database
// wrapper, AsyncLocalStorage, PostgreSQL adapter and public error response.
class FakePool extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.queries = [];
    this.endCalls = 0;
    this.ended = false;
    this.nextQueryError = undefined;
    this.endError = undefined;
    poolState.instances.push(this);
  }

  async query(text, values = []) {
    if (this.ended) throw new Error('The request used a closed pool.');
    this.queries.push({ text, values });
    await poolState.onQuery?.(this, text, values);
    if (this.nextQueryError) {
      const error = this.nextQueryError;
      this.nextQueryError = undefined;
      throw error;
    }
    return { rows: [{ value: values[0] ?? null }], rowCount: 1 };
  }

  async connect() {
    throw new Error('Lifecycle tests must not open real or transactional connections.');
  }

  async end() {
    this.endCalls += 1;
    this.ended = true;
    if (this.endError) throw this.endError;
  }
}

globalThis.__letriaDatabaseLifecycleEnv = environment;
globalThis.__letriaDatabaseLifecyclePool = FakePool;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'letria-lifecycle:env', shortCircuit: true };
    if (specifier === 'pg') return { url: 'letria-lifecycle:pg', shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const resolved = new URL(specifier, context.parentURL);
      if (existsSync(fileURLToPath(resolved) + '.ts')) return { url: resolved.href + '.ts', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'letria-lifecycle:env') {
      return { format: 'module', source: 'export const env = globalThis.__letriaDatabaseLifecycleEnv;', shortCircuit: true };
    }
    if (url === 'letria-lifecycle:pg') {
      return {
        format: 'module',
        source: 'export const Pool = globalThis.__letriaDatabaseLifecyclePool; export const types = { getTypeParser: () => value => value };',
        shortCircuit: true,
      };
    }
    if (url.endsWith('.ts') && !url.includes('node_modules')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { database, withDatabase } = await import('../lib/server/database.ts');
const { ApiError } = await import('../lib/server/security.ts');

after(() => {
  hooks.deregister();
  delete globalThis.__letriaDatabaseLifecycleEnv;
  delete globalThis.__letriaDatabaseLifecyclePool;
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const request = () => new Request('https://letria.example.test/api/lifecycle');
const readValue = value => database().prepare('SELECT ? AS value').bind(value).first();
const reader = value => withDatabase(async () => Response.json(await readValue(value)));

// Subtests are deliberately awaited in sequence. The Node singleton remains
// alive for this entire module, just as it does in the production process.
test('database pool lifecycle without a real PostgreSQL connection', { timeout: 10000 }, async t => {
  let sharedNodePool;

  await t.test('routes without database work do not allocate a pool', async () => {
    environment.LETRIA_RUNTIME = 'node';
    const handler = withDatabase(async () => new Response(null, { status: 204 }));
    assert.equal((await handler(request())).status, 204);
    assert.equal(poolState.instances.length, 0);
  });

  await t.test('Node shares one pool across concurrent handlers and survives idle connection errors', async () => {
    environment.LETRIA_RUNTIME = 'node';
    const bothQuerying = deferred(), releaseQueries = deferred();
    let arrivals = 0;
    poolState.onQuery = async () => {
      if (++arrivals === 2) bothQuerying.resolve();
      await releaseQueries.promise;
    };
    const handler = value => withDatabase(async () => {
      const first = await readValue(value);
      // Read the context again after an idle error. A listener that captures
      // the creator request must not permanently mark that request failed.
      const second = await readValue(value + '-after-error');
      return Response.json({ first: first.value, second: second.value });
    });
    const first = handler('first')(request());
    const sibling = handler('sibling')(request());
    try {
      await bothQuerying.promise;
      assert.equal(poolState.instances.length, 1, 'Concurrent Node routes must share one pool.');
      sharedNodePool = poolState.instances[0];
      assert.equal(sharedNodePool.options.max, 10);
      assert.equal(sharedNodePool.endCalls, 0);
      assert.ok(sharedNodePool.listenerCount('error') > 0, 'Idle connection errors need a listener.');
      assert.doesNotThrow(() => sharedNodePool.emit('error', new Error('An idle mock connection was removed.')));
    } finally {
      poolState.onQuery = undefined;
      releaseQueries.resolve();
    }
    const responses = await Promise.all([first, sibling]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual(await Promise.all(responses.map(response => response.json())), [
      { first: 'first', second: 'first-after-error' },
      { first: 'sibling', second: 'sibling-after-error' },
    ]);
    assert.equal(sharedNodePool.endCalls, 0);

    // The same idle error may also occur while no request is active.
    assert.doesNotThrow(() => sharedNodePool.emit('error', new Error('Another idle mock connection was removed.')));
    const later = await reader('later')(request());
    assert.equal(later.status, 200);
    assert.deepEqual(await later.json(), { value: 'later' });
    assert.equal(poolState.instances.length, 1);
    assert.equal(sharedNodePool.endCalls, 0);
  });

  await t.test('Node request and query failures do not close or poison the shared pool', async () => {
    const failure = withDatabase(async () => {
      await readValue('before-route-error');
      throw new ApiError(409, 'Planned route failure.', 'EXPECTED_ROUTE_FAILURE');
    });
    const failedRoute = await failure(request());
    assert.equal(failedRoute.status, 409);
    assert.equal((await failedRoute.json()).code, 'EXPECTED_ROUTE_FAILURE');
    assert.equal(sharedNodePool.endCalls, 0);

    sharedNodePool.nextQueryError = new Error('private-mock-driver-detail');
    const failedQuery = await reader('query-error')(request());
    assert.equal(failedQuery.status, 503);
    const errorBody = await failedQuery.json();
    assert.equal(errorBody.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!JSON.stringify(errorBody).includes('private-mock-driver-detail'));
    const recovered = await reader('recovered')(request());
    assert.equal(recovered.status, 200);
    assert.deepEqual(await recovered.json(), { value: 'recovered' });
    assert.equal(poolState.instances.length, 1);
    assert.equal(sharedNodePool.endCalls, 0);
  });

  await t.test('Worker requests get separate pools and close each successful request', async () => {
    delete environment.LETRIA_RUNTIME;
    const before = poolState.instances.length;
    const responses = await Promise.all([reader('worker-a')(request()), reader('worker-b')(request())]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual(await Promise.all(responses.map(response => response.json())), [{ value: 'worker-a' }, { value: 'worker-b' }]);
    const workerPools = poolState.instances.slice(before);
    assert.equal(workerPools.length, 2);
    assert.notEqual(workerPools[0], workerPools[1]);
    for (const pool of workerPools) {
      assert.equal(pool.options.max, 4);
      assert.equal(pool.endCalls, 1);
    }
    assert.equal(sharedNodePool.endCalls, 0);
  });

  await t.test('Worker pools close after both route failures and driver failures', async () => {
    const before = poolState.instances.length;
    const failedRoute = await withDatabase(async () => {
      await readValue('worker-before-error');
      throw new ApiError(409, 'Planned Worker failure.', 'EXPECTED_WORKER_FAILURE');
    })(request());
    assert.equal(failedRoute.status, 409);
    assert.equal((await failedRoute.json()).code, 'EXPECTED_WORKER_FAILURE');

    const failedQuery = await withDatabase(async () => {
      const db = database();
      poolState.instances.at(-1).nextQueryError = new Error('private-worker-driver-detail');
      return Response.json(await db.prepare('SELECT ? AS value').bind('worker-query-error').first());
    })(request());
    assert.equal(failedQuery.status, 503);
    const errorBody = await failedQuery.json();
    assert.equal(errorBody.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!JSON.stringify(errorBody).includes('private-worker-driver-detail'));
    const workerPools = poolState.instances.slice(before);
    assert.equal(workerPools.length, 2);
    for (const pool of workerPools) assert.equal(pool.endCalls, 1);
  });

  await t.test('Worker cleanup errors preserve the completed response', async () => {
    const response = await withDatabase(async () => {
      const result = await readValue('cleanup-result');
      poolState.instances.at(-1).endError = new Error('private-cleanup-detail');
      return Response.json(result, { status: 201 });
    })(request());
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { value: 'cleanup-result' });
    assert.equal(poolState.instances.at(-1).endCalls, 1);
  });

  await t.test('explicit SQLite uses its binding without allocating PostgreSQL pools', async () => {
    const before = poolState.instances.length;
    const sqlite = { prepare() { throw new Error('No query is required to select the SQLite binding.'); }, async batch() { return []; } };
    environment.DATABASE_DRIVER = 'sqlite';
    environment.DB = sqlite;
    delete environment.DATABASE_URL;
    for (const runtime of ['node', undefined]) {
      if (runtime) environment.LETRIA_RUNTIME = runtime;
      else delete environment.LETRIA_RUNTIME;
      const response = await withDatabase(async () => {
        assert.equal(database(), sqlite);
        assert.equal(database(), sqlite);
        return new Response(null, { status: 204 });
      })(request());
      assert.equal(response.status, 204);
    }
    assert.equal(poolState.instances.length, before);
    assert.equal(sharedNodePool.endCalls, 0);
  });
});
