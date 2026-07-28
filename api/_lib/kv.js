// api/_lib/kv.js
//
// Uses @upstash/redis directly (the replacement for the deprecated
// @vercel/kv package). Reads either the Upstash-native env var names
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) or the names
// Vercel auto-injects when you connect Storage -> Upstash to a project
// (KV_REST_API_URL / KV_REST_API_TOKEN) — whichever is present.

import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
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