import pool from "../config/db.js";

export const insertUrl = async ({ shortCode, longUrl, isPermanent, expiresAt }) => {
    const { rows } = await pool.query(
        `INSERT INTO urls (short_code, long_url, is_permanent, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [shortCode, longUrl, isPermanent ?? false, expiresAt ?? null]
    );
    return rows[0];
};

export const getUrl = async ({ shortCode }) => {
    const { rows } = await pool.query(
        `SELECT * FROM urls WHERE short_code = $1 and NOT is_deleted`,
        [shortCode]
    );
    return rows[0] ?? null;
}

export const getUrls = async ({ cursor, pageSize }) => {
    const effectiveCursor = cursor ?? 0;
    const limit = pageSize ?? 10;
    const { rows } = await pool.query(
        `SELECT * from urls WHERE id > $1 and NOT is_deleted
        ORDER BY id ASC LIMIT $2`,
        [effectiveCursor, limit]
    );
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null;
    return { rows, nextCursor };
}