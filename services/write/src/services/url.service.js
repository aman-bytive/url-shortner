import { incrCounter } from "../redis/counter.js";
import { insertUrl, getUrl, getUrls, deleteUrl } from "../repositories/url.repository.js";
import { base62Encode, scramble } from "../utils/base62.js";
import { createApiError } from "../utils/apiError.js";

const MAX_RETRIES = 3;
const UNIQUE_VIOLATION = "23505";

const generateShortCode = async () => {
    const id = await incrCounter("urls:id_counter");
    return base62Encode(scramble(id));
};

export const shortenUrl = async ({ longUrl, customCode, permanent, expiresAt }) => {
    const isCustom = Boolean(customCode);
    let code = customCode;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (!code) {
            code = await generateShortCode();
        }

        try {
            const data = await insertUrl({
                shortCode: code,
                longUrl,
                isPermanent: permanent,
                expiresAt,
            });
            return {
                shortCode : data.short_code,
                shortUrl : `${process.env.BASE_URL}/${data.short_code}`,
                longUrl : data.long_url
            }
        } catch (err) {
            if (err.code !== UNIQUE_VIOLATION) throw err;

            if (isCustom) {
                throw createApiError("CODE_TAKEN", 409);
            }

            code = null;
            if (attempt === MAX_RETRIES) {
                console.error("Code generation failed after max retries", { longUrl });
                throw createApiError("COUNTER_REGRESSION", 500);
            }
        }
    }
};

export const getUrlByCode = async ({ shortCode }) => {
    const url = await getUrl({ shortCode });
    if (url == null) throw createApiError("Url not found", 404);
    return url;
}

export const getAllUrls = async ({ cursor, pageSize }) => {
    return await getUrls({ cursor, pageSize });
}

export const softDeleteUrl = async ({ shortCode }) => {
    const url = await deleteUrl({ shortCode });
    if (!url) throw createApiError("NOT_FOUND", 404);
    return url;
}