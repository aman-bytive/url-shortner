
export const urlKey = (shortCode) => {
    return `${process.env.URL_KEY_PREFIX || "url"}:${shortCode}`
}