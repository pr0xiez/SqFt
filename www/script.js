// ─────────────────────  SCROLL REVEAL  ──────────────────────
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

// ───────────────────────  LEADS FORM  ───────────────────────
// Static site, no backend — compose a mail to admin@sqft.com from the
// fields and hand off to the visitor's email client.
const leadForm = document.querySelector("#lead-form");
if (leadForm) {
  leadForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(leadForm);
    const name = (data.get("name") || "").toString().trim();
    const email = (data.get("email") || "").toString().trim();
    const message = (data.get("message") || "").toString().trim();

    const subject = `SqFt — early access${name ? ` (${name})` : ""}`;
    const body = [
      `Name:  ${name}`,
      `Email: ${email}`,
      "",
      message,
    ].join("\n");

    const note = leadForm.querySelector(".submit-row .note");
    if (note) note.textContent = "Opening your email app…";

    window.location.href =
      `mailto:admin@sqft.com?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  });
}
