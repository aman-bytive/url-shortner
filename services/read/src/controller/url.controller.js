import {getUrlByCode} from '../services/url.service.js';
import { pushClickEvent } from '../redis/clicks.js';
import { hashIp } from '../utils/hash.js';

export const getLongUrl = async (req, res) => {
    const { shortCode } = req.params;
    const result = await getUrlByCode({ shortCode });

    // fire-and-forget — must not delay the redirect
    pushClickEvent({
        shortCode,
        referrer: req.headers.referer,
        ipHash: hashIp(req.ip),
    });

    return res.redirect(result.statusCode, result.longUrl);
}