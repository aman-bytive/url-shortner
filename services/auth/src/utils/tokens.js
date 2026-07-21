import jwt from "jsonwebtoken";
import crypto from "crypto";

export const signAccessToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
}

export const generateRefreshToken = (userId) => {
    return crypto.randomBytes(32).toString('hex');
}

export const hashToken=(rawToken) => {
    return crypto.createHash('sha256').update(rawToken).digest();
}