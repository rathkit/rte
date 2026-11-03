// Base64 without relying on a global that only some environments have.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function decodeBase64(input: string): Uint8Array | undefined {
  const spaced = input.replace(/\s+/g, "");
  let end = spaced.length;
  while (end > 0 && spaced[end - 1] === "=") end--;
  const text = spaced.slice(0, end);
  if (/[^A-Za-z0-9+/]/.test(text)) return undefined;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const ch of text) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] as string;
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)] as string;
    out += b === undefined ? "=" : (B64[((b & 15) << 2) | ((c ?? 0) >> 6)] as string);
    out += c === undefined ? "=" : (B64[c & 63] as string);
  }
  return out;
}

