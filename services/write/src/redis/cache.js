import redisClient from "../redis/client.js";

export const deleteKey = async (key) => {
    return redisClient.del(key);
}