import { getUrl } from "../repositories/url.repository.js";

const inFlight = new Map();

export const singleFlight = async (shortCode) => {
    if (inFlight.has(shortCode)) return inFlight.get(shortCode);

    const promise = getUrl({ shortCode }).finally(() => {
        inFlight.delete(shortCode);
    })

    inFlight.set(shortCode, promise);

    return promise;
}