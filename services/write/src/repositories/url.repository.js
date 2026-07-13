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

export const getUrl = async({shortCode}) =>{
    const {rows} = await pool.query(
        `SELECT * FROM urls WHERE short_code = $1 and NOT is_deleted`,
        [shortCode]
    );
    return rows[0] ?? null;
}