import pool from "../config/db.js";

export const getUserByEmail = async (email) => {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0];
}

export const insertUser = async ({ email, password }) => {
    const { rows } = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *', [email, password]);
    return rows[0];
}

export const insertRefreshToken = async ({ userId, tokenHash, expiresAt }) => {
    const { rows } = await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING *', [userId, tokenHash, expiresAt]);
    return rows[0];
}