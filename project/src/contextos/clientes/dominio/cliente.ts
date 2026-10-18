const TAMANHO_MAXIMO_DO_NOME = 80;
const TAMANHO_MAXIMO_DAS_OBSERVACOES = 500;
const MAXIMO_DE_TELEFONES = 5;

// Cliente recorrente (ADR-040): o CPF é a identidade (único na empresa); telefones são vários.
// Observações não guardam dado de saúde (pendência CL1).
export type DadosDoCliente = {
  nome: string;
  cpf: string;
  telefones: string[];
  email: string | null;
  observacoes: string | null;
};

export type ErroDoCliente =
  | "entrada_invalida"
  | "nome_invalido"
  | "nome_longo"
  | "cpf_invalido"
  | "telefone_invalido"
  | "telefones_demais"
  | "email_invalido"
  | "observacoes_longas";

// "529.982.247-25" ou "52998224725" -> "52998224725"; null se o formato ou os dígitos
// verificadores não conferem (ou se todos os dígitos são iguais).
export function normalizarCpf(texto: string) {
  const valor = texto.trim();
  if (!/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(valor)) return null;
  const digitos = valor.replace(/\D/g, "");
  if (/^(\d)\1{10}$/.test(digitos)) return null;

  const verificador = (quantidade: number) => {
    let soma = 0;
    for (let i = 0; i < quantidade; i++) soma += Number(digitos[i]) * (quantidade + 1 - i);
    return ((soma * 10) % 11) % 10;
  };
  return verificador(9) === Number(digitos[9]) && verificador(10) === Number(digitos[10]) ? digitos : null;
}

// "(11) 98765-4321" -> "11987654321"; com DDD e, opcionalmente, o código do país (10 a 13
// dígitos). null se tiver outros caracteres ou outro tamanho.
export function normalizarTelefone(texto: string) {
  const valor = texto.trim();
  if (!/^[\d\s()+-]+$/.test(valor)) return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 13 ? digitos : null;
}

function textoOpcional(valor: unknown): valor is string | null | undefined {
  return valor == null || typeof valor === "string";
}

// Valida e normaliza os dados do formulário. E-mail e observações vazios viram null; telefones
// vazios são ignorados e repetidos ficam uma vez só.
export function lerCliente(entrada: unknown): { ok: true; dados: DadosDoCliente } | { ok: false; erro: ErroDoCliente } {
  const { nome, cpf, telefones, email, observacoes } = (entrada ?? {}) as Record<string, unknown>;
  if (
    entrada == null ||
    typeof nome !== "string" ||
    typeof cpf !== "string" ||
    !Array.isArray(telefones) ||
    !telefones.every((telefone) => typeof telefone === "string") ||
    !textoOpcional(email) ||
    !textoOpcional(observacoes)
  ) {
    return { ok: false, erro: "entrada_invalida" };
  }

  const nomeNormalizado = nome.trim();
  if (!nomeNormalizado) return { ok: false, erro: "nome_invalido" };
  if (nomeNormalizado.length > TAMANHO_MAXIMO_DO_NOME) return { ok: false, erro: "nome_longo" };

  const cpfNormalizado = normalizarCpf(cpf);
  if (!cpfNormalizado) return { ok: false, erro: "cpf_invalido" };

  const telefonesNormalizados: string[] = [];
  for (const telefone of telefones as string[]) {
    if (!telefone.trim()) continue;
    const normalizado = normalizarTelefone(telefone);
    if (!normalizado) return { ok: false, erro: "telefone_invalido" };
    if (!telefonesNormalizados.includes(normalizado)) telefonesNormalizados.push(normalizado);
  }
  if (telefonesNormalizados.length > MAXIMO_DE_TELEFONES) return { ok: false, erro: "telefones_demais" };

  const emailNormalizado = email?.trim() || null;
  if (emailNormalizado && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) return { ok: false, erro: "email_invalido" };

  const observacoesNormalizadas = observacoes?.trim() || null;
  if (observacoesNormalizadas && observacoesNormalizadas.length > TAMANHO_MAXIMO_DAS_OBSERVACOES) {
    return { ok: false, erro: "observacoes_longas" };
  }

  return {
    ok: true,
    dados: {
      nome: nomeNormalizado,
      cpf: cpfNormalizado,
      telefones: telefonesNormalizados,
      email: emailNormalizado,
      observacoes: observacoesNormalizadas,
    },
  };
}
