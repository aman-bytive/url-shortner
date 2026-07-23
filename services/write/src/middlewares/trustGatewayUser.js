import { createApiError } from "../utils/apiError.js";

export const trustGatewayUser = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        throw createApiError("Missing X-User-Id header", 401);
    }
    req.user = { id: userId };
    next();
}
