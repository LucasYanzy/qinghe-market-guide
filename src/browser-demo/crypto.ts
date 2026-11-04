import { sha256 } from "@noble/hashes/sha2.js";
import { scrypt } from "@noble/hashes/scrypt.js";

class Bytes extends Uint8Array {
  toString(encoding?: string) {
    return encoding === "hex" ? Array.from(this, (v) => v.toString(16).padStart(2, "0")).join("") : new TextDecoder().decode(this);
  }
}
export const randomUUID = () => crypto.randomUUID();
export const randomBytes = (length: number) => crypto.getRandomValues(new Bytes(length));
export const randomInt = (minimum: number, maximum: number) => {
  const range = maximum - minimum;
  const limit = Math.floor(0x100000000 / range) * range;
  let value;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return minimum + value % range;
};
export const scryptSync = (password: string, salt: string, length: number) => new Bytes(scrypt(password, salt, { N: 16384, r: 8, p: 1, dkLen: length }));
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
};
export function createHash(_algorithm: string) {
  let input = "";
  return { update(value: string) { input += value; return this; }, digest(_encoding: string) { return new Bytes(sha256(new TextEncoder().encode(input))).toString("hex"); } };
}
