const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Nav: draw the bottom rule once the page has scrolled off the top.
const nav = document.querySelector(".nav");
const sentinel = document.querySelector(".nav-sentinel");
if (nav && sentinel) {
  new IntersectionObserver(([entry]) => {
    nav.classList.toggle("is-stuck", !entry.isIntersecting);
  }).observe(sentinel);
}

// Reveal on scroll, once.
const revealer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      revealer.unobserve(entry.target);
    }
  },
  { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
);
for (const el of document.querySelectorAll("[data-reveal], [data-reveal-group]")) {
  revealer.observe(el);
}

// Example estimate. Mirrors SqFt's estimate math: a line's quantity is
// square feet x (1 + waste / 100), and its subtotal is quantity x rate, rounded to cents.
const calc = document.querySelector("[data-calc]");
if (calc) {
  const FLOORS = {
    lvp: { label: "LVP", rate: 4.85 },
    hardwood: { label: "Hardwood", rate: 8.9 },
    carpet: { label: "Carpet", rate: 3.6 },
  };
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const sqft = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const out = (key) => calc.querySelector(`[data-out="${key}"]`);

  const readFeet = (input) => {
    const raw = input.value.trim();
    const value = Number(raw);
    const valid = raw !== "" && Number.isFinite(value) && value >= 0 && value <= 999;
    if (valid) input.removeAttribute("aria-invalid");
    else input.setAttribute("aria-invalid", "true");
    return valid ? value : 0;
  };

  let shownTotal = 2347.4;
  let tween = 0;
  const showTotal = (target) => {
    const el = out("total");
    cancelAnimationFrame(tween);
    if (reduceMotion.matches || shownTotal === target) {
      shownTotal = target;
      el.textContent = money.format(target);
      return;
    }
    const from = shownTotal;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 420);
      const eased = 1 - (1 - t) ** 3;
      shownTotal = t === 1 ? target : from + (target - from) * eased;
      el.textContent = money.format(shownTotal);
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };

  const update = () => {
    let measured = 0;
    for (const row of calc.querySelectorAll("[data-room]")) {
      const area = readFeet(row.querySelector("[data-len]")) * readFeet(row.querySelector("[data-wid]"));
      row.querySelector("[data-area]").textContent = `${sqft.format(area)} ft²`;
      measured += area;
    }
    const floor = FLOORS[calc.elements.floor.value] ?? FLOORS.lvp;
    const waste = Number(calc.elements.waste.value) || 0;
    const qty = measured * (1 + waste / 100);

    out("measured").textContent = `${sqft.format(measured)} ft²`;
    out("order").textContent = `${sqft.format(qty)} ft²`;
    out("note").textContent = `Example rate: ${floor.label} at ${money.format(floor.rate)} per ft², installed. In SqFt you set your own.`;
    showTotal(round2(qty * floor.rate));
  };

  calc.addEventListener("input", update);
  calc.addEventListener("change", update);
  calc.addEventListener("submit", (event) => event.preventDefault());
  update();
}

// Lead form. Static site, no backend: validate, then hand a composed
// email to the visitor's mail app, addressed to admin@sqft.com.
const leadForm = document.querySelector("#lead-form");
if (leadForm) {
  const status = leadForm.querySelector("[data-status]");
  const fields = {
    name: { input: leadForm.elements.name, valid: (v) => v.length > 0 },
    email: { input: leadForm.elements.email, valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
  };

  const setError = (field, show) => {
    const error = document.getElementById(`${field.input.id}-error`);
    if (error) error.hidden = !show;
    if (show) field.input.setAttribute("aria-invalid", "true");
    else field.input.removeAttribute("aria-invalid");
  };

  for (const field of Object.values(fields)) {
    field.input.addEventListener("input", () => {
      if (field.input.hasAttribute("aria-invalid") && field.valid(field.input.value.trim())) {
        setError(field, false);
      }
    });
  }

  leadForm.addEventListener("submit", (event) => {
    event.preventDefault();

    let firstInvalid = null;
    for (const field of Object.values(fields)) {
      const ok = field.valid(field.input.value.trim());
      setError(field, !ok);
      if (!ok && !firstInvalid) firstInvalid = field.input;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const name = fields.name.input.value.trim();
    const email = fields.email.input.value.trim();
    const message = leadForm.elements.message.value.trim();

    const subject = `SqFt early access: ${name}`;
    const body = [`Name:  ${name}`, `Email: ${email}`, "", message].join("\n");

    status.textContent = "Opening your email app…";
    window.location.href =
      `mailto:admin@sqft.com?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  });
}
