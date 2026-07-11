const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SCRAMBLE_CONSTANT = 2654435761n;
const SCRAMBLE_RANGE = 62n ** 7n;

export const base62Encode = (num) => {
    if (num === 0n) return BASE62_ALPHABET[0];
    let result = "";
    while (num > 0n) {
        result = BASE62_ALPHABET[Number(num % 62n)] + result;
        num /= 62n;
    }
    return result;
};

// Reversible bijective mix over a fixed range so ids stay unique but stop being sequential/guessable.
export const scramble = (id) => (BigInt(id) * SCRAMBLE_CONSTANT) % SCRAMBLE_RANGE;
