import {getUrlByCode} from '../services/url.service.js';

export const getLongUrl = async (req, res) => {
    const { shortCode } = req.params;
    const result = await getUrlByCode({ shortCode });
    return res.redirect(result.statusCode, result.longUrl);
}