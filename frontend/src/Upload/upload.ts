import { API_BASE } from "../config.js";
import { toast, showBlocking, hideBlocking } from "../ui.js";

type Item = {
  id: string;
  status: string;
  original?: string;
  filename?: string;
  summary?: string;
  tags?: string[];
  pillarId?: string;
  pillarName?: string;
  topicName?: string;
  confidence?: number;
  rationale?: string;
  duplicate?: boolean;
};

let currentItemId: string | null = null;

export function initUpload(opts: { onAfterSuccess?: () => void } = {}): void {
  const dropZone = document.getElementById("dropZone") as HTMLElement | null;
  const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const dt = (e as DragEvent).dataTransfer;
    if (dt?.files?.[0]) void handleFile(dt.files[0], opts.onAfterSuccess);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) void handleFile(fileInput.files[0], opts.onAfterSuccess);
  });
}

async function handleFile(file: File, onAfterSuccess?: () => void): Promise<void> {
  const dropZone = document.getElementById("dropZone") as HTMLElement | null;
  const spinner = document.getElementById("spinner") as HTMLElement | null;
  const resultCard = document.getElementById("resultCard") as HTMLElement | null;
  if (!dropZone || !spinner || !resultCard) return;

  dropZone.style.display = "none";
  spinner.classList.add("visible");
  resultCard.classList.remove("visible", "success", "error");

  const fd = new FormData();
  fd.append("file", file);

  try {
    showBlocking("Processando…");
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    spinner.classList.remove("visible");

    if (!res.ok) {
      throw new Error((data as any).details || (data as any).error || (data as any).detail || "Unknown");
    }

    const item: Item = (data as any).item || (data as any);
    if (item.duplicate) {
      toast("Esse arquivo já estava no Vault (sem duplicar)");
    }
    showResult(item, file.name);
    onAfterSuccess?.();
  } catch (err) {
    spinner.classList.remove("visible");
    showError((err as Error).message, file.name);
  } finally {
    hideBlocking();
  }
}

function showResult(item: Item, filename?: string): void {
  currentItemId = item.id;

  const card = document.getElementById("resultCard") as HTMLElement | null;
  if (!card) return;

  card.classList.add("visible", "success");
  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("resultEmoji", "✅");
  setText("resultTitle", "Classificado!");
  setText("resultFile", filename || item.original || item.filename || "");
  setText("resultStatus", item.status || "");
  setText("resultSummary", item.summary || "Sem resumo");
  setText("resultPillar", `${item.pillarId || "—"} – ${item.pillarName || "—"}`);
  setText("resultTopic", item.topicName || "—");
  setText("resultRationale", item.rationale || "");

  const pct = Math.round(((item.confidence || 0) as number) * 100);
  setText("resultConfidence", Number.isFinite(pct) ? `${pct}%` : "—");

  const bar = document.getElementById("resultConfBar") as HTMLElement | null;
  if (bar) bar.style.width = Number.isFinite(pct) ? `${pct}%` : "0%";

  const tagsRow = document.getElementById("resultTags") as HTMLElement | null;
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

function showError(message: string, filename?: string): void {
  const card = document.getElementById("resultCard") as HTMLElement | null;
  if (!card) return;

  card.classList.add("visible", "error");
  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("resultEmoji", "❌");
  setText("resultTitle", "Erro");
  setText("resultFile", filename || "");
  setText("resultSummary", message);
  const tagsRow = document.getElementById("resultTags") as HTMLElement | null;
  if (tagsRow) tagsRow.innerHTML = "";
  setText("resultPillar", "—");
  setText("resultTopic", "—");
  setText("resultRationale", "");
  setText("resultConfidence", "—");
  const bar = document.getElementById("resultConfBar") as HTMLElement | null;
  if (bar) bar.style.width = "0%";
}

export async function confirmClassification(): Promise<void> {
  if (!currentItemId) return;

  try {
    showBlocking("Confirmando…");
    const res = await fetch(`${API_BASE}/items/${currentItemId}/confirm`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));

    if ((data as any)?.id || (data as any)?.success) {
      const status = document.getElementById("resultStatus");
      if (status) status.textContent = "confirmed";

      const btn = document.getElementById("confirmBtn") as HTMLButtonElement | null;
      if (btn) {
        btn.textContent = "✅ Confirmado!";
        btn.disabled = true;
      }

      toast("Salvo no Vault! 🎉");
    }
  } catch (e) {
    toast(`Erro: ${(e as Error).message}`);
  } finally {
    hideBlocking();
  }
}

export function resetUpload(): void {
  const dropZone = document.getElementById("dropZone") as HTMLElement | null;
  const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
  const resultCard = document.getElementById("resultCard") as HTMLElement | null;

  if (dropZone) dropZone.style.display = "";
  if (resultCard) resultCard.classList.remove("visible", "success", "error");
  if (fileInput) fileInput.value = "";

  currentItemId = null;
}
