import { checkAndConsumeToken } from '../redis/token.js';
import { createApiError } from '../utils/apiError.js';

export const rateLimiter = (bucketConfig) => {
    return async (req, res, next) => {
        const identity = req.ip || req.headers['x-api-key'];
        const routeClass = bucketConfig.name;
        const key = `ratelimit:${routeClass}:${identity}`;
        const { allowed, retryAfterSeconds } = await checkAndConsumeToken(key, bucketConfig);
        if (!allowed) {
            const error = createApiError('Rate limit exceeded', 429);
            error.retryAfter = retryAfterSeconds;
            throw error;
        }
        next();
    }
}