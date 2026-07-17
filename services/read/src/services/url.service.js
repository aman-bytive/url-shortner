import { getUrl } from "../repositories/url.repository.js";
import { createApiError } from "../utils/apiError.js";

export const getUrlByCode = async ({ shortCode }) => {
    const url = await getUrl({ shortCode });
    if (!url) throw createApiError("Url not found", 404);
    if (url.expires_at && new Date(url.expires_at) < new Date()) throw createApiError("Url has expired", 410);
    return {
        longUrl: url.long_url,
        statusCode: url.is_permanent == true ? 301 : 302,
    };
}