import "dotenv/config";
import redisClient, { connectRedis } from "./src/redis/client.js";
import { connectDB } from "./src/config/db.js";
import pool from "./src/config/db.js";
import { CLICKS_STREAM } from "./src/redis/clicks.js";

const GROUP = "clicks-worker-group";
const CONSUMER = "worker-1";
const READ_COUNT = 100;
const READ_BLOCK_MS = 500;
const FLUSH_MAX_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;

const ensureGroup = async () => {
    try {
        await redisClient.xGroupCreate(CLICKS_STREAM, GROUP, "0", { MKSTREAM: true });
    } catch (error) {
        if (!String(error.message).includes("BUSYGROUP")) throw error;
    }
};

// batch = [{ id, message: { shortCode, clickedAt, referrer, ipHash } }, ...]
const flushBatch = async (batch) => {
    if (batch.length === 0) return;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const insertRows = [];
        const insertParams = [];
        batch.forEach((entry, i) => {
            const base = i * 4;
            insertRows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
            insertParams.push(
                entry.message.shortCode,
                entry.message.clickedAt,
                entry.message.referrer || null,
                entry.message.ipHash ? Buffer.from(entry.message.ipHash, "hex") : null
            );
        });
        await client.query(
            `INSERT INTO clicks (short_code, clicked_at, referrer, ip_hash)
             VALUES ${insertRows.join(", ")}`,
            insertParams
        );

        const counts = new Map();
        for (const entry of batch) {
            counts.set(entry.message.shortCode, (counts.get(entry.message.shortCode) || 0) + 1);
        }
        const updateRows = [];
        const updateParams = [];
        let i = 0;
        for (const [shortCode, count] of counts) {
            updateRows.push(`($${i * 2 + 1}, $${i * 2 + 2}::bigint)`);
            updateParams.push(shortCode, count);
            i++;
        }
        await client.query(
            `UPDATE urls AS u
             SET click_count = u.click_count + v.n
             FROM (VALUES ${updateRows.join(", ")}) AS v(short_code, n)
             WHERE u.short_code = v.short_code`,
            updateParams
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    await redisClient.xAck(CLICKS_STREAM, GROUP, batch.map((entry) => entry.id));
};

const recoverPending = async () => {
    const summary = await redisClient.xPending(CLICKS_STREAM, GROUP);
    if (!summary || summary.pending === 0) return;

    const detail = await redisClient.xPendingRange(CLICKS_STREAM, GROUP, "-", "+", FLUSH_MAX_SIZE);
    if (detail.length === 0) return;

    const ids = detail.map((entry) => entry.id);
    const claimed = await redisClient.xClaim(CLICKS_STREAM, GROUP, CONSUMER, 0, ids);
    const batch = claimed.filter(Boolean).map((entry) => ({ id: entry.id, message: entry.message }));

    try {
        await flushBatch(batch);
    } catch (error) {
        console.error("Failed to flush recovered batch, will retry next restart:", error);
    }
};

const runWorker = async () => {
    await connectDB();
    await connectRedis();
    await ensureGroup();
    await recoverPending();

    console.log("Click worker started, draining", CLICKS_STREAM);

    let buffer = [];
    let lastFlush = Date.now();

    while (true) {
        const result = await redisClient.xReadGroup(
            GROUP,
            CONSUMER,
            [{ key: CLICKS_STREAM, id: ">" }],
            { COUNT: READ_COUNT, BLOCK: READ_BLOCK_MS }
        );

        if (result) {
            for (const stream of result) {
                for (const { id, message } of stream.messages) {
                    buffer.push({ id, message });
                }
            }
        }

        const shouldFlush =
            buffer.length >= FLUSH_MAX_SIZE ||
            (buffer.length > 0 && Date.now() - lastFlush >= FLUSH_INTERVAL_MS);

        if (shouldFlush) {
            const toFlush = buffer;
            buffer = [];
            lastFlush = Date.now();

            try {
                await flushBatch(toFlush);
            } catch (error) {
                // entries were delivered but never acked — stay in the group's
                // pending list, reclaimed by recoverPending() on next restart
                console.error("Failed to flush batch, entries remain unacked:", error);
            }
        }
    }
};

runWorker().catch((error) => {
    console.error("Worker crashed:", error);
    process.exit(1);
});
