import { API_BASE } from "./config.js";
import { setStatus, toast } from "./ui.js";
import { renderTaxonomy } from "./Taxonomy/taxonomy.js";

type Item = {
  id: string;
  status: string;
  original?: string;
  filename?: string;
  driveFileId?: string;
  driveUrl?: string;
  summary?: string;
  tags?: string[];
  pillarId?: string;
  pillarName?: string;
  topicName?: string;
  confidence?: number;
  rationale?: string;
  createdAt?: string;
};

let currentItemId: string | null = null;
let currentItemIdYt: string | null = null;

function switchTab(id: string, btn: HTMLElement): void {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById("tab-" + id)?.classList.add("active");
  btn.classList.add("active");
  if (id === "vault") void loadVault();
  if (id === "taxonomy") void renderTaxonomy();
}

async function checkHealth(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/health`);
    const d = await r.json();
    setStatus(`Backend online · ${d.items} items · OpenAI: ${d.openai ? "✅" : "⚠️ sem chave"}`, "ok");
  } catch {
    setStatus("Backend offline — verifique o Render.", "err");
  }
}

// Upload
const dropZone = document.getElementById("dropZone") as HTMLElement | null;
const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;

function bindUpload(): void {
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
    if (dt?.files?.[0]) void handleFile(dt.files[0]);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) void handleFile(fileInput.files[0]);
  });
}

async function handleFile(file: File): Promise<void> {
  if (!dropZone) return;

  dropZone.style.display = "none";
  document.getElementById("spinner")?.classList.add("visible");
  document.getElementById("resultCard")?.classList.remove("visible", "success", "error");

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    document.getElementById("spinner")?.classList.remove("visible");
    if (!res.ok) throw new Error((data as any).details || (data as any).error || (data as any).detail || "Unknown error");
    showResult((data as any).item || (data as any), file.name);
  } catch (err) {
    document.getElementById("spinner")?.classList.remove("visible");
    showError((err as Error).message, file.name);
  }
}

function showResult(item: Item, filename: string): void {
  currentItemId = item.id;
  document.getElementById("resultCard")?.classList.add("visible", "success");
  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("resultEmoji", "✅");
  setText("resultTitle", "Classified by AI!");
  setText("resultFile", filename || item.original || "");
  setText("resultStatus", item.status);
  setText("resultSummary", item.summary || "No summary.");
  setText("resultPillar", `${item.pillarId} – ${item.pillarName}`);
  setText("resultTopic", item.topicName || "—");
  setText("resultRationale", item.rationale || "");
  const pct = Math.round((item.confidence || 0) * 100);
  setText("resultConfidence", pct + "%");
  const bar = document.getElementById("resultConfBar") as HTMLElement | null;
  if (bar) bar.style.width = pct + "%";

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

  void checkHealth();
}

function showError(message: string, filename: string): void {
  document.getElementById("resultCard")?.classList.add("visible", "error");
  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("resultEmoji", "❌");
  setText("resultTitle", "Classification failed");
  setText("resultFile", filename);
  setText("resultSummary", message);
  (document.getElementById("resultTags") as HTMLElement | null)?.replaceChildren();
  setText("resultPillar", "—");
  setText("resultTopic", "—");
  setText("resultRationale", "");
  setText("resultConfidence", "—");
  const bar = document.getElementById("resultConfBar") as HTMLElement | null;
  if (bar) bar.style.width = "0%";
}

async function confirmClassification(): Promise<void> {
  if (!currentItemId) return;
  try {
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
        btn.textContent = "✅ Confirmed!";
        btn.disabled = true;
      }
      toast("Saved to vault! 🎉");
    }
  } catch (e) {
    toast("Error: " + (e as Error).message);
  }
}

function resetUpload(): void {
  if (dropZone) dropZone.style.display = "";
  document.getElementById("resultCard")?.classList.remove("visible", "success", "error");
  if (fileInput) fileInput.value = "";
  currentItemId = null;
}

// YouTube
async function submitYouTube(): Promise<void> {
  const input = document.getElementById("ytInput") as HTMLInputElement | null;
  const url = input?.value.trim() || "";
  if (!url) return toast("Cole um link do YouTube primeiro.");

  document.getElementById("spinnerYt")?.classList.add("visible");
  document.getElementById("resultCardYt")?.classList.remove("visible", "success", "error");

  try {
    const res = await fetch(`${API_BASE}/youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    document.getElementById("spinnerYt")?.classList.remove("visible");
    if (!res.ok) throw new Error((data as any).details || (data as any).error || "Erro desconhecido");
    showResultYt((data as any).item || (data as any), url);
  } catch (err) {
    document.getElementById("spinnerYt")?.classList.remove("visible");
    document.getElementById("resultCardYt")?.classList.add("visible", "error");
    const title = document.getElementById("resultTitleYt");
    const summary = document.getElementById("resultSummaryYt");
    if (title) title.textContent = "Erro";
    if (summary) summary.textContent = (err as Error).message;
  }
}

function showResultYt(item: Item, url: string): void {
  currentItemIdYt = item.id;
  document.getElementById("resultCardYt")?.classList.add("visible", "success");
  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("resultTitleYt", "Vídeo classificado!");
  setText("resultFileYt", url);
  setText("resultStatusYt", item.status);
  setText("resultSummaryYt", item.summary || "Sem resumo.");
  setText("resultPillarYt", `${item.pillarId} – ${item.pillarName}`);
  setText("resultTopicYt", item.topicName || "—");
  setText("resultRationaleYt", item.rationale || "");
  const pct = Math.round((item.confidence || 0) * 100);
  setText("resultConfidenceYt", pct + "%");
  const bar = document.getElementById("resultConfBarYt") as HTMLElement | null;
  if (bar) bar.style.width = pct + "%";

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

async function confirmClassificationYt(): Promise<void> {
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
        btn.textContent = "✅ Confirmed!";
        btn.disabled = true;
      }
      toast("Salvo no Vault! 🎉");
    }
  } catch (e) {
    toast("Erro: " + (e as Error).message);
  }
}

function resetYouTube(): void {
  const input = document.getElementById("ytInput") as HTMLInputElement | null;
  if (input) input.value = "";
  document.getElementById("resultCardYt")?.classList.remove("visible", "success", "error");
  currentItemIdYt = null;
}

// Vault
async function loadVault(): Promise<void> {
  const search = ((document.getElementById("vaultSearch") as HTMLInputElement | null)?.value || "").toLowerCase();
  const pillar = (document.getElementById("vaultPillar") as HTMLSelectElement | null)?.value || "";
  const status = (document.getElementById("vaultStatus") as HTMLSelectElement | null)?.value || "";

  let url = `${API_BASE}/vault?limit=100`;
  if (pillar) url += `&pillar=${pillar}`;
  if (status) url += `&status=${status}`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    let items: Item[] = Array.isArray(data) ? (data as Item[]) : ((data as any).items || []);
    if (search) {
      items = items.filter(
        (i) =>
          (i.original || "").toLowerCase().includes(search) ||
          (i.summary || "").toLowerCase().includes(search) ||
          (i.pillarName || "").toLowerCase().includes(search)
      );
    }

    const grid = document.getElementById("vaultGrid");
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = `<div class="empty-state"><div class="big">🗄</div><p>Nenhum item. Faça um upload!</p></div>`;
      return;
    }

    grid.innerHTML = items
      .map(
        (item) => {
          const fileHref = item.driveUrl || `${API_BASE}/items/${encodeURIComponent(item.id)}/file`;
          const hasFileLink = Boolean(item.driveUrl || item.driveFileId || item.filename);
          const filePill = hasFileLink
            ? `<a class="vault-pill" href="${fileHref}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Arquivo</a>`
            : "";

          return `
        <div class="vault-item">
          <div class="vault-item-header">
            <div style="display:flex;align-items:flex-start;gap:8px;flex:1;">
              <div class="status-dot dot-${item.status}" style="margin-top:5px;"></div>
              <div>
                <h4>${item.original || item.filename}</h4>
                <div class="vault-item-meta" style="margin-top:4px;">
                  <span class="vault-pill">${item.pillarId || "?"} – ${item.pillarName || "Unclassified"}</span>
                  ${item.topicName ? `<span class="vault-pill" style="background:rgba(0,212,180,.1);border-color:rgba(0,212,180,.2);color:#6ee7d4;">${item.topicName}</span>` : ""}
                  ${filePill}
                </div>
              </div>
            </div>
            <span style="font-size:11px;color:var(--muted);white-space:nowrap;">${(item.createdAt || "").slice(0, 10)}</span>
          </div>
          <div class="vault-item-summary">${item.summary || "Sem resumo."}</div>
          ${item.tags?.length ? `<div class="tags-row" style="margin-top:8px;">${item.tags
            .map((t) => `<span class="tag">${t}</span>`)
            .join("")}</div>` : ""}
        </div>`
        }
      )
      .join("");
  } catch (e) {
    const grid = document.getElementById("vaultGrid");
    if (grid) {
      grid.innerHTML = `<div class="empty-state"><p style="color:var(--danger);">Erro: ${(e as Error).message}</p></div>`;
    }
  }
}

// Taxonomy now comes from backend (/taxonomy/*)

// Expose for inline onclick handlers
const w = window as any;
w.switchTab = switchTab;
w.confirmClassification = confirmClassification;
w.resetUpload = resetUpload;
w.submitYouTube = submitYouTube;
w.confirmClassificationYt = confirmClassificationYt;
w.resetYouTube = resetYouTube;
w.loadVault = loadVault;

bindUpload();
void checkHealth();
void renderTaxonomy();
