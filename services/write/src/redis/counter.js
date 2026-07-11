import redisClient from "./client.js";

export const incrCounter = async (key) => {
    return redisClient.incr(key);
};
