import { converters } from "./converters.js";

const grid = document.querySelector("[data-tool-grid]");
const form = document.querySelector("[data-tool-search]");
const queryInput = document.querySelector("#tool-query");
const emptyState = document.querySelector("[data-empty-state]");
const year = document.querySelector("[data-current-year]");

function cardMarkup(tool) {
  return `
    <a class="tool-card" href="/${tool.slug}/" data-tool-card>
      <strong>${tool.title}</strong>
      <span>${tool.description}</span>
    </a>`;
}

function renderTools(query = "") {
  if (!grid) return;
  const normalized = query.trim().toLowerCase();
  const matches = converters.filter((tool) => {
    if (!normalized) return true;
    return `${tool.title} ${tool.description} ${tool.category}`.toLowerCase().includes(normalized);
  });

  grid.innerHTML = matches.map(cardMarkup).join("");
  if (emptyState) emptyState.hidden = matches.length !== 0;
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  renderTools(queryInput?.value ?? "");
});

queryInput?.addEventListener("input", () => renderTools(queryInput.value));

if (year) year.textContent = String(new Date().getFullYear());
renderTools();
