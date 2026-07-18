import { incrCounter } from "../redis/counter.js";
import { base62Encode, scramble } from "./base62.js";

export const toResponse = (data) => ({
    shortCode: data.short_code,
    shortUrl: `${process.env.BASE_URL}/${data.short_code}`,
    longUrl: data.long_url,
});

export const generateShortCode = async () => {
    const id = await incrCounter("urls:id_counter");
    return base62Encode(scramble(id));
};
