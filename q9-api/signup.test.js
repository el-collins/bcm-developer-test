'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { subscribe } = require('./signup');

// Mock service. Honours the idempotency key like a well-behaved API; the flags simulate failures.
function mockService({ dropFirstResponse = false, rateLimitFirst = 0 } = {}) {
    const records = new Map(); // email -> record (duplicates would show up here)
    const seenKeys = new Set();
    let calls = 0, dropped = false, limited = 0;
    return {
        records,
        get calls() { return calls; },
        async subscribe({ email }, { idempotencyKey }) {
            calls++;
            if (limited < rateLimitFirst) { limited++; return { status: 429, headers: { 'retry-after': '1' } }; }
            let status = 201;
            if (seenKeys.has(idempotencyKey)) status = 200; // replay: same result, no new record
            else { records.set(email, { email }); seenKeys.add(idempotencyKey); }
            if (dropFirstResponse && !dropped) { // accepted, but the response is lost
                dropped = true;
                const e = new Error('timeout'); e.code = 'ETIMEDOUT'; throw e;
            }
            return { status };
        },
        async find(email) { return records.get(email) ?? null; },
    };
}
const noSleep = () => Promise.resolve();
const secret = 'test-secret';

test('timeout AFTER the service accepted: retry creates exactly one record', async () => {
    const service = mockService({ dropFirstResponse: true });
    const res = await subscribe('Ann@Example.com ', { service, store: new Map(), secret, sleep: noSleep });
    assert.equal(res.outcome, 'already_subscribed'); // found via reconcile lookup
    assert.equal(service.records.size, 1);
});

test('timeout after accept and lookup unavailable: retry with same key still creates one record', async () => {
    const service = mockService({ dropFirstResponse: true });
    service.find = async () => { throw new Error('lookup down'); };
    const res = await subscribe('ann@example.com', { service, store: new Map(), secret, sleep: noSleep });
    assert.equal(res.outcome, 'already_subscribed'); // 200 replay
    assert.equal(res.attempts, 2);
    assert.equal(service.records.size, 1);
});

test('rate limit: waits Retry-After, then succeeds once', async () => {
    const service = mockService({ rateLimitFirst: 2 });
    const waits = [];
    const res = await subscribe('bo@example.com', { service, store: new Map(), secret, sleep: ms => { waits.push(ms); return Promise.resolve(); } });
    assert.equal(res.outcome, 'subscribed');
    assert.deepEqual(waits, [1000, 1000]);
    assert.equal(service.records.size, 1);
});

test('invalid email: rejected locally, no request, nothing stored', async () => {
    const service = mockService();
    const store = new Map();
    const res = await subscribe('not-an-email', { service, store, secret, sleep: noSleep });
    assert.equal(res.outcome, 'invalid_email');
    assert.equal(service.calls, 0);
    assert.equal(store.size, 0);
});

test('invalid email rejected by service (422): permanent, not retried', async () => {
    let n = 0;
    const service = { subscribe: async () => { n++; return { status: 422 }; }, find: async () => null };
    const res = await subscribe('a@b.co', { service, store: new Map(), secret, sleep: noSleep });
    assert.equal(res.outcome, 'invalid_email');
    assert.equal(n, 1);
});

test('same signup twice (double click): one request, one record', async () => {
    const service = mockService();
    const store = new Map();
    await subscribe('cy@example.com', { service, store, secret, sleep: noSleep });
    const second = await subscribe('CY@example.com', { service, store, secret, sleep: noSleep });
    assert.equal(second.outcome, 'already_subscribed');
    assert.equal(service.calls, 1);
    assert.equal(service.records.size, 1);
});

test('persistent timeouts: gives up, stays pending in store (not lost)', async () => {
    const service = { subscribe: async () => { const e = new Error('t'); e.code = 'ETIMEDOUT'; throw e; }, find: async () => null };
    const store = new Map();
    const res = await subscribe('di@example.com', { service, store, secret, sleep: noSleep, maxAttempts: 3 });
    assert.equal(res.outcome, 'failed');
    assert.equal([...store.values()][0].status, 'pending');
});

test('logs never contain the raw email', async () => {
    const lines = [];
    const service = mockService({ dropFirstResponse: true });
    await subscribe('secret.person@example.com', { service, store: new Map(), secret, sleep: noSleep, log: l => lines.push(JSON.stringify(l)) });
    assert.ok(lines.length > 0);
    assert.ok(!lines.join('\n').includes('secret.person'));
});

test('very long input is rejected by length before the regex runs (ReDoS guard)', async () => {
    const service = mockService();
    const evil = 'a@' + '.'.repeat(80000) + ' x';
    const start = Date.now();
    const res = await subscribe(evil, { service, store: new Map(), secret, sleep: noSleep });
    assert.equal(res.outcome, 'invalid_email');
    assert.ok(Date.now() - start < 200, 'must return quickly');
    assert.equal(service.calls, 0);
});

test('non-string email (object/array) is invalid, not stringified', async () => {
    const service = mockService();
    const res = await subscribe(['a@b.co'], { service, store: new Map(), secret, sleep: noSleep });
    assert.equal(res.outcome, 'invalid_email');
});

test('Retry-After is capped at 30s and negative values fall back to backoff', async () => {
    let n = 0;
    const waits = [];
    const hints = ['86400', '-5'];
    const service = {
        subscribe: async () => (n < 2 ? { status: 429, headers: { 'retry-after': hints[n++] } } : { status: 201 }),
        find: async () => null,
    };
    await subscribe('x@example.com', { service, store: new Map(), secret, sleep: ms => { waits.push(ms); return Promise.resolve(); } });
    assert.equal(waits[0], 30000);
    assert.ok(waits[1] > 0 && waits[1] <= 30000);
});

test('idempotency key is not a plain hash of the email, and no key-like value is logged in full', async () => {
    const crypto = require('node:crypto');
    const plain = crypto.createHash('sha256').update('hk@example.com').digest('hex').slice(0, 32);
    const lines = [];
    const store = new Map();
    await subscribe('hk@example.com', { service: mockService(), store, secret, sleep: noSleep, log: l => lines.push(JSON.stringify(l)) });
    const key = [...store.keys()][0];
    assert.notEqual(key, plain);
    assert.ok(!lines.join(' ').includes(key));
});

test('missing secret throws (fail closed)', async () => {
    await assert.rejects(subscribe('a@b.co', { service: mockService(), store: new Map(), secret: '' }), /secret/);
});
