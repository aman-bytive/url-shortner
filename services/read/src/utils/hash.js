import { createHash } from "node:crypto";

export const hashIp = (ip) => {
    if (!ip) return null;
    return createHash("sha256").update(ip).digest();
};
