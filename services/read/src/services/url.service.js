import { getCachedUrl, setCachedUrl } from "../redis/cache.js";
import { createApiError } from "../utils/apiError.js";
import { toResponse } from "../utils/helper.js";
import { urlKey } from "../redis/keys.js"
import { ttlFor } from "../utils/helper.js"
import { singleFlight } from "../cache/singleFlight.js";

const CACHE_TTL = 3600;

export const getUrlByCode = async ({ shortCode }) => {
    const key = urlKey(shortCode);

    let cached = null;
    try {
        cached = await getCachedUrl(key);
    } catch (error) {
        console.error("Redis GET failed, falling through to DB:", error);
    }

    if (cached) {
        if (cached.notFound) {
            throw createApiError("Url not found", 404);
        }
        return toResponse(cached);
    }

    const url = await singleFlight(shortCode);
    if (!url) { //negative caching to avoid repeated DB hits for non-existent short codes
        try {
            await setCachedUrl(key, { notFound: true }, 1800);
        } catch (error) {
            console.error("Redis SET failed, skipping write-back:", error);
        }
        throw createApiError("Url not found", 404);
    }
    if (url.expires_at && new Date(url.expires_at) < new Date()) {
        throw createApiError("Url has expired", 410);
    }

    const ttl = ttlFor(url, CACHE_TTL);
    try {
        await setCachedUrl(key, url, ttl);
    } catch (error) {
        console.error("Redis SET failed, skipping write-back:", error);
    }

    return toResponse(url);
}