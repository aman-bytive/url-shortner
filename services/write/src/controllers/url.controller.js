import { shortenUrl,getUrlByCode } from "../services/url.service.js";
import { responseHandler } from "../utils/response.js";

export const createShortUrl = async (req, res) => {
    const { longUrl, customCode, permanent, expiresAt } = req.body;

    const result = await shortenUrl({
        longUrl,
        customCode,
        permanent,
        expiresAt
    });

    return responseHandler(result, res, "Short URL created", 201);
};

export const getShortUrlByCode = async (req, res) => {
    const { shortCode } = req.params;

    const result = await getUrlByCode({shortCode});

    return responseHandler(result,res,"",200);
}