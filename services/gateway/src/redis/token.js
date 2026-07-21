import redisClient from './client.js';

export const WRITE_BUCKET = { name: 'write', capicity: 10, refillRatePerSec: 1 };
export const READ_BUCKET = { name: 'read', capicity: 100, refillRatePerSec: 10 };

export async function checkAndConsumeToken(key, { capicity, refillRatePerSec }) {
    let script = `
        local tokens_key = KEYS[1] .. ':tokens'
        local ts_key = KEYS[1] .. ':ts'
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        local tokens = tonumber(redis.call('GET', tokens_key)) or capacity
        local last_ts = tonumber(redis.call('GET', ts_key)) or now

        local elapsed = math.max(0, now - last_ts)
        tokens = math.min(capacity, tokens + elapsed * refill_rate)

        local allowed = 0
        if tokens >= 1 then
            allowed = 1
            tokens = tokens - 1
        end

        redis.call('SET', tokens_key, tokens)
        redis.call('SET', ts_key, now)
        redis.call('EXPIRE', tokens_key, 3600)   -- cleanup idle keys
        redis.call('EXPIRE', ts_key, 3600)

        return { allowed, tokens }
    `;
    const now = Math.floor(Date.now() / 1000);
    const result = await redisClient.eval(script, {
        keys: [key],
        arguments: [String(capicity), String(refillRatePerSec), String(now)],
    });
    const allowed = result[0] === 1;
    const tokensLeft = result[1];

    if (!allowed) {
        const secondsToNextToken = Math.ceil((1 - tokensLeft) / refillRatePerSec);
        return { allowed: false, retryAfterSeconds: secondsToNextToken };
    }
    return { allowed: true, retryAfterSeconds: 0 };
}