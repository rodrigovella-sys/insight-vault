import { API_BASE } from "./config.js";
import { setStatus, toast } from "./ui.js";
import { initUpload, confirmClassification, resetUpload } from "./Upload/upload.js";
import { submitYouTube, confirmClassificationYt, resetYouTube, submitPlaylist, resetPlaylist } from "./YouTube/youtube.js";
import {
  loadVault,
  populatePillarDropdowns,
  updateTopicsDropdown,
  openEditModal,
  closeEditModal,
  saveReclassify
} from "./Vault/vault.js";
import { renderTaxonomy } from "./Taxonomy/taxonomy.js";

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
    setStatus(`Backend online · ${d.items} items · v${d.version}`, "ok");
  } catch {
    setStatus("Backend offline", "err");
  }
}

// Expose functions for inline onclick handlers
const w = window as any;
w.switchTab = switchTab;

w.confirmClassification = confirmClassification;
w.resetUpload = resetUpload;

w.submitYouTube = submitYouTube;
w.confirmClassificationYt = confirmClassificationYt;
w.resetYouTube = resetYouTube;

w.submitPlaylist = submitPlaylist;
w.resetPlaylist = resetPlaylist;

w.loadVault = loadVault;

w.updateTopicsDropdown = updateTopicsDropdown;
w.openEditModal = openEditModal;
w.closeEditModal = closeEditModal;
w.saveReclassify = saveReclassify;

w.toast = toast;

initUpload({ onAfterSuccess: () => void checkHealth() });
void checkHealth();
void populatePillarDropdowns();
void renderTaxonomy();
