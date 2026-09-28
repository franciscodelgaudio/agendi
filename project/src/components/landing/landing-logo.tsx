// Mesmo desenho de public/logo.svg, com cores claras para o fundo escuro da landing.
export function LandingLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="777 357 366 366" aria-hidden="true" className={className}>
      <path
        fill="#e4ede8"
        d="M883 437C890 408 912 367 955 367C990 367 1008 388 1017 414L1022 430L1126 702C1130 710 1124 713 1116 713L1042 713C1034 713 1030 709 1027 703L945 500C932 468 912 438 883 437Z"
      />
      <path fill="#7fb3a2" d="M884 482C892 520 892 580 872 620C855 660 830 690 793 713C793 630 815 540 884 482Z" />
    </svg>
  )
}
