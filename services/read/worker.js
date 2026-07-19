import "dotenv/config";
import redisClient, { connectRedis } from "./src/redis/client.js";
import { connectDB } from "./src/config/db.js";
import pool from "./src/config/db.js";
import { CLICKS_STREAM } from "./src/redis/clicks.js";

const GROUP = "clicks-worker-group";
const CONSUMER = "worker-1";
const BATCH_SIZE = 100;
const BLOCK_MS = 5000;

const ensureGroup = async () => {
    try {
        await redisClient.xGroupCreate(CLICKS_STREAM, GROUP, "0", { MKSTREAM: true });
    } catch (error) {
        if (!String(error.message).includes("BUSYGROUP")) throw error;
    }
};

const persistClick = async (message) => {
    const ipHashBuffer = message.ipHash ? Buffer.from(message.ipHash, "hex") : null;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `INSERT INTO clicks (short_code, clicked_at, referrer, ip_hash)
             VALUES ($1, $2, $3, $4)`,
            [message.shortCode, message.clickedAt, message.referrer || null, ipHashBuffer]
        );
        await client.query(
            `UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1`,
            [message.shortCode]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const processEntries = async (entries) => {
    for (const { id, message } of entries) {
        try {
            await persistClick(message);
            await redisClient.xAck(CLICKS_STREAM, GROUP, id);
        } catch (error) {
            console.error("Failed to persist click, leaving unacked:", id, error);
        }
    }
};

const recoverPending = async () => {
    const summary = await redisClient.xPending(CLICKS_STREAM, GROUP);
    if (!summary || summary.pending === 0) return;

    const detail = await redisClient.xPendingRange(CLICKS_STREAM, GROUP, "-", "+", BATCH_SIZE);
    if (detail.length === 0) return;

    const ids = detail.map((entry) => entry.id);
    const claimed = await redisClient.xClaim(CLICKS_STREAM, GROUP, CONSUMER, 0, ids);
    await processEntries(claimed.filter(Boolean).map((entry) => ({ id: entry.id, message: entry.message })));
};

const runWorker = async () => {
    await connectDB();
    await connectRedis();
    await ensureGroup();
    await recoverPending();

    console.log("Click worker started, draining", CLICKS_STREAM);

    while (true) {
        const result = await redisClient.xReadGroup(
            GROUP,
            CONSUMER,
            [{ key: CLICKS_STREAM, id: ">" }],
            { COUNT: BATCH_SIZE, BLOCK: BLOCK_MS }
        );

        if (!result) continue;

        for (const stream of result) {
            await processEntries(stream.messages);
        }
    }
};

runWorker().catch((error) => {
    console.error("Worker crashed:", error);
    process.exit(1);
});
