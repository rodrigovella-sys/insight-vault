import { API_BASE } from "../config.js";
import { toast } from "../ui.js";
import { getPillars, getTopics } from "../Taxonomy/taxonomyApi.js";

type Item = {
  id: string;
  filename?: string;
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
    ? '<option value="">Carregando...</option>'
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
  }
}

export async function loadVault(): Promise<void> {
  const searchRaw = ((document.getElementById("vaultSearch") as HTMLInputElement | null)?.value || "").trim();
  const search = searchRaw.toLowerCase();
  const pillar = (document.getElementById("vaultPillar") as HTMLSelectElement | null)?.value || "";
  const status = (document.getElementById("vaultStatus") as HTMLSelectElement | null)?.value || "";

  let url = `${API_BASE}/vault?limit=100`;
  if (pillar) url += `&pillar=${encodeURIComponent(pillar)}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (searchRaw) url += `&search=${encodeURIComponent(searchRaw)}`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    let items: Item[] = Array.isArray(data) ? (data as Item[]) : ((data as any).items || []);

    if (search) {
      items = items.filter(
        (i) =>
          (i.original || "").toLowerCase().includes(search) ||
          (i.summary || "").toLowerCase().includes(search) ||
          (i.pillarName || "").toLowerCase().includes(search) ||
          (i.topicName || "").toLowerCase().includes(search)
      );
    }

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

        const itemJson = JSON.stringify(item).replace(/'/g, "\\'");

        return `<div class="vault-item" onclick='openEditModal(${itemJson})'><div class="vault-item-header"><div style="display:flex;align-items:flex-start;gap:8px;flex:1"><div class="status-dot-item dot-${item.status}" style="margin-top:5px"></div><div><h4>${original}</h4><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="vault-pill">${pillarId} – ${pillarName}</span>${topicName ? `<span class="vault-pill" style="background:rgba(0,212,180,.1);border-color:rgba(0,212,180,.2);color:#6ee7d4">${topicName}</span>` : ""}</div></div></div><span class="edit-icon">✏️</span></div><div class="vault-item-summary">${summary}</div></div>`;
      })
      .join("");
  } catch (e) {
    const grid = document.getElementById("vaultGrid");
    if (grid) {
      grid.innerHTML = `<div class="empty-state"><p style="color:#ff6b6b">Erro: ${(e as Error).message}</p></div>`;
    }
  }
}
