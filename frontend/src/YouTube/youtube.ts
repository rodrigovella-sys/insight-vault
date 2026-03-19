import { API_BASE } from "../config.js";
import { toast } from "../ui.js";

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

  const spinner = document.getElementById("spinnerYt") as HTMLElement | null;
  const card = document.getElementById("resultCardYt") as HTMLElement | null;
  spinner?.classList.add("visible");
  card?.classList.remove("visible", "success", "error");

  try {
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

  const spinner = document.getElementById("spinnerPlaylist") as HTMLElement | null;
  const card = document.getElementById("resultCardPlaylist") as HTMLElement | null;
  spinner?.classList.add("visible");
  card?.classList.remove("visible", "success", "error");

  try {
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
  }
}

function showPlaylistResult(data: { imported?: number; total?: number; message?: string }): void {
  const card = document.getElementById("resultCardPlaylist") as HTMLElement | null;
  if (!card) return;

  card.classList.add("visible", "success");

  const title = document.getElementById("resultTitlePlaylist");
  const summary = document.getElementById("resultSummaryPlaylist");

  if (typeof data.imported !== "number") {
    const total = typeof data.total === "number" ? data.total : "";
    const msg = data.message || `Processando${total ? ` ${total}` : ""} vídeos...`;
    if (title) title.textContent = "Playlist recebida";
    if (summary) {
      summary.innerHTML = `<div style="font-size:14px;margin-bottom:12px">${msg}</div><p style="font-size:12px;color:var(--muted)">Veja na aba Vault em alguns minutos</p>`;
    }
    toast(msg);
    return;
  }

  const imported = data.imported;
  const total = data.total || imported;
  const failed = Math.max(0, total - imported);

  if (title) title.textContent = `${imported} de ${total} vídeos!`;
  if (summary) {
    summary.innerHTML = `<div style="font-size:14px;margin-bottom:12px">✅ <strong>${imported}</strong> classificados<br>${failed > 0 ? `⚠️ <strong>${failed}</strong> falharam` : ""}</div><p style="font-size:12px;color:var(--muted)">Veja na aba Vault</p>`;
  }

  toast(`${imported} vídeos importados! 🎉`);
}

export function resetPlaylist(): void {
  const input = document.getElementById("playlistInput") as HTMLInputElement | null;
  if (input) input.value = "";

  const card = document.getElementById("resultCardPlaylist") as HTMLElement | null;
  card?.classList.remove("visible", "success", "error");
}
