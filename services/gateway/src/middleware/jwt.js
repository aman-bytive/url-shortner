import jwt from "jsonwebtoken";
import { createApiError } from "../utils/apiError.js";

const secretKey = process.env.JWT_SECRET;
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) throw createApiError("No token provided", 401);
        const token = authHeader.split(" ")[1];

        const decode = jwt.verify(token, secretKey);
        req.user = decode;

        next();
    } catch (error) {
        throw createApiError("Invalid or expired token", 401);
    }
}

export default verifyToken;