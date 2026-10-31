export function userAvatarSrc(user: { image?: string | null; email?: string | null }, size: number) {
  if (user.image) return user.image
  const email = user.email?.trim().toLowerCase()
  return email ? `https://blobatar.dev/avatar/${encodeURIComponent(email)}?size=${size}` : undefined
}
