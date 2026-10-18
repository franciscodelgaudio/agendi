import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Fronteiras dos bounded contexts (docs/06-diagnostico-migracao.md): um contexto só é usado
  // pela API pública: index.ts (sem infraestrutura), acoes.ts (server actions) e consultas.ts
  // (leituras no servidor). A raiz de composição (contextos/barramento.ts) importa por caminho relativo.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/contextos/*/**", "!@/contextos/*/acoes", "!@/contextos/*/consultas"],
              message: "Importe só a API pública do contexto: @/contextos/<contexto>, /acoes ou /consultas.",
            },
          ],
        },
      ],
    },
  },
  // O domínio não conhece banco nem framework.
  {
    files: ["src/contextos/*/dominio/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/contextos/*/**", "!@/contextos/*/acoes", "!@/contextos/*/consultas"],
              message: "Importe só a API pública do contexto: @/contextos/<contexto>, /acoes ou /consultas.",
            },
            {
              group: ["mongoose", "mongodb", "next", "next/*", "react", "@/models/*", "@/lib/*", "@/service/*"],
              message: "O domínio não depende de banco, framework nem do código legado.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
