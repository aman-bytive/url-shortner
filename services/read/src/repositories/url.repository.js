import pool from "../config/db.js";

export const getUrl = async ({ shortCode }) => {
    const { rows } = await pool.query(
        `SELECT long_url,is_permanent,expires_at FROM urls 
        WHERE short_code = $1 and NOT is_deleted`,
        [shortCode]
    );
    return rows[0] ?? null;
}