const isLocalDev =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.protocol === "file:";

// In production (Render), the frontend is served by the same Express service.
// Using location.origin prevents hard-coding a specific Render URL.
export const API_BASE = isLocalDev ? "http://localhost:3000" : location.origin;
