// api/_lib/kv.js
//
// Uses @upstash/redis directly (the replacement for the deprecated
// @vercel/kv package). Get UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN from: Vercel dashboard -> Storage ->
// Marketplace -> Redis (free tier).

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const kv = {
  async get(key) {
    return redis.get(key);
  },
  async set(key, value, opts) {
    return redis.set(key, value, opts);
  },
  async del(key) {
    return redis.del(key);
  },
};