import { API_BASE } from "./config.js";
import { setIndicator, setStatus, toast, showBlocking, hideBlocking } from "./ui.js";
import { initUpload, confirmClassification, resetUpload } from "./Upload/upload.js";
import { submitYouTube, confirmClassificationYt, resetYouTube, submitPlaylist, resetPlaylist } from "./YouTube/youtube.js";
import {
  loadVault,
  vaultFirstPage,
  vaultLastPage,
  vaultGoToPage,
  vaultPrevPage,
  vaultNextPage,
  vaultSetPageSize,
  populatePillarDropdowns,
  updateTopicsDropdown,
  updateVaultTopicsDropdown,
  openEditModal,
  closeEditModal,
  saveReclassify,
  openItemFile
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

    setIndicator(
      "postgresDot",
      "postgresText",
      `DB: ${d.db || "postgres"}`,
      "ok"
    );

    const driveEnabled = Boolean(d.driveEnabled ?? d.drive === "enabled");
    setIndicator(
      "driveDot",
      "driveText",
      driveEnabled ? "Upload: Google Drive" : "Upload: Local",
      driveEnabled ? "ok" : "err"
    );

    const openaiEnabled = Boolean(d.openaiEnabled);
    setIndicator(
      "openaiDot",
      "openaiText",
      openaiEnabled ? "OpenAI: online" : "OpenAI: offline",
      openaiEnabled ? "ok" : "err"
    );

    const youtubeEnabled = Boolean(d.youtubeEnabled);
    setIndicator(
      "youtubeDot",
      "youtubeText",
      youtubeEnabled ? "YouTube: online" : "YouTube: offline",
      youtubeEnabled ? "ok" : "err"
    );
  } catch {
    setStatus("Backend offline", "err");
    setIndicator("postgresDot", "postgresText", "DB: —", "err");
    setIndicator("driveDot", "driveText", "Upload: —", "loading");
    setIndicator("openaiDot", "openaiText", "OpenAI: —", "loading");
    setIndicator("youtubeDot", "youtubeText", "YouTube: —", "loading");
  }
}

// Expose functions for inline onclick handlers
const w = window as any;
w.switchTab = switchTab;

w.viewVaultForLastPlaylist = () => {
  const playlistId = String(localStorage.getItem("lastPlaylistId") || "").trim();
  const vaultSearch = document.getElementById("vaultSearch") as HTMLInputElement | null;
  if (vaultSearch && playlistId) {
    vaultSearch.value = playlistId;
  }

  const tabs = document.querySelectorAll(".tab");
  const vaultTab = (tabs?.[2] as HTMLElement | undefined) || null;
  if (vaultTab) {
    switchTab("vault", vaultTab);
  }
};

w.confirmClassification = confirmClassification;
w.resetUpload = resetUpload;

w.submitYouTube = submitYouTube;
w.confirmClassificationYt = confirmClassificationYt;
w.resetYouTube = resetYouTube;

w.submitPlaylist = submitPlaylist;
w.resetPlaylist = resetPlaylist;

w.loadVault = loadVault;
w.vaultFirstPage = vaultFirstPage;
w.vaultLastPage = vaultLastPage;
w.vaultGoToPage = vaultGoToPage;
w.vaultPrevPage = vaultPrevPage;
w.vaultNextPage = vaultNextPage;
w.vaultSetPageSize = vaultSetPageSize;

w.updateTopicsDropdown = updateTopicsDropdown;
w.updateVaultTopicsDropdown = updateVaultTopicsDropdown;
w.openEditModal = openEditModal;
w.openItemFile = openItemFile;
w.closeEditModal = closeEditModal;
w.saveReclassify = saveReclassify;

w.toast = toast;

initUpload({ onAfterSuccess: () => void checkHealth() });

async function bootstrap(): Promise<void> {
  showBlocking();
  try {
    await checkHealth();
    await populatePillarDropdowns();
    await renderTaxonomy();
  } finally {
    hideBlocking();
  }
}

void bootstrap();
