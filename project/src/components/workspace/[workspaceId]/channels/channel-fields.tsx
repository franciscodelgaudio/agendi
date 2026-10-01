"use client"

import { useState } from "react"
import { MESSAGING_PLATFORMS, type MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types"
import { externalIdLabels, platformLabels } from "@/components/workspace/[workspaceId]/shared/messaging/platform-labels"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const platformItems = MESSAGING_PLATFORMS.map((platform) => ({ value: platform, label: platformLabels[platform] }))

type Props = {
  idPrefix: string
  // Na edição, plataforma e ID não mudam (as conversas dependem deles) e o token é opcional.
  channel?: { name: string; platform: MessagingPlatform; externalId: string }
}

export function ChannelFields({ idPrefix, channel }: Props) {
  const [platform, setPlatform] = useState<MessagingPlatform>(channel?.platform ?? "whatsapp")

  return (
    <>
      {channel ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-external-id`}>
            {platformLabels[channel.platform]} · {externalIdLabels[channel.platform]}
          </FieldLabel>
          <Input id={`${idPrefix}-external-id`} value={channel.externalId} readOnly disabled />
        </Field>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-platform`}>Plataforma</FieldLabel>
            <Select
              name="platform"
              items={platformItems}
              value={platform}
              onValueChange={(value) => value && setPlatform(value as MessagingPlatform)}
              required
            >
              <SelectTrigger id={`${idPrefix}-platform`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platformItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-external-id`}>{externalIdLabels[platform]}</FieldLabel>
            <Input
              id={`${idPrefix}-external-id`}
              name="externalId"
              inputMode="numeric"
              pattern="\d{5,32}"
              placeholder={platform === "whatsapp" ? "106540352242922" : "17841400000000000"}
              required
            />
          </Field>
        </>
      )}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder={platform === "whatsapp" ? "WhatsApp Centro" : "Instagram da loja"}
          defaultValue={channel?.name}
          maxLength={60}
          autoFocus
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-token`}>Token de acesso</FieldLabel>
        <Input
          id={`${idPrefix}-token`}
          name="accessToken"
          type="password"
          autoComplete="off"
          maxLength={2048}
          required={!channel}
        />
        {channel && <FieldDescription>Deixe em branco para manter o token atual.</FieldDescription>}
      </Field>
    </>
  )
}
