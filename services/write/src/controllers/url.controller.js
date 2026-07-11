import { shortenUrl } from "../services/url.service.js";
import { responseHandler, sendError } from "../utils/response.js";

export const createShortUrl = async (req, res) => {
    const { longUrl, customCode, permanent, expiresAt } = req.body;

    try {
        const result = await shortenUrl({
            longUrl,
            customCode,
            permanent,
            expiresAt
        });
        return responseHandler(result, res, "Short URL created", 201);
    } catch (err) {
        if (err.isApiError) {
            return sendError(err.message, res, err.status);
        }
        console.error(err);
        return sendError("Internal server error", res, 500);
    }
};
