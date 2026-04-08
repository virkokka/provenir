/**
 * Score badge injected into pages by the content script.
 *
 * Implemented as a plain Shadow DOM host rather than a registered custom
 * element — content scripts on some browsers (including Brave with certain
 * shield settings) can have a null customElements registry, which makes
 * customElements.define throw.  A raw div + attachShadow gives us the same
 * style isolation without touching the registry.
 */

const HOST_ID = "provenir-badge-host";

const STYLES = `
  :host {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .badge {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .pill:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .pill.green { background: #16a34a; }
  .pill.amber { background: #d97706; }
  .pill.red   { background: #dc2626; }
  .icon { font-size: 14px; line-height: 1; }
  .tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: #1e1e2e;
    color: #cdd6f4;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.6;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  .tooltip.visible { opacity: 1; transform: translateY(0); }
  .tooltip-title { font-weight: 700; margin-bottom: 6px; color: #fff; }
  .tooltip-row { display: flex; justify-content: space-between; gap: 12px; }
  .tooltip-label { opacity: 0.75; }
  .branding { font-size: 9px; opacity: 0.5; margin-top: 4px; color: #1e1e2e; }
`;

function colorClass(score: number): string {
  if (score >= 80) return "green";
  if (score >= 50) return "amber";
  return "red";
}

function icon(score: number): string {
  if (score >= 80) return "✓";
  if (score >= 50) return "~";
  return "!";
}

function label(score: number): string {
  if (score >= 80) return "Authentic";
  if (score >= 50) return "Uncertain";
  return "Suspicious";
}

/** Inject (or replace) the Provenir badge into document.body. */
export function injectScoreBadge(score: number): void {
  // Remove any stale badge from a previous navigation.
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.innerHTML = `
    <div class="tooltip" id="tip">
      <div class="tooltip-title">Provenir Score: ${score}/100</div>
      <div class="tooltip-row">
        <span class="tooltip-label">AI detection</span><span>included</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Plagiarism</span><span>included</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">C2PA provenance</span><span>included</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">Source registration</span><span>included</span>
      </div>
    </div>
    <div class="pill ${colorClass(score)}">
      <span class="icon">${icon(score)}</span>
      <span>${label(score)} · ${score}</span>
    </div>
    <span class="branding">Provenir</span>
  `;

  const tip = badge.querySelector<HTMLElement>("#tip")!;
  badge.addEventListener("mouseenter", () => tip.classList.add("visible"));
  badge.addEventListener("mouseleave", () => tip.classList.remove("visible"));

  shadow.appendChild(style);
  shadow.appendChild(badge);
  document.body.appendChild(host);
}
