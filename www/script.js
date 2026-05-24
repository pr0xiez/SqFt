const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
);

for (const n of document.querySelectorAll(".reveal")) io.observe(n);

const strip = document.querySelector(".stamp-strip .track");
if (strip) {
  strip.addEventListener(
    "mouseenter",
    () => (strip.style.animationPlayState = "paused")
  );
  strip.addEventListener(
    "mouseleave",
    () => (strip.style.animationPlayState = "running")
  );
}

// ─────────────────────  MOBILE NAV  ─────────────────────
(function initMobileNav() {
  const topInner = document.querySelector(".top-inner");
  if (!topInner) return;

  const path = location.pathname.replace(/\/index\.html$/, "/");
  const isActive = (href) => {
    if (href === "/") return path === "/" || path === "";
    return path.startsWith(href.replace(/\.html$/, ""));
  };

  const links = [
    { href: "/", label: "The Loop", num: "01" },
    { href: "/tooling", label: "Tooling", num: "02" },
    { href: "/pricing", label: "Pricing", num: "03" },
    { href: "/contact", label: "Contact", num: "04" },
  ];

  const toggle = document.createElement("button");
  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "mobile-nav");
  toggle.innerHTML =
    '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
  topInner.appendChild(toggle);

  const arrow =
    '<svg class="arr" viewBox="0 0 26 10" aria-hidden="true"><path d="M0 5 H24 M20 1 L24 5 L20 9"/></svg>';

  const linksHtml = links
    .map(
      (l) => `
      <a href="${l.href}"${isActive(l.href) ? ' class="active" aria-current="page"' : ""}>
        <span class="num">${l.num}</span>
        <span class="lbl">${l.label}</span>
        ${arrow}
      </a>`
    )
    .join("");

  const sheet = document.createElement("div");
  sheet.className = "mobile-nav";
  sheet.id = "mobile-nav";
  sheet.setAttribute("aria-hidden", "true");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Site navigation");
  sheet.innerHTML = `
    <div class="mn-inner">
      <div class="mn-head">
        <a href="/" class="brand">
          <span>SqFt</span>
          <span class="unit">The Flooring Solution</span>
        </a>
        <button class="mn-close" type="button" aria-label="Close menu">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4 L20 20 M20 4 L4 20"/></svg>
        </button>
      </div>
      <div class="mn-meta">MENU <span class="dot"></span> SHEET A-0 <span class="dot"></span> ISSUED 2026</div>
      <nav class="mn-links" aria-label="Primary">${linksHtml}</nav>
      <div class="mn-foot">
        <a href="#" class="signin">Sign in</a>
        <a href="/pricing" class="btn">
          Start measuring
          <svg class="arr" viewBox="0 0 18 8" aria-hidden="true"><path d="M0 4 H17 M13 1 L17 4 L13 7" stroke="currentColor" fill="none" stroke-width="1.2"/></svg>
        </a>
        <div class="mn-stamp">
          <span class="pip"></span>FILE: NAV-2026-001 &nbsp;·&nbsp; APPROVED FOR ISSUE<span class="pip"></span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  const closeBtn = sheet.querySelector(".mn-close");

  function open() {
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    document.body.classList.add("mn-open");
  }
  function shut() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("mn-open");
  }

  toggle.addEventListener("click", () => {
    sheet.classList.contains("open") ? shut() : open();
  });
  closeBtn.addEventListener("click", shut);
  sheet.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      // close so back-navigation feels right
      shut();
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet.classList.contains("open")) shut();
  });
  // close if viewport grows past breakpoint while open
  const mql = window.matchMedia("(min-width: 1025px)");
  mql.addEventListener("change", (ev) => {
    if (ev.matches) shut();
  });
})();
