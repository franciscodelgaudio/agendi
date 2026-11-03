import { MapPinIcon, PercentIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { tiersSummary } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import { PartnerImage } from "@/components/workspace/[workspaceId]/partners/partner-image"
import { PartnerActions, type PartnerRow } from "@/components/workspace/[workspaceId]/partners/partner-sheets"
import { Card, CardContent } from "@/components/ui/card"

type Props = {
  workspaceId: string
  partners: PartnerRow[]
  freeUnits: { id: string; name: string }[]
  canManage: boolean
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof MapPinIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={label} />
      <div className="min-w-0 flex-1 truncate">{children}</div>
    </div>
  )
}

export function PartnerCards({ workspaceId, partners, freeUnits, canManage }: Props) {
  if (partners.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center border border-dashed text-muted-foreground">Nenhum parceiro encontrado.</div>
    )
  }

  const base = `/workspace/${workspaceId}`

  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {partners.map((partner) => (
          <Card key={partner.id} className="group/card relative pt-0">
            <PartnerImage name={partner.name} imageUrl={partner.imageUrl} className="aspect-video w-full border-b" />
            <CardContent className="gap-4">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`${base}/partners/${partner.id}`}
                  className="truncate text-base font-semibold after:absolute after:inset-0 hover:underline"
                >
                  {partner.name}
                </Link>
                {canManage && (
                  <div className="relative z-10 -my-1 shrink-0">
                    <PartnerActions workspaceId={workspaceId} partner={partner} units={freeUnits} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 text-sm">
                <InfoRow icon={MapPinIcon} label="Unidade">
                  {partner.unit ? partner.unit.name : <span className="text-muted-foreground">Sem unidade</span>}
                </InfoRow>
                <InfoRow icon={PercentIcon} label="Faixas de repasse">
                  {tiersSummary(partner)}
                </InfoRow>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
