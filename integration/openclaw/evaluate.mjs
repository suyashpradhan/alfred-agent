// Cloud-only evaluation. Run inside a fresh network namespace with loopback only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import plugin from './dist/index.js';
import { Memory } from './dist/src/memory.js';
import { SqliteStore } from './dist/src/sqlite-store.js';
import { getToolPluginMetadata } from 'openclaw/plugin-sdk/tool-plugin';

const root = resolve('integration/openclaw');
const cli = join(root, 'node_modules/openclaw/openclaw.mjs');
const dir = mkdtempSync(join(tmpdir(), 'alfred-host-evaluation-'));
const path = join(dir, 'synthetic.sqlite'), now = Date.UTC(2026, 10, 9, 12);
const cfg = { syntheticOnly: true, databasePath: path, agentId: 'main', clockMs: now,
  timeZone: 'Asia/Kolkata', start: '22:00', end: '07:00' };
const names = ['alfred_briefing_preview', 'alfred_reminder_eligibility'];
const yes = { approved: true };
const store = SqliteStore.create(path, yes), memory = new Memory(store);
memory.create({ id: 'task', text: 'Synthetic fixture task', dueAt: now }, now, yes);
store.close();
const digest = () => createHash('sha256').update(readFileSync(path)).digest('hex');
const baseline = digest();
const evidence = { release: '2026.11.2', sourceCommit: 'b556fdf457b026574bf0f1e7b4914b15f3f179ce',
  node: process.version, tests: [], timings: {}, gateway: {}, realMessages: 0 };
let child;
let logs = '', token = '';
const check = async (name, fn) => { await fn(); evidence.tests.push(name); console.log('PASS', name); };
const context = () => ({ agentId: 'main', senderIsOwner: true,
  memoryAudience: { kind: 'owner-private', agentId: 'main' },
  assertInvocationCurrent() {}, assertMemoryAudienceCurrent() {} });
function tools(config = cfg, ctx = context()) {
  const definitions = [];
  plugin.register({ pluginConfig: config, registerTool(factory, options) {
    assert.equal(options.optional, true);
    definitions.push(factory(ctx));
  } });
  return definitions;
}
const invoke = async (name, config = cfg, ctx = context(), args = {}) =>
  (await tools(config, ctx).find(t => t.name === name).execute('synthetic-call', args)).details;
function command(args) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8',
    timeout: 120000, env: { ...process.env, OPENCLAW_STATE_DIR: join(dir, 'cli-state') } });
  if (r.status !== 0) {
    // CLI setup has no credentials; never print arbitrary raw logs.
    console.log('CLI failure:', args[0], args[1], 'exit', r.status);
    console.log((r.stderr || r.stdout || '').slice(-3500).replaceAll(dir, '[temporary]'));
    throw new Error('Evaluation CLI failed');
  }
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 5000))]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)); }
}
try {
  await check('runtime network namespace has loopback only', () => {
    assert.deepEqual(Object.keys(networkInterfaces()), ['lo']);
  });
  await check('SDK registers exactly two optional read tools', () => {
    assert.deepEqual(getToolPluginMetadata(plugin).tools.map(t => t.name), names);
    assert.deepEqual(tools().map(t => t.name), names);
  });
  await check('both tools succeed with synthetic host authority and preserve file', async () => {
    for (const name of names) assert.equal((await invoke(name)).ok, true);
    assert.equal(digest(), baseline);
  });
  await check('missing/wrong/stale audience and identity deny without data', async () => {
    for (const change of [{ senderIsOwner: false }, { memoryAudience: undefined }, { agentId: 'other' },
      { memoryAudience: { kind: 'conversation', agentId: 'main' } },
      { assertInvocationCurrent: undefined }, { assertMemoryAudienceCurrent: undefined },
      { assertInvocationCurrent() { throw Error('private stale identity'); } },
      { assertMemoryAudienceCurrent() { throw Error('private stale audience'); } }]) {
      for (const name of names) assert.deepEqual(await invoke(name, cfg, { ...context(), ...change }), { ok: false, error: 'DENIED' });
    }
    let calls = 0;
    const staleAtRelease = { ...context(), assertMemoryAudienceCurrent() { if (++calls > 1) throw Error('stale'); } };
    assert.deepEqual(await invoke(names[0], cfg, staleAtRelease), { ok: false, error: 'DENIED' });
  });
  await check('model arguments cannot choose path, clock, policy or approval', async () => {
    for (const args of [{ databasePath: '/missing' }, { approved: true }, { now }, [], null]) {
      assert.deepEqual(await invoke(names[0], cfg, context(), args), { ok: false, error: 'INVALID_INPUT' });
    }
  });
  await check('aborted invocation returns no data', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await tools()[0].execute('aborted', {}, controller.signal);
    assert.deepEqual(result.details, { ok: false, error: 'DENIED' });
  });
  await check('invalid policy and clock rollback fail closed', async () => {
    assert.equal((await invoke(names[0], { ...cfg, timeZone: 'Missing/Zone' })).error, 'INVALID_POLICY');
    assert.equal((await invoke(names[1], { ...cfg, clockMs: now - 1 })).error, 'CLOCK_BEHIND');
  });
  await check('missing/corrupt database returns unavailable without path disclosure', async () => {
    const corrupt = join(dir, 'corrupt.sqlite'); writeFileSync(corrupt, 'synthetic corrupt');
    for (const databasePath of [join(dir, 'missing.sqlite'), corrupt]) {
      assert.deepEqual(await invoke(names[0], { ...cfg, databasePath }), { ok: false, error: 'UNAVAILABLE' });
    }
  });
  await check('bounded output and SQLite revision unchanged', async () => {
    const many = join(dir, 'many.sqlite'), writable = SqliteStore.create(many, yes), m = new Memory(writable);
    for (let i = 0; i < 30; i++) m.create({ id: 'task-' + i, text: 'x'.repeat(1000), dueAt: now }, now, yes);
    writable.close();
    const before = readFileSync(many);
    for (const name of names) {
      const result = await invoke(name, { ...cfg, databasePath: many });
      assert.equal(result.preview.shown, 20); assert.equal(result.preview.omitted, 10);
      assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 65536);
    }
    assert.deepEqual(readFileSync(many), before);
    const db = new DatabaseSync(path, { readOnly: true });
    assert.equal(db.prepare('SELECT revision FROM memory_state').get().revision, 1); db.close();
  });
  await check('escaped oversized output is rejected without partial data', async () => {
    const big = join(dir, 'big.sqlite'), writable = SqliteStore.create(big, yes), m = new Memory(writable);
    for (let i = 0; i < 20; i++) m.create({ id: 'large-' + i, text: String.fromCharCode(92).repeat(1000), dueAt: now }, now, yes);
    writable.close();
    assert.deepEqual(await invoke(names[0], { ...cfg, databasePath: big }), { ok: false, error: 'OUTPUT_LIMIT' });
  });
  await check('exclusive SQLite lock fails closed within bounded timeout', async () => {
    const db = new DatabaseSync(path); db.exec('BEGIN EXCLUSIVE');
    const start = performance.now();
    try { assert.equal((await invoke(names[0])).error, 'UNAVAILABLE'); }
    finally { db.exec('ROLLBACK'); db.close(); }
    evidence.timings.lockFailureMs = Math.round(performance.now() - start);
    assert.ok(evidence.timings.lockFailureMs < 2000);
  });
  await check('read latency measured on synthetic fixture', async () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now(); assert.equal((await invoke(names[0])).ok, true);
      samples.push(performance.now() - start);
    }
    samples.sort((a,b) => a-b);
    evidence.timings.readMedianMs = Number(samples[10].toFixed(2));
    evidence.timings.readMaxMs = Number(samples.at(-1).toFixed(2));
  });
  command(['plugins', 'build', '--root', root, '--entry', './dist/index.js']);
  command(['plugins', 'validate', '--root', root, '--entry', './dist/index.js']);
  evidence.tests.push('pinned CLI builds and validates manifest');
  console.log('GENERATED_MANIFEST', readFileSync(join(root, 'openclaw.plugin.json'), 'utf8').replaceAll('\n', ' '));

  // Full isolated Gateway. Random ephemeral auth is neither printed nor uploaded.
  token = randomBytes(32).toString('hex');
  const configPath = join(dir, 'openclaw.json'), state = join(dir, 'gateway-state');
  mkdirSync(state);
  const hostConfig = {
    gateway: { mode: 'local', bind: 'loopback', port: 18789, auth: { mode: 'token', token } },
    agents: { defaults: { workspace: join(dir, 'workspace') } },
    tools: { allow: names },
    plugins: { allow: ['alfred-readonly'], slots: { memory: 'none' },
      load: { paths: [root] }, entries: { 'alfred-readonly': { enabled: true, config: cfg } } },
  };
  async function startHost() {
  writeFileSync(configPath, JSON.stringify(hostConfig), { mode: 0o600 });
  logs = '';
  child = spawn(process.execPath, [cli, 'gateway', 'run'], {
    env: { ...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_DEBUG: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', b => { logs = (logs + b).slice(-20000); });
  child.stderr.on('data', b => { logs = (logs + b).slice(-20000); });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break;
    try { const r = await fetch('http://127.0.0.1:18789/readyz'); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) {
    console.log(logs.replaceAll(token, '[redacted]').replaceAll(dir, '[temporary]').slice(-6000));
    throw Error('Isolated Gateway did not start');
  }

  }
  hostConfig.plugins.entries['alfred-readonly'].enabled = false;
  await startHost();
  evidence.tests.push('Gateway reaches readiness with plugin disabled');
  const http = async (name, args = {}, authenticated = true) => {
    const r = await fetch('http://127.0.0.1:18789/tools/invoke', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ tool: name, args }), signal: AbortSignal.timeout(30000) });
    return { status: r.status, body: await r.json() };
  };
  await check('disabled plugin cannot be invoked', async () => {
    for (const name of names) assert.equal((await http(name)).status, 404);
  });
  await stop();
  hostConfig.plugins.entries['alfred-readonly'].enabled = true;
  await startHost();
  await check('Gateway rejects unauthenticated invocation', async () => {
    assert.equal((await http(names[0], {}, false)).status, 401);
  });
  await check('Gateway policy excludes mutation and messaging tools', async () => {
    for (const name of ['message', 'exec', 'alfred_commitment_create']) {
      assert.notEqual((await http(name)).status, 200);
    }
  });
  await check('Gateway loads plugin and invokes both tools with real host context', async () => {
    for (const name of names) {
      const r = await http(name);
      if (r.status !== 200) console.log(logs.replaceAll(token, '[redacted]').replaceAll(dir, '[temporary]').slice(-8000));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const result = r.body.result.details;
      // Missing owner audience MUST fail closed, not be replaced with fabricated identity.
      assert.ok(result.ok === true || result.error === 'DENIED', JSON.stringify(result));
      evidence.gateway[name] = result.ok ? 'success' : 'denied_missing_live_owner_authority';
    }
  });
  assert.equal(digest(), baseline);
  await stop();
  evidence.gateway.runtimeLoaded = true;
  console.log('EVIDENCE', JSON.stringify(evidence));
} catch (error) {
  console.log('GATEWAY_DIAGNOSTIC', logs.replaceAll(token || '[no-token]', '[redacted]').replaceAll(dir, '[temporary]').slice(-10000));
  throw error;
} finally {
  await stop();
  writeFileSync(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  rmSync(dir, { recursive: true, force: true });
}
