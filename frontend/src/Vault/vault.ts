import { API_BASE } from "../config.js";
import { toast, showBlocking, hideBlocking } from "../ui.js";
import { getPillars, getTopics } from "../Taxonomy/taxonomyApi.js";

type Item = {
  id: string;
  filename?: string;
  driveFileId?: string;
  driveUrl?: string;
  youtubeUrl?: string;
  original?: string;
  summary?: string;
  contextText?: string;
  pillarId?: string;
  pillarName?: string;
  topicId?: string;
  topicName?: string;
  status?: string;
  createdAt?: string;
};

let currentEditItem: Item | null = null;

let taxonomyChangedBound = false;

let vaultPage = 1;
let vaultPageSize = 20;
let vaultLastQueryKey = "";
let vaultLastTotal = 0;
let vaultLastMaxPage = 1;

function syncVaultPageSizeSelects(): void {
  const top = document.getElementById("vaultPageSizeTop") as HTMLSelectElement | null;
  const bottom = document.getElementById("vaultPageSizeBottom") as HTMLSelectElement | null;
  const val = String(vaultPageSize);
  if (top && top.value !== val) top.value = val;
  if (bottom && bottom.value !== val) bottom.value = val;
}

function updateVaultPagerUI(total: number): void {
  const maxPage = Math.max(1, Math.ceil(total / Math.max(1, vaultPageSize)));
  vaultLastMaxPage = maxPage;
  const safePage = Math.max(1, Math.min(maxPage, vaultPage));
  vaultPage = safePage;

  const info = `Página ${safePage}/${maxPage} · ${total} itens`;

  const infoTop = document.getElementById("vaultPageInfoTop");
  const infoBottom = document.getElementById("vaultPageInfoBottom");
  if (infoTop) infoTop.textContent = info;
  if (infoBottom) infoBottom.textContent = info;

  const prevDisabled = safePage <= 1;
  const nextDisabled = safePage >= maxPage;

  const pageInputTop = document.getElementById("vaultPageInputTop") as HTMLInputElement | null;
  const pageInputBottom = document.getElementById("vaultPageInputBottom") as HTMLInputElement | null;
  if (pageInputTop) {
    pageInputTop.value = String(safePage);
    pageInputTop.max = String(maxPage);
  }
  if (pageInputBottom) {
    pageInputBottom.value = String(safePage);
    pageInputBottom.max = String(maxPage);
  }

  const firstDisabled = safePage <= 1;
  const lastDisabled = safePage >= maxPage;

  const prevTop = document.getElementById("vaultPrevTop") as HTMLButtonElement | null;
  const prevBottom = document.getElementById("vaultPrevBottom") as HTMLButtonElement | null;
  const nextTop = document.getElementById("vaultNextTop") as HTMLButtonElement | null;
  const nextBottom = document.getElementById("vaultNextBottom") as HTMLButtonElement | null;
  const firstTop = document.getElementById("vaultFirstTop") as HTMLButtonElement | null;
  const firstBottom = document.getElementById("vaultFirstBottom") as HTMLButtonElement | null;
  const lastTop = document.getElementById("vaultLastTop") as HTMLButtonElement | null;
  const lastBottom = document.getElementById("vaultLastBottom") as HTMLButtonElement | null;
  if (firstTop) firstTop.disabled = firstDisabled;
  if (firstBottom) firstBottom.disabled = firstDisabled;
  if (prevTop) prevTop.disabled = prevDisabled;
  if (prevBottom) prevBottom.disabled = prevDisabled;
  if (nextTop) nextTop.disabled = nextDisabled;
  if (nextBottom) nextBottom.disabled = nextDisabled;
  if (lastTop) lastTop.disabled = lastDisabled;
  if (lastBottom) lastBottom.disabled = lastDisabled;
}

export function vaultFirstPage(): void {
  vaultPage = 1;
  void loadVault();
}

export function vaultLastPage(): void {
  const maxPage = Math.max(1, vaultLastMaxPage || Math.ceil(vaultLastTotal / Math.max(1, vaultPageSize)));
  vaultPage = maxPage;
  void loadVault();
}

export function vaultGoToPage(value: string | number): void {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return;
  const maxPage = Math.max(1, vaultLastMaxPage || Math.ceil(vaultLastTotal / Math.max(1, vaultPageSize)));
  vaultPage = Math.max(1, Math.min(maxPage, n));
  void loadVault();
}

export function vaultPrevPage(): void {
  if (vaultPage <= 1) return;
  vaultPage -= 1;
  void loadVault();
}

export function vaultNextPage(): void {
  const maxPage = Math.max(1, vaultLastMaxPage || Math.ceil(vaultLastTotal / Math.max(1, vaultPageSize)));
  if (vaultPage >= maxPage) return;
  vaultPage += 1;
  void loadVault();
}

export function vaultSetPageSize(value: string | number): void {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return;

  vaultPageSize = Math.max(1, Math.min(200, n));
  vaultPage = 1;
  syncVaultPageSizeSelects();
  void loadVault();
}

export async function openItemFile(id: string): Promise<void> {
  let timeoutHandle: number | undefined;
  const canAbort = typeof (window as any).AbortController !== "undefined";
  const controller = canAbort ? new AbortController() : null;
  try {
    showBlocking("Abrindo…");
    timeoutHandle = window.setTimeout(() => controller?.abort(), 15000);
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}/file?resolve=1`, {
      signal: controller?.signal,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({} as any));
    const url = (data as any)?.url as string | undefined;
    if (!res.ok || !url) {
      toast("Arquivo não encontrado");
      return;
    }

    const finalUrl = /^https?:\/\//i.test(url)
      ? url
      : `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;

    window.open(finalUrl, "_blank", "noopener,noreferrer");
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      toast("Tempo esgotado ao abrir arquivo");
    } else {
      toast("Arquivo não encontrado");
    }
  } finally {
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
    hideBlocking();
  }
}

async function refreshPillarDropdownsPreserveSelection(): Promise<void> {
  const editPillar = document.getElementById("editPillar") as HTMLSelectElement | null;
  const vaultPillar = document.getElementById("vaultPillar") as HTMLSelectElement | null;
  if (!editPillar || !vaultPillar) return;

  const selectedEdit = editPillar.value;
  const selectedVault = vaultPillar.value;

  editPillar.innerHTML = '<option value="">Selecione...</option>';
  vaultPillar.innerHTML = '<option value="">Todos</option>';

  const pillars = await getPillars();
  pillars.forEach((p) => {
    const o1 = document.createElement("option");
    o1.value = p.id;
    o1.textContent = `${p.id} – ${p.namePt}`;
    editPillar.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = p.id;
    o2.textContent = `${p.id} – ${p.namePt}`;
    vaultPillar.appendChild(o2);
  });

  if (selectedEdit) editPillar.value = selectedEdit;
  if (selectedVault) vaultPillar.value = selectedVault;

  // Keep the vault topic dropdown in sync with the selected pillar.
  await updateVaultTopicsDropdown();
}

function bindTaxonomyChangedListener(): void {
  if (taxonomyChangedBound) return;
  taxonomyChangedBound = true;

  window.addEventListener('taxonomy:changed', async (ev: Event) => {
    const detail = (ev as CustomEvent)?.detail as { pillarId?: string; topic?: { id?: string; name?: string } };
    const pillarId = detail?.pillarId;
    if (!pillarId) return;

    // Refresh pillar dropdowns (preserving selection) in case taxonomy changes over time.
    try {
      await refreshPillarDropdownsPreserveSelection();
    } catch {
      // ignore
    }

    const modalVisible = document.getElementById('editModal')?.classList.contains('visible');
    const editPillar = document.getElementById('editPillar') as HTMLSelectElement | null;
    const editTopic = document.getElementById('editTopic') as HTMLSelectElement | null;
    if (!modalVisible || !editPillar || !editTopic) return;

    if (editPillar.value !== pillarId) return;

    const previousTopicId = editTopic.value;
    await updateTopicsDropdown();

    const createdTopicId = detail?.topic?.id || '';
    if (!previousTopicId && createdTopicId) {
      editTopic.value = createdTopicId;
      return;
    }
    editTopic.value = previousTopicId;
  });
}

export async function populatePillarDropdowns(): Promise<void> {
  const editPillar = document.getElementById("editPillar") as HTMLSelectElement | null;
  const vaultPillar = document.getElementById("vaultPillar") as HTMLSelectElement | null;
  if (!editPillar || !vaultPillar) return;

  bindTaxonomyChangedListener();

  try {
    await refreshPillarDropdownsPreserveSelection();
  } catch {
    // Keep the UI usable even if taxonomy fetch fails.
  }
}

async function topicIdFromName(pillarId?: string, topicName?: string): Promise<string> {
  if (!pillarId || !topicName) return "";
  try {
    const topics = await getTopics(pillarId);
    return topics.find((t) => t.name === topicName)?.id || "";
  } catch {
    return "";
  }
}

export async function updateTopicsDropdown(): Promise<void> {
  const pid = (document.getElementById("editPillar") as HTMLSelectElement | null)?.value;
  const tSel = document.getElementById("editTopic") as HTMLSelectElement | null;
  if (!tSel) return;

  tSel.innerHTML = pid
    ? '<option value="">…</option>'
    : '<option value="">Selecione...</option>';
  if (!pid) return;

  try {
    const topics = await getTopics(pid);
    tSel.innerHTML = '<option value="">Selecione...</option>';

    topics.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      tSel.appendChild(o);
    });
  } catch {
    tSel.innerHTML = '<option value="">Erro ao carregar tópicos</option>';
  }
}

export async function updateVaultTopicsDropdown(): Promise<void> {
  const pid = (document.getElementById("vaultPillar") as HTMLSelectElement | null)?.value || "";
  const tSel = document.getElementById("vaultTopic") as HTMLSelectElement | null;
  if (!tSel) return;

  const previous = tSel.value;

  if (!pid) {
    tSel.innerHTML = '<option value="">Todos os tópicos</option>';
    tSel.value = "";
    tSel.disabled = true;
    return;
  }

  tSel.disabled = false;
  tSel.innerHTML = '<option value="">…</option>';

  try {
    const topics = await getTopics(pid);
    tSel.innerHTML = '<option value="">Todos os tópicos</option>';
    topics.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      tSel.appendChild(o);
    });

    if (previous && topics.some((t) => t.id === previous)) {
      tSel.value = previous;
    } else {
      tSel.value = "";
    }
  } catch {
    tSel.innerHTML = '<option value="">Erro ao carregar tópicos</option>';
    tSel.value = "";
  }
}

export async function openEditModal(item: Item): Promise<void> {
  currentEditItem = item;

  const name = document.getElementById("editItemName");
  if (name) name.textContent = item.original || item.filename || "";

  const editPillar = document.getElementById("editPillar") as HTMLSelectElement | null;
  if (editPillar) editPillar.value = item.pillarId || "";

  await updateTopicsDropdown();

  const topicId = item.topicId || (await topicIdFromName(item.pillarId, item.topicName));
  const editTopic = document.getElementById("editTopic") as HTMLSelectElement | null;
  if (editTopic) editTopic.value = topicId || "";

  document.getElementById("editModal")?.classList.add("visible");
}

export function closeEditModal(): void {
  document.getElementById("editModal")?.classList.remove("visible");
  currentEditItem = null;
}

export async function saveReclassify(): Promise<void> {
  const pid = (document.getElementById("editPillar") as HTMLSelectElement | null)?.value;
  const tid = (document.getElementById("editTopic") as HTMLSelectElement | null)?.value;

  if (!pid || !tid) return toast("Selecione pilar e tópico");
  if (!currentEditItem) return;

  try {
    showBlocking("Reclassificando…");
    const res = await fetch(`${API_BASE}/items/${currentEditItem.id}/reclassify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pillarId: pid, topicId: tid })
    });
    const d = await res.json().catch(() => ({}));

    if ((d as any).id) {
      toast("Reclassificado! ✅");
      closeEditModal();
      await loadVault();
    } else {
      toast("Erro: " + ((d as any).error || "desconhecido"));
    }
  } catch (e) {
    toast("Erro: " + (e as Error).message);
  } finally {
    hideBlocking();
  }
}

export async function loadVault(): Promise<void> {
  const searchRaw = ((document.getElementById("vaultSearch") as HTMLInputElement | null)?.value || "").trim();
  const pillar = (document.getElementById("vaultPillar") as HTMLSelectElement | null)?.value || "";
  const topicId = (document.getElementById("vaultTopic") as HTMLSelectElement | null)?.value || "";
  const status = (document.getElementById("vaultStatus") as HTMLSelectElement | null)?.value || "";

  const queryKey = JSON.stringify({ searchRaw, pillar, topicId, status });
  if (queryKey !== vaultLastQueryKey) {
    vaultLastQueryKey = queryKey;
    vaultPage = 1;
  }

  syncVaultPageSizeSelects();

  const offset = (Math.max(1, vaultPage) - 1) * Math.max(1, vaultPageSize);

  let url = `${API_BASE}/vault?limit=${encodeURIComponent(String(vaultPageSize))}&offset=${encodeURIComponent(String(offset))}`;
  if (pillar) url += `&pillar=${encodeURIComponent(pillar)}`;
  if (topicId) url += `&topicId=${encodeURIComponent(topicId)}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (searchRaw) url += `&search=${encodeURIComponent(searchRaw)}`;

  showBlocking();
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    const isArray = Array.isArray(data);
    const items: Item[] = isArray ? (data as Item[]) : (((data as any).items as Item[]) || []);
    const total = isArray ? items.length : (Number((data as any).total) || 0);

    vaultLastTotal = total;

    const maxPage = Math.max(1, Math.ceil(total / Math.max(1, vaultPageSize)));
    if (total > 0 && vaultPage > maxPage) {
      vaultPage = maxPage;
      await loadVault();
      return;
    }

    updateVaultPagerUI(total);

    const grid = document.getElementById("vaultGrid");
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = '<div class="empty-state"><div class="big">🗄</div><p>Nenhum item</p></div>';
      return;
    }

    grid.innerHTML = items
      .map((item) => {
        const original = item.original || item.filename || "(sem título)";
        const summary = item.summary || item.contextText || "Sem resumo";
        const pillarId = item.pillarId || "?";
        const pillarName = item.pillarName || "Sem classe";
        const topicName = item.topicName || "";

        const hasFileLink = Boolean(item.driveUrl || item.driveFileId || item.filename || item.youtubeUrl);
        const filePill = hasFileLink
          ? `<a class="vault-pill" href="#" rel="noopener noreferrer" style="text-decoration:none" onclick="event.stopPropagation(); openItemFile('${item.id}'); return false;">Arquivo</a>`
          : "";

        const itemJson = JSON.stringify(item).replace(/'/g, "\\'");

        return `<div class="vault-item" onclick='openEditModal(${itemJson})'><div class="vault-item-header"><div style="display:flex;align-items:flex-start;gap:8px;flex:1"><div class="status-dot-item dot-${item.status}" style="margin-top:5px"></div><div><h4>${original}</h4><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="vault-pill">${pillarId} – ${pillarName}</span>${topicName ? `<span class="vault-pill" style="background:rgba(0,212,180,.1);border-color:rgba(0,212,180,.2);color:#6ee7d4">${topicName}</span>` : ""}${filePill}</div></div></div><span class="edit-icon">✏️</span></div><div class="vault-item-summary">${summary}</div></div>`;
      })
      .join("");
  } catch (e) {
    const grid = document.getElementById("vaultGrid");
    if (grid) {
      grid.innerHTML = `<div class="empty-state"><p style="color:#ff6b6b">Erro: ${(e as Error).message}</p></div>`;
    }
  } finally {
    hideBlocking();
  }
}
