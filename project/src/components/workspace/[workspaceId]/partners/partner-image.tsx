import Avatar from "boring-avatars"
import { cn } from "@/service/_shared/utils"

const FALLBACK_COLORS = ["#1f5f57", "#3e8a7e", "#9fcfc4", "#efe6d6", "#d08c60"]

export function PartnerImage({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  return (
    <div className={cn("overflow-hidden bg-muted", className)}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <Avatar
          name={name}
          variant="marble"
          colors={FALLBACK_COLORS}
          square
          size="100%"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
          className="block size-full"
        />
      )}
    </div>
  )
}
