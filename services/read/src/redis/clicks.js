import redisClient from "./client.js";

export const CLICKS_STREAM = "clicks:stream";

export const pushClickEvent = async ({ shortCode, referrer, ipHash }) => {
    try {
        await redisClient.xAdd(CLICKS_STREAM, "*", {
            shortCode,
            clickedAt: new Date().toISOString(),
            referrer: referrer ?? "",
            ipHash: ipHash ? ipHash.toString("hex") : "",
        });
    } catch (error) {
        console.error("Failed to push click event, dropping:", error);
    }
};
