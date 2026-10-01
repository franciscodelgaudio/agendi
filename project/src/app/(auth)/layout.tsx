import Image from "next/image"

// Moldura de duas colunas do bloco login-02, compartilhada por /login e /signup.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Image src="/logo.svg" alt="" width={28} height={28} loading="eager" />
            agendi
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>
      <div className="hidden items-center justify-center bg-linear-to-br from-secondary via-accent to-muted lg:flex">
        <Image
          src="/logo-app.svg"
          alt="agendi"
          width={320}
          height={320}
          className="size-64 drop-shadow-2xl xl:size-80"
          loading="eager"
        />
      </div>
    </div>
  )
}
