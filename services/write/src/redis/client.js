import { createClient } from "redis";

const redisClient = createClient({
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
    },
    password: process.env.REDIS_PASSWORD || undefined,
});

redisClient.on("error", (err) => {
    console.error("Redis client error:", err);
});

export const connectRedis = async () => {
    await redisClient.connect();
    console.log("Redis connected successfully");
};

export default redisClient;
