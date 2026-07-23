import pool from "../config/db.js";

export const insertUrl = async ({ userId, shortCode, longUrl, isPermanent, expiresAt }) => {
    const { rows } = await pool.query(
        `INSERT INTO urls (user_id, short_code, long_url, is_permanent, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, shortCode, longUrl, isPermanent ?? false, expiresAt ?? null]
    );
    return rows[0];
};

export const getUrlByLongUrl = async ({ userId, longUrl }) => {
    const { rows } = await pool.query(
        `SELECT * FROM urls WHERE user_id = $1 AND long_url = $2 AND NOT is_deleted`,
        [userId, longUrl]
    );
    return rows[0] ?? null;
}

export const getUrl = async ({ shortCode, userId }) => {
    const { rows } = await pool.query(
        `SELECT * FROM urls WHERE short_code = $1 AND user_id = $2 AND NOT is_deleted `,
        [shortCode, userId]
    );
    return rows[0] ?? null;
}

export const getUrls = async ({ userId, cursor, pageSize }) => {
    const effectiveCursor = Number(cursor ?? 0);
    const limit = Math.max(1, Math.min(Number(pageSize) || 10, 100));
    const { rows } = await pool.query(
        `SELECT * from urls WHERE id > $1 and NOT is_deleted and user_id = $2
        ORDER BY id ASC LIMIT $3`,
        [effectiveCursor, userId, limit]
    );
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null;
    return { rows, nextCursor };
}

export const deleteUrl = async ({ shortCode, userId }) => {
    const { rows } = await pool.query(
        `UPDATE urls SET is_deleted = true WHERE short_code = $1 AND user_id = $2 AND
        NOT is_deleted RETURNING *`,
        [shortCode, userId]
    );
    return rows[0] ?? null;
}