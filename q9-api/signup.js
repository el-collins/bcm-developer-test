'use strict';
const crypto = require('node:crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * service.subscribe({ email }, { idempotencyKey }) -> { status, headers? }; throws code 'ETIMEDOUT' if no response.
 * service.find(email) -> record | null
 * store: durable Map-like { get, set }.
 * Returns { outcome: 'subscribed' | 'already_subscribed' | 'invalid_email' | 'failed', attempts }.
 */
async function subscribe(email, { service, store, log = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)), maxAttempts = 4 }) {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (normalized.length > 254 || !EMAIL_RE.test(normalized)) {
        return { outcome: 'invalid_email', attempts: 0 }; // never sent, nothing to retry
    }

    // Same email gives the same key on every retry, so the service can ignore repeats.
    const key = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
    const save = (status, attempts) => store.set(key, { status, email: normalized, attempts });
    if (store.get(key)?.status === 'done') return { outcome: 'already_subscribed', attempts: 0 };
    save('pending', 0); // written before the call, so a crash cannot lose the signup

    let attempts = 0;
    while (attempts < maxAttempts) {
        attempts++;
        try {
            const res = await service.subscribe({ email: normalized }, { idempotencyKey: key });
            log({ event: 'response', id: key.slice(0, 8), attempt: attempts, status: res.status });

            if ([200, 201, 409].includes(res.status)) { // 200/409 = already there = success
                save('done', attempts);
                return { outcome: res.status === 201 ? 'subscribed' : 'already_subscribed', attempts };
            }
            if (res.status === 400 || res.status === 422) {
                save('rejected', attempts);
                return { outcome: 'invalid_email', attempts }; // permanent, do not retry
            }
            if (res.status === 429) {
                const hinted = Number(res.headers?.['retry-after']) * 1000;
                await sleep(Math.min(hinted > 0 ? hinted : 2 ** attempts * 500, 30000));
                continue;
            }
            if (res.status >= 500) { await sleep(2 ** attempts * 250); continue; }
            break;
        } catch (err) {
            if (err.code !== 'ETIMEDOUT') throw err;
            // Outcome unknown: it may have been accepted. Look it up before retrying with the same key.
            log({ event: 'timeout', id: key.slice(0, 8), attempt: attempts });
            if (await service.find(normalized).catch(() => null)) {
                save('done', attempts);
                return { outcome: 'already_subscribed', attempts };
            }
            await sleep(2 ** attempts * 250);
        }
    }
    save('pending', attempts); // left for a background retry, not dropped
    return { outcome: 'failed', attempts };
}

module.exports = { subscribe };
