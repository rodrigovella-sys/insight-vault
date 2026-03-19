export function toast(message: string, durationMs = 3000): void {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), durationMs);
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
