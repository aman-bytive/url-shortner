import { shortenUrl, getUrlByCode, getAllUrls, softDeleteUrl } from "../services/url.service.js";
import { responseHandler } from "../utils/response.js";

export const createShortUrl = async (req, res) => {
    const { longUrl, customCode, permanent, expiresAt } = req.value;

    const userId = req.user.id;

    const result = await shortenUrl({
        userId,
        longUrl,
        customCode,
        permanent,
        expiresAt
    });

    return responseHandler(result, res, "Short URL created", 201);
};

export const getShortUrlByCode = async (req, res) => {
    const { shortCode } = req.params;
    const userId = req.user.id;

    const result = await getUrlByCode({ shortCode, userId });

    return responseHandler(result, res, "", 200);
}

export const getAllShortUrl = async (req, res) => {
    const { cursor, pageSize } = req.query;
    const userId = req.user.id;
    const result = await getAllUrls({ userId, cursor, pageSize });
    return responseHandler(result, res, "", 200)
}

export const deleteShortUrl = async (req, res) => {
    const { shortCode } = req.params;
    const userId = req.user.id;
    const result = await softDeleteUrl({ shortCode, userId });
    return responseHandler(result, res, "Url deleted", 200);
}