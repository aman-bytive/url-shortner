
export const ttlFor = (url, cap) => {
    if (!url.expires_at) return cap;
    const secsLeft = Math.floor((new Date(url.expires_at) - new Date()) / 1000);
    return Math.min(cap, Math.max(1, secsLeft));
};

export const toResponse = (data) => (
    {
        longUrl: data.long_url,
        statusCode: data.is_permanent ? 301 : 302,
    }
)