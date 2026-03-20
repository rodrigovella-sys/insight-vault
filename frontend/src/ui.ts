export function toast(message: string, durationMs = 3000): void {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), durationMs);
}

let blockingCount = 0;

function ensureBlockingOverlay(): HTMLElement {
  let el = document.getElementById("blockingOverlay") as HTMLElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = "blockingOverlay";
  el.className = "blocking-overlay";
  el.innerHTML = `
    <div class="blocking-card" role="dialog" aria-modal="true">
      <div class="spinner-ring" aria-hidden="true"></div>
      <div id="blockingText" class="blocking-text">Aguarde…</div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

export function showBlocking(message = "Aguarde…"): void {
  blockingCount += 1;
  const el = ensureBlockingOverlay();
  const txt = document.getElementById("blockingText");
  if (txt) txt.textContent = message;
  el.classList.add("visible");
}

export function hideBlocking(): void {
  blockingCount = Math.max(0, blockingCount - 1);
  if (blockingCount !== 0) return;
  const el = document.getElementById("blockingOverlay");
  if (el) el.classList.remove("visible");
}

export async function withBlocking<T>(fn: () => Promise<T>, message = "Aguarde…"): Promise<T> {
  showBlocking(message);
  try {
    return await fn();
  } finally {
    hideBlocking();
  }
}

export function setStatus(message: string, type: "ok" | "err" | "loading" = "ok"): void {
  const bar = document.getElementById("statusBar");
  const txt = document.getElementById("statusText");
  if (!bar || !txt) return;

  const dot = document.getElementById("backendDot") as HTMLElement | null
    ?? bar.querySelector<HTMLElement>(".status-dot, .status-dot-sm");
  if (dot) {
    const base = dot.classList.contains("status-dot-sm") ? "status-dot-sm" : "status-dot";
    dot.className = base;
    dot.classList.add(type === "ok" ? "dot-ok" : type === "err" ? "dot-err" : "dot-loading");
  }

  txt.textContent = message;
}

export function setIndicator(
  dotId: string,
  textId: string,
  message: string,
  type: "ok" | "err" | "loading" = "ok"
): void {
  const dot = document.getElementById(dotId);
  const txt = document.getElementById(textId);
  if (!dot || !txt) return;

  dot.className = "status-dot";
  dot.classList.add(type === "ok" ? "dot-ok" : type === "err" ? "dot-err" : "dot-loading");
  txt.textContent = message;
}
