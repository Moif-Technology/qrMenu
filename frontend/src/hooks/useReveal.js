import { useLayoutEffect } from "react";

export function useReveal() {
  useLayoutEffect(() => {
    const markVisible = () => {
      const vh = window.innerHeight;
      document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => {
        const { top, bottom } = el.getBoundingClientRect();
        if (top < vh + 400 && bottom > 0) el.classList.add("is-visible");
      });
    };
    markVisible();
    const raf = requestAnimationFrame(markVisible);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(markVisible));

    window.addEventListener("scroll", markVisible, { passive: true });

    const timer = setTimeout(() => {
      document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => el.classList.add("is-visible"));
    }, 600);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("is-visible"); observer.unobserve(e.target); }
        });
      },
      { threshold: 0, rootMargin: "0px 0px 400px 0px" }
    );
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => observer.observe(el));
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
      window.removeEventListener("scroll", markVisible);
      observer.disconnect();
    };
  }, []);
}
