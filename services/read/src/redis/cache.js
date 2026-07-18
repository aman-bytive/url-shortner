import redisClient from "./client.js"

export const getCachedUrl = async (key) => {
    const data = await redisClient.get(key);
    if (data == null) return null;
    return JSON.parse(data);
}

export const setCachedUrl = async (key, value, ttlSeconds) => {
    return redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
};