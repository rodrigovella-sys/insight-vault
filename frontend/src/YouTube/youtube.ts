import { API_BASE } from "../config.js";
import { toast, showBlocking, hideBlocking } from "../ui.js";

type Item = {
  id: string;
  status: string;
  summary?: string;
  tags?: string[];
  pillarId?: string;
  pillarName?: string;
  topicName?: string;
  confidence?: number;
  rationale?: string;
};

let currentItemIdYt: string | null = null;

export async function submitYouTube(): Promise<void> {
  const input = document.getElementById("ytInput") as HTMLInputElement | null;
  if (!input) return;

  const url = input.value.trim();
  if (!url) return toast("Cole um link");

  // If the user pasted a playlist URL, guide them to the playlist importer.
  const playlistOnly = /[?&]list=/.test(url) && !/(?:[?&]v=|youtu\.be\/|shorts\/|embed\/|live\/)[A-Za-z0-9_-]{11}/.test(url);
  if (playlistOnly) {
    toast("Esse link é de playlist. Use 'Importar playlist'.");
    return;
  }

  const spinner = document.getElementById("spinnerYt") as HTMLElement | null;
  const card = document.getElementById("resultCardYt") as HTMLElement | null;
  spinner?.classList.add("visible");
  card?.classList.remove("visible", "success", "error");

  try {
    showBlocking("Classificando…");
    const res = await fetch(`${API_BASE}/youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    spinner?.classList.remove("visible");

    if (!res.ok) {
      throw new Error((data as any).details || (data as any).error || "Erro");
    }

    const item: Item = (data as any).item || (data as any);
    showResultYt(item, url);
  } catch (err) {
    spinner?.classList.remove("visible");
    card?.classList.add("visible", "error");
    const title = document.getElementById("resultTitleYt");
    const summary = document.getElementById("resultSummaryYt");
    if (title) title.textContent = "Erro";
    if (summary) summary.textContent = (err as Error).message;
  } finally {
    hideBlocking();
  }
}

function showResultYt(item: Item, url: string): void {
  currentItemIdYt = item.id;

  const card = document.getElementById("resultCardYt") as HTMLElement | null;
  if (!card) return;

  card.classList.add("visible", "success");

  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("resultTitleYt", "Classificado!");
  setText("resultFileYt", url);
  setText("resultStatusYt", item.status || "");
  setText("resultSummaryYt", item.summary || "Sem resumo");
  setText("resultPillarYt", `${item.pillarId || "—"} – ${item.pillarName || "—"}`);
  setText("resultTopicYt", item.topicName || "—");
  setText("resultRationaleYt", item.rationale || "");

  const pct = Math.round(((item.confidence || 0) as number) * 100);
  setText("resultConfidenceYt", Number.isFinite(pct) ? `${pct}%` : "—");

  const bar = document.getElementById("resultConfBarYt") as HTMLElement | null;
  if (bar) bar.style.width = Number.isFinite(pct) ? `${pct}%` : "0%";

  const tagsRow = document.getElementById("resultTagsYt") as HTMLElement | null;
  if (tagsRow) {
    tagsRow.innerHTML = "";
    (item.tags || []).forEach((t) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tagsRow.appendChild(span);
    });
  }
}

export async function confirmClassificationYt(): Promise<void> {
  if (!currentItemIdYt) return;

  try {
    showBlocking("Confirmando…");
    const res = await fetch(`${API_BASE}/items/${currentItemIdYt}/confirm`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));

    if ((data as any)?.id || (data as any)?.success) {
      const status = document.getElementById("resultStatusYt");
      if (status) status.textContent = "confirmed";

      const btn = document.getElementById("confirmBtnYt") as HTMLButtonElement | null;
      if (btn) {
        btn.textContent = "✅ Confirmado!";
        btn.disabled = true;
      }

      toast("Salvo! 🎉");
    }
  } catch (e) {
    toast(`Erro: ${(e as Error).message}`);
  } finally {
    hideBlocking();
  }
}

export function resetYouTube(): void {
  const input = document.getElementById("ytInput") as HTMLInputElement | null;
  if (input) input.value = "";

  const card = document.getElementById("resultCardYt") as HTMLElement | null;
  card?.classList.remove("visible", "success", "error");

  currentItemIdYt = null;
}

export async function submitPlaylist(): Promise<void> {
  const input = document.getElementById("playlistInput") as HTMLInputElement | null;
  if (!input) return;

  const url = input.value.trim();
  if (!url) return toast("Cole um link");

  const match = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  const playlistId = match?.[1] || "";
  if (playlistId) {
    localStorage.setItem("lastPlaylistId", playlistId);
  }

  const spinner = document.getElementById("spinnerPlaylist") as HTMLElement | null;
  const card = document.getElementById("resultCardPlaylist") as HTMLElement | null;
  spinner?.classList.add("visible");
  card?.classList.remove("visible", "success", "error");

  try {
    showBlocking();
    const res = await fetch(`${API_BASE}/youtube/playlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    spinner?.classList.remove("visible");

    if (!res.ok) throw new Error((data as any).details || (data as any).error || "Erro");

    showPlaylistResult(data as any);
  } catch (err) {
    spinner?.classList.remove("visible");
    card?.classList.add("visible", "error");
    const title = document.getElementById("resultTitlePlaylist");
    const summary = document.getElementById("resultSummaryPlaylist");
    if (title) title.textContent = "Erro";
    if (summary) summary.textContent = (err as Error).message;
  } finally {
    hideBlocking();
  }
}

function showPlaylistResult(data: { imported?: number; total?: number; alreadyImported?: number; playlistId?: string; skipped?: number; failed?: number }): void {
  const card = document.getElementById("resultCardPlaylist") as HTMLElement | null;
  if (!card) return;

  card.classList.add("visible", "success");

  const title = document.getElementById("resultTitlePlaylist");
  const summary = document.getElementById("resultSummaryPlaylist");

  const imported = typeof data.imported === "number" ? data.imported : 0;
  const total = typeof data.total === "number" ? data.total : imported;
  const failed = typeof data.failed === "number" ? data.failed : Math.max(0, total - imported);
  const already = typeof data.alreadyImported === "number" ? data.alreadyImported : 0;

  if (typeof data.playlistId === "string" && data.playlistId.trim()) {
    localStorage.setItem("lastPlaylistId", data.playlistId.trim());
  }

  if (title) title.textContent = `${imported} de ${total} vídeos!`;
  if (summary) {
    summary.innerHTML = `<div style="font-size:14px;margin-bottom:12px">✅ <strong>${imported}</strong> importados<br>${already > 0 ? `♻️ <strong>${already}</strong> já existiam<br>` : ""}${failed > 0 ? `⚠️ <strong>${failed}</strong> falharam` : ""}</div><p style="font-size:12px;color:var(--muted)">Veja na aba Vault</p>`;
  }

  toast(`${imported} vídeos importados! 🎉`);
}

export function resetPlaylist(): void {
  const input = document.getElementById("playlistInput") as HTMLInputElement | null;
  if (input) input.value = "";

  const card = document.getElementById("resultCardPlaylist") as HTMLElement | null;
  card?.classList.remove("visible", "success", "error");
}
