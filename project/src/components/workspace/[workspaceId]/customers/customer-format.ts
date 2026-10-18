// O banco guarda CPF e telefones só com dígitos; a tela mostra com a máscara.

// "52998224725" -> "529.982.247-25"
export function formatCpf(cpf: string) {
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf
}

// "11987654321" -> "(11) 98765-4321"; com 12 ou 13 dígitos, o código do país vem na frente
// ("5511987654321" -> "+55 (11) 98765-4321").
export function formatPhone(phone: string): string {
  if (phone.length === 12 || phone.length === 13) return `+${phone.slice(0, 2)} ${formatPhone(phone.slice(2))}`
  if (phone.length !== 10 && phone.length !== 11) return phone
  const split = phone.length - 4
  return `(${phone.slice(0, 2)}) ${phone.slice(2, split)}-${phone.slice(split)}`
}
