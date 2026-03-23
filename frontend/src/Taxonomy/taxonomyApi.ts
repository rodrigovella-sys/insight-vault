import { API_BASE } from "../config.js";

export type PillarSummary = {
  id: string;
  nameEn: string;
  namePt: string;
  topicCount: number;
};

export type Topic = {
  id: string;
  name: string;
};

let pillarsPromise: Promise<PillarSummary[]> | null = null;
const topicsByPillar = new Map<string, Promise<Topic[]>>();

export async function getPillars(): Promise<PillarSummary[]> {
  if (!pillarsPromise) {
    pillarsPromise = fetch(`${API_BASE}/pillars`).then(async (res) => {
      const data = await res.json().catch(() => ([]));
      if (!res.ok) {
        const message = (data as any)?.error || "Failed to load pillars";
        throw new Error(message);
      }
      return Array.isArray(data) ? (data as PillarSummary[]) : [];
    });
  }
  return pillarsPromise;
}

export async function getTopics(pillarId: string): Promise<Topic[]> {
  if (!pillarId) return [];

  let promise = topicsByPillar.get(pillarId);
  if (!promise) {
    promise = fetch(`${API_BASE}/topics?pillar=${encodeURIComponent(pillarId)}`).then(async (res) => {
      const data = await res.json().catch(() => ([]));
      if (!res.ok) {
        const message = (data as any)?.error || "Failed to load topics";
        throw new Error(message);
      }
      return Array.isArray(data) ? (data as Topic[]) : [];
    });
    topicsByPillar.set(pillarId, promise);
  }
  return promise;
}

export async function createTopic(pillarId: string, name: string): Promise<Topic> {
  const res = await fetch(`${API_BASE}/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pillarId, name }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as any)?.error || "Failed to create topic";
    throw new Error(message);
  }

  pillarsPromise = null;
  topicsByPillar.delete(pillarId);

  const created = data as Topic;
  try {
    window.dispatchEvent(
      new CustomEvent("taxonomy:changed", {
        detail: { pillarId, topic: created },
      })
    );
  } catch {
    // Ignore if CustomEvent/window isn't available.
  }

  return created;
}
