import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { registerTransport } from '../transport.js';

// Point this at the installed @deepseek-ai scope directory. The portable unit
// suite does not install or substitute Cordis, Connection, or Peer internals.
const runtimeDirectory = process.env.DSH_TEST_RUNTIME;
const runtimeOptions = {
  skip: runtimeDirectory ? false : 'Set DSH_TEST_RUNTIME to the installed @deepseek-ai scope directory to run the native runtime regression.',
};
const runtime = runtimeDirectory ? await loadRuntime(runtimeDirectory) : undefined;
const endpoints = ['workspace', 'checkout', 'prepare', 'settle', 'list', 'restore', 'remove', 'configure'];
const authority = '127.0.0.1:32100';
const origin = `http://${authority}`;

async function loadRuntime(directory) {
  const [core, connection] = await Promise.all([
    import(pathToFileURL(path.join(directory, 'cordis', 'lib', 'index.js')).href),
    import(pathToFileURL(path.join(directory, 'dsh-client-connection', 'lib', 'index.js')).href),
  ]);
  return {
    Context: core.Context,
    HostConnectionService: connection.HostConnectionService,
    clientRequestSchema: connection.clientRequestSchema,
    serverResponseSchema: connection.serverResponseSchema,
  };
}

function requestFor(endpoint, options = {}) {
  const method = `dsh-worktrees/${endpoint}`;
  const message = runtime.clientRequestSchema.parse({
    type: 'client-request', rpcId: options.rpcId ?? `${endpoint}-request`, method,
    payload: options.payload ?? { fixture: endpoint },
  });
  const request = new Request(`${origin}/api/${method}`, {
    method: options.method ?? 'POST',
    headers: {
      host: authority, origin, authorization: 'Bearer browser-token',
      'content-type': 'application/json', ...options.headers,
    },
    ...(options.method === 'GET' ? {} : { body: options.body ?? JSON.stringify(message) }),
    signal: options.signal,
  });
  return { request, message };
}

async function fixture(t, options = {}) {
  const root = new runtime.Context();
  t.after(() => root.fiber.dispose());
  const calls = [];
  const authenticationCalls = [];
  const httpRegistrations = [];
  const apiCredentials = new Map();
  let publishedPeerId;
  // Authentication and HTTP are external boundaries. Admission, trust fencing,
  // Peer construction, route dispatch, tracing, and fiber teardown remain native.
  const browserAuth = {
    isAuthenticated(request, secure) {
      authenticationCalls.push({ request, secure });
      return request.headers.get('authorization') === 'Bearer browser-token';
    },
    authenticateApi(request) {
      return apiCredentials.get(request.headers.get('authorization'));
    },
    authorizeConnect(_request, _response, _secure, publishPeer) {
      publishedPeerId = publishPeer('answer');
    },
  };
  if (options.withWebServer) {
    root.provide('webServer', {
      protocol: 'http:', host: '127.0.0.1',
      register(route) {
        httpRegistrations.push(route);
        throw new Error('Worktree routes must use the shared Connection registry.');
      },
    });
  }
  let connection;
  const connectionFiber = await root.plugin({
    name: 'runtime-connection-fixture',
    apply(ctx) { connection = new runtime.HostConnectionService(ctx, [], browserAuth); },
  });
  assert.ok(connection instanceof runtime.HostConnectionService);
  const shared = connection.createSharedFetchHandler('/api');
  const host = {
    async rpc(endpoint, payload, signal, peer) {
      calls.push({ endpoint, payload, signal, peer });
      return options.respond ? options.respond(endpoint, payload, signal, peer)
        : { ok: true, value: { endpoint, payload } };
    },
  };
  const transportPlugin = {
    name: 'runtime-worktree-transport-fixture', inject: ['connection'],
    apply(ctx) { registerTransport(ctx, host); },
  };
  const mount = () => root.plugin(transportPlugin);
  const transportFiber = await mount();
  assert.equal(Object.hasOwn(transportFiber.inject, 'webServer'), false);
  return {
    root, connection, connectionFiber, transportFiber, mount, shared, calls,
    authenticationCalls, httpRegistrations,
    dispatch: (request, peer = connection.browserPeer) => shared.fetch(request, peer),
    async apiPeer() {
      const request = new Request(`${origin}/connect`, { headers: { host: authority } });
      connection.authorizeConnect(request, {});
      assert.equal(typeof publishedPeerId, 'string');
      const token = `Bearer api-${publishedPeerId}`;
      apiCredentials.set(token, publishedPeerId);
      const probe = requestFor('list', { headers: { authorization: token } }).request;
      const admission = connection.admit(probe);
      assert.ok(!('rejection' in admission));
      return { token, peer: admission.peer };
    },
  };
}

test('exact worktree routes mount without a webServer service and use native RPC envelopes', runtimeOptions, async (t) => {
  const f = await fixture(t);
  assert.equal(f.root.get('webServer'), undefined);
  for (const endpoint of endpoints) {
    const { request, message } = requestFor(endpoint);
    assert.equal(f.shared.requestBodyMode({ method: request.method, url: new URL(request.url) }), 'buffered');
    const admission = f.connection.admit(request);
    assert.ok(!('rejection' in admission));
    const response = await f.dispatch(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    const body = runtime.serverResponseSchema.parse(await response.json());
    assert.deepEqual(body, {
      type: 'server-response', rpcId: message.rpcId,
      result: { ok: true, value: { endpoint, payload: message.payload } },
    });
    const call = f.calls.at(-1);
    assert.equal(call.endpoint, endpoint);
    assert.deepEqual(call.payload, message.payload);
    assert.equal(call.signal, request.signal);
    assert.equal(call.peer, admission.peer);
    assert.equal(call.peer.signal.aborted, false);
  }
  assert.equal(f.calls.length, endpoints.length);
});

test('an existing HTTP carrier requires no webServer injection or dedicated route registration', runtimeOptions, async (t) => {
  const f = await fixture(t, { withWebServer: true });
  assert.ok(f.root.get('webServer'));
  assert.equal(Object.hasOwn(f.connectionFiber.inject, 'webServer'), false);
  assert.equal(Object.hasOwn(f.transportFiber.inject, 'webServer'), false);
  const response = await f.dispatch(requestFor('list').request);
  assert.equal(response.status, 200);
  assert.equal(f.calls.length, 1);
  assert.equal(f.httpRegistrations.length, 0);
});

test('disposing only the caller fiber removes every route and permits clean reactivation', runtimeOptions, async (t) => {
  const f = await fixture(t);
  f.connection.fetch.register({
    path: '/api/runtime-sentinel', methods: ['POST'], requestBody: 'buffered',
    fetch: () => Promise.resolve(new Response('Connection still owns this route')),
  });
  assert.equal((await f.dispatch(requestFor('list').request)).status, 200);
  const beforeDispose = f.calls.length;
  await f.transportFiber.dispose();
  assert.equal(f.connection.browserPeer.signal.aborted, false);
  assert.ok(f.root.get('connection'));
  for (const endpoint of endpoints) {
    assert.equal((await f.dispatch(requestFor(endpoint).request)).status, 404, `${endpoint} must be unregistered`);
  }
  assert.equal(f.calls.length, beforeDispose);
  const sentinel = await f.dispatch(new Request(`${origin}/api/runtime-sentinel`, { method: 'POST' }));
  assert.equal(await sentinel.text(), 'Connection still owns this route');
  const replacement = await f.mount();
  await f.transportFiber.dispose();
  assert.equal((await f.dispatch(requestFor('list').request)).status, 200);
  assert.equal(f.calls.length, beforeDispose + 1);
  await replacement.dispose();
  assert.equal((await f.dispatch(requestFor('list').request)).status, 404);
});

test('browser and API requests preserve their distinct native authenticated Peer identities', runtimeOptions, async (t) => {
  const f = await fixture(t);
  const api = await f.apiPeer();
  assert.notEqual(api.peer.id, f.connection.browserPeer.id);
  assert.equal(api.peer.principal.kind, 'owner');
  for (const endpoint of ['prepare', 'settle']) {
    const { request } = requestFor(endpoint, { headers: { authorization: api.token } });
    assert.equal((await f.dispatch(request)).status, 200);
    assert.equal(f.calls.at(-1).peer, api.peer, 'route must forward the admitted API Peer, not the shared browser Peer');
  }
  assert.equal((await f.dispatch(requestFor('list').request)).status, 200);
  assert.equal(f.calls.at(-1).peer, f.connection.browserPeer);
  const socket = f.connection.admitConnection(requestFor('list', { headers: { authorization: api.token } }).request);
  assert.ok(!('rejection' in socket));
  await socket.release();
  assert.equal(api.peer.signal.aborted, true);
  const callsBeforeExpiredPeer = f.calls.length;
  assert.equal((await f.dispatch(requestFor('list', { headers: { authorization: api.token } }).request)).status, 401);
  assert.equal(f.calls.length, callsBeforeExpiredPeer);
});

test('native admission rejects unauthenticated requests and cross-origin authorities before host work', runtimeOptions, async (t) => {
  const f = await fixture(t);
  for (const [headers, status] of [
    [{ authorization: 'Bearer unknown' }, 401],
    [{ host: 'untrusted.example', origin: 'http://untrusted.example' }, 403],
    [{ origin: 'http://other.example' }, 403],
    [{ 'sec-fetch-site': 'cross-site' }, 403],
  ]) {
    assert.equal((await f.dispatch(requestFor('list', { headers }).request)).status, status);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.authenticationCalls.length, 1, 'the native Host/Origin fence runs before authentication');
});

test('the exact registry and envelope checks reject unsupported paths, methods, and bodies', runtimeOptions, async (t) => {
  const f = await fixture(t);
  for (const [request, status] of [
    [requestFor('unknown').request, 404],
    [requestFor('list', { method: 'GET' }).request, 404],
    [requestFor('list', { headers: { 'content-type': 'text/plain' } }).request, 415],
    [requestFor('list', { body: '{bad json' }).request, 400],
    [requestFor('list', { body: JSON.stringify({ type: 'client-request', rpcId: 'wrong-method', method: 'dsh-worktrees/remove', payload: {} }) }).request, 400],
    [requestFor('list', { body: JSON.stringify({ type: 'client-request', method: 'dsh-worktrees/list', payload: {} }) }).request, 400],
    [requestFor('list', { body: JSON.stringify({ type: 'server-response', rpcId: 'wrong-type', method: 'dsh-worktrees/list', payload: {} }) }).request, 400],
  ]) {
    assert.equal((await f.dispatch(request)).status, status);
  }
  assert.equal(f.calls.length, 0);
});

test('host business failures retain their error envelope and rpcId through the real transport', runtimeOptions, async (t) => {
  const result = {
    ok: false,
    error: { code: 'GIT_FAILED', message: 'fatal: saved snapshot is unavailable\nGit exited 128', details: { exitCode: 128 } },
  };
  const f = await fixture(t, { respond: () => result });
  const { request } = requestFor('restore', { rpcId: 'restore-failure', payload: { worktreeId: 'tree-1' } });
  const response = await f.dispatch(request);
  assert.equal(response.status, 200);
  assert.deepEqual(runtime.serverResponseSchema.parse(await response.json()), {
    type: 'server-response', rpcId: 'restore-failure', result,
  });
});

test('the real Fetch request signal reaches pending host work unchanged', runtimeOptions, async (t) => {
  const result = { ok: false, error: { code: 'ABORTED', message: 'Request canceled', details: {} } };
  const f = await fixture(t, {
    respond: (_endpoint, _payload, signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve(result), { once: true });
    }),
  });
  const abort = new AbortController();
  const { request } = requestFor('prepare', { signal: abort.signal });
  const pending = f.dispatch(request);
  // Request.json() is asynchronous. Wait for the actual host boundary rather
  // than assuming a particular number of microtasks inside the native runtime.
  for (let attempt = 0; f.calls.length === 0 && attempt < 20; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].signal, request.signal);
  const reason = new Error('Fixture request aborted');
  abort.abort(reason);
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.calls[0].signal.reason, reason);
  assert.equal(f.connection.browserPeer.signal.aborted, false);
  const response = await pending;
  assert.deepEqual(runtime.serverResponseSchema.parse(await response.json()).result, result);
});
