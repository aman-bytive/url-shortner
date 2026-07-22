import bcrypt from "bcrypt";
import { getUserByEmail, insertUser, insertRefreshToken,getUserIdByRefreshToken } from "../repositories/auth.repository.js";
import { createApiError } from "../utils/apiError.js";
import { signAccessToken, generateRefreshToken, hashToken } from "../utils/tokens.js";

const UNIQUE_VIOLATION = "23505";

export const register = async ({ email, password }) => {
    const user = await getUserByEmail(email);
    if (user) {
        throw createApiError('User already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let newUser;
    try {
        newUser = await insertUser({ email, password: hashedPassword });
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) {
            throw createApiError('User already exists', 409);
        }
        throw error;
    }

    const { password_hash, ...safeUser } = newUser;
    return safeUser;
}

export const login = async ({ email, password }) => {
    const user = await getUserByEmail(email);
    if (!user) {
        throw createApiError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
        throw createApiError('Invalid email or password', 401);
    }

    const accessToken = signAccessToken(user.id);

    const rawRefreshToken = generateRefreshToken(user.id);
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) * 24 * 60 * 60 * 1000);
    await insertRefreshToken({ userId: user.id, tokenHash, expiresAt });

    const { password_hash, ...safeUser } = user;
    return { ...safeUser, accessToken, refreshToken: rawRefreshToken };
}

export const refresh = async ({ refreshToken }) => {
    const tokenHash = hashToken(refreshToken);
    const userId = await getUserIdByRefreshToken(tokenHash);
    if (!userId) {
        throw createApiError('Invalid refresh token', 401);
    }

    const accessToken = signAccessToken(userId);

    return { accessToken };
}