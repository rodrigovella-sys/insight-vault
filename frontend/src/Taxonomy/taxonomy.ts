import { createTopic, getPillars, getTopics } from "./taxonomyApi.js";

export async function renderTaxonomy(): Promise<void> {
  const grid = document.getElementById("taxonomyGrid");
  if (!grid) return;

  if (!grid.dataset.bound) {
    grid.dataset.bound = "1";

    grid.addEventListener("click", async (ev) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      const addBtn = target.closest("button[data-action='add-topic']") as HTMLButtonElement | null;
      if (addBtn) {
        const pillarId = addBtn.dataset.pillarId || "";
        const form = grid.querySelector(`form[data-pillar-id='${CSS.escape(pillarId)}']`) as HTMLFormElement | null;
        if (!form) return;

        // Hide any other open forms.
        grid.querySelectorAll('form[data-pillar-id]').forEach((f) => {
          if (f !== form) (f as HTMLFormElement).hidden = true;
        });

        // Toggle the current form.
        form.hidden = !form.hidden;
        if (!form.hidden) {
          const input = form.querySelector("input[name='topicName']") as HTMLInputElement | null;
          input?.focus();
        }
        return;
      }

      const cancelBtn = target.closest("button[data-action='cancel-topic']") as HTMLButtonElement | null;
      if (cancelBtn) {
        const pillarId = cancelBtn.dataset.pillarId || "";
        const form = grid.querySelector(`form[data-pillar-id='${CSS.escape(pillarId)}']`) as HTMLFormElement | null;
        if (!form) return;
        form.hidden = true;
        const input = form.querySelector("input[name='topicName']") as HTMLInputElement | null;
        if (input) input.value = "";
        const err = form.querySelector("[data-role='error']") as HTMLElement | null;
        if (err) err.textContent = "";
        return;
      }
    });

    grid.addEventListener("submit", async (ev) => {
      const form = ev.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      if (!form.dataset.pillarId) return;

      ev.preventDefault();
      const pillarId = form.dataset.pillarId;
      const input = form.querySelector("input[name='topicName']") as HTMLInputElement | null;
      const err = form.querySelector("[data-role='error']") as HTMLElement | null;
      const saveBtn = form.querySelector("button[type='submit']") as HTMLButtonElement | null;

      const name = (input?.value || "").trim();
      if (err) err.textContent = "";
      if (!name) {
        if (err) err.textContent = "Informe o nome do tópico.";
        input?.focus();
        return;
      }

      if (saveBtn) saveBtn.disabled = true;
      try {
        await createTopic(pillarId, name);
        if (input) input.value = "";
        form.hidden = true;
        await renderTaxonomy();
      } catch (e) {
        if (err) err.textContent = (e as Error).message;
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  grid.innerHTML = '<div class="empty-state"><div class="big">🗂</div><p>Carregando taxonomia...</p></div>';

  try {
    const pillars = await getPillars();
    const withTopics = await Promise.all(
      pillars.map(async (p) => ({
        pillar: p,
        topics: await getTopics(p.id)
      }))
    );

    grid.innerHTML = withTopics
      .map(({ pillar, topics }) => {
        const tags = topics.map((t) => `<span class="topic-tag">${t.name}</span>`).join("");
        return `
          <div class="pillar-card">
            <div class="pillar-head">
              <h4>${pillar.namePt}<br><span style="font-size:11px;color:var(--muted);font-weight:400">${pillar.nameEn}</span></h4>
              <div style="display:flex; gap:8px; align-items:center">
                <button type="button" class="btn" data-action="add-topic" data-pillar-id="${pillar.id}">+ tópico</button>
                <span class="pillar-num">${pillar.id}</span>
              </div>
            </div>
            <form data-pillar-id="${pillar.id}" class="topic-form" style="margin-top:10px; gap:8px; flex-wrap:wrap; padding:0 16px 16px" hidden>
              <input name="topicName" class="topic-input" placeholder="Novo tópico" autocomplete="off" />
              <button type="submit" class="btn">Salvar</button>
              <button type="button" class="btn" data-action="cancel-topic" data-pillar-id="${pillar.id}">Cancelar</button>
              <div data-role="error" style="color:var(--danger); font-size:12px; flex-basis:100%"></div>
            </form>
            <div class="pillar-topics">${tags}</div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><p>${(e as Error).message}</p></div>`;
  }
}
