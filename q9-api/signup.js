'use strict';
const crypto = require('node:crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // cheap shape check; the service stays the authority
const MAX_EMAIL_LENGTH = 254;   // checked BEFORE the regex: stops catastrophic backtracking on huge input
const MAX_WAIT_MS = 30000;      // upper bound on any Retry-After wait

/**
 * Subscribe an email without losing or duplicating the signup.
 *
 * service.subscribe({ email }, { idempotencyKey, timeoutMs }) -> { status, headers? }
 *   throws Error with .code === 'ETIMEDOUT' if no response arrived (outcome UNKNOWN: it may have been accepted).
 * service.find(email) -> record | null   (reconcile after a timeout, in case the key is not honoured)
 * store: durable Map-like { get, set }, so a crash or retry reuses the same key.
 *
 * Returns { outcome: 'subscribed' | 'already_subscribed' | 'invalid_email' | 'failed', attempts }.
 */
async function subscribe(email, { service, store, secret = process.env.SIGNUP_KEY_SECRET, log = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)), maxAttempts = 4, timeoutMs = 3000 }) {
    if (!secret) throw new Error('subscribe: a server-side secret is required to derive idempotency keys');
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(normalized)) {
        log({ event: 'signup_rejected', reason: 'invalid_email_local' });
        return { outcome: 'invalid_email', attempts: 0 }; // never sent, nothing to retry
    }

    // Same email -> same key on every retry. This is what makes retries safe.
    // HMAC with a server-side secret: stable per email, but not reversible by hashing a list of known addresses.
    const key = crypto.createHmac('sha256', secret).update(normalized).digest('hex').slice(0, 32);
    const logId = key.slice(0, 8); // logs get a short prefix only
    const prior = store.get(key);
    if (prior?.status === 'done') return { outcome: 'already_subscribed', attempts: 0 };
    // Write BEFORE the call so a crash mid-request cannot lose the signup.
    store.set(key, { status: 'pending', email: normalized, attempts: prior?.attempts ?? 0, updatedAt: Date.now() });

    const save = (status, attempts) => store.set(key, { status, email: normalized, attempts, updatedAt: Date.now() });

    let attempts = 0;
    while (attempts < maxAttempts) {
        attempts++;
        try {
            const res = await service.subscribe({ email: normalized }, { idempotencyKey: key, timeoutMs });
            log({ event: 'signup_response', id: logId, attempt: attempts, status: res.status });

            if (res.status === 200 || res.status === 201 || res.status === 409) {
                save('done', attempts);
                return { outcome: res.status === 201 ? 'subscribed' : 'already_subscribed', attempts }; // 409/200 replay = already there = success
            }
            if (res.status === 400 || res.status === 422) {
                save('rejected', attempts);
                return { outcome: 'invalid_email', attempts }; // permanent: do not retry
            }
            if (res.status === 429) {
                const hinted = Number(res.headers?.['retry-after']) * 1000;
                const wait = Math.min(hinted > 0 ? hinted : 2 ** attempts * 500, MAX_WAIT_MS); // positive and capped
                log({ event: 'rate_limited', id: logId, attempt: attempts, waitMs: wait });
                await sleep(wait); // honour Retry-After
                continue;
            }
            if (res.status >= 500) { await sleep(2 ** attempts * 250); continue; }
            break; // other 4xx: permanent
        } catch (err) {
            if (err.code !== 'ETIMEDOUT') throw err;
            // Outcome unknown. Do NOT assume failure: look it up, then retry with the SAME key.
            log({ event: 'timeout', id: logId, attempt: attempts });
            const existing = await service.find(normalized).catch(() => null);
            if (existing) {
                save('done', attempts);
                return { outcome: 'already_subscribed', attempts };
            }
            await sleep(2 ** attempts * 250);
        }
    }
    save('pending', attempts); // left for a background retry, not dropped
    log({ event: 'signup_gave_up', id: logId, attempts });
    return { outcome: 'failed', attempts };
}

module.exports = { subscribe };
