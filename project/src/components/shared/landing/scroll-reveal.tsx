"use client"

import { useEffect } from "react"

// Marca como revelado cada [data-reveal] da landing quando ele entra na tela.
// Só esconde os elementos depois que o JS roda (classe motion-ready), então sem JS nada some.
export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing")
    if (!root) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute("data-revealed", "")
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    )

    root.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element))
    root.classList.add("motion-ready")
    return () => observer.disconnect()
  }, [])

  return null
}
