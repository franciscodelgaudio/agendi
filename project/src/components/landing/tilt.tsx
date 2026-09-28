"use client"

import { useRef, type ComponentProps, type PointerEvent } from "react"

// Publica a posição do mouse (--mx/--my, de -1 a 1) para os filhos .ld-tilt e .ld-parallax seguirem.
// Só reage a mouse e fica parado com prefers-reduced-motion.
export function Tilt({ onPointerMove, onPointerLeave, ...props }: ComponentProps<"div">) {
  const frame = useRef(0)

  function move(event: PointerEvent<HTMLDivElement>) {
    onPointerMove?.(event)
    if (event.pointerType !== "mouse") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      element.style.setProperty("--mx", x.toFixed(3))
      element.style.setProperty("--my", y.toFixed(3))
    })
  }

  function leave(event: PointerEvent<HTMLDivElement>) {
    onPointerLeave?.(event)
    const element = event.currentTarget
    cancelAnimationFrame(frame.current)
    element.style.removeProperty("--mx")
    element.style.removeProperty("--my")
  }

  return <div onPointerMove={move} onPointerLeave={leave} {...props} />
}
