"use client"

const inputClass =
  "w-full rounded-[6px] border border-white/15 bg-white/5 px-3.5 py-2.5 text-[15px] text-white placeholder:text-ld-mist/70 focus-visible:border-ld-sage-light focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ld-sage-light"

export function ContactForm() {
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-4 rounded-xl border border-white/15 bg-white/5 p-6 min-[900px]:p-8"
    >
      <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ld-mist">
          Nome
          <input name="name" required maxLength={120} autoComplete="name" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ld-mist">
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 90000-0000"
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ld-mist">
        Conte como é o seu negócio
        <textarea name="message" rows={4} maxLength={2000} className={`${inputClass} resize-y`} />
      </label>
      <div className="flex flex-col gap-3 min-[600px]:flex-row">
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-[6px] bg-ld-sage-light px-5 text-sm font-semibold text-ld-forest transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-sage-light"
        >
          Enviar mensagem
        </button>
        <a
          href="#planos"
          className="inline-flex h-11 items-center justify-center rounded-[6px] border border-white/25 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-sage-light"
        >
          Assinar agora
        </a>
      </div>
    </form>
  )
}
