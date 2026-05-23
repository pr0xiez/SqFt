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
