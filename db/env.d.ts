declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    EVIDENCE: R2Bucket;
    GEOCODER_BASE_URL?: string;
  }
}
