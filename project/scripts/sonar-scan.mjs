import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const coverageReport = new URL("../coverage/lcov.info", import.meta.url);
const localEnv = new URL("../.env.sonar.local", import.meta.url);
if (existsSync(localEnv)) {
  process.loadEnvFile(fileURLToPath(localEnv));
}

if (!process.env.SONAR_TOKEN?.trim()) {
  console.error(
    "Defina SONAR_TOKEN com um token do projeto Agendi (Minha conta > Segurança no SonarQube).",
  );
  process.exit(1);
}

if (!existsSync(coverageReport)) {
  console.error("Gere a cobertura primeiro: npm run test:coverage");
  process.exit(1);
}

// The scanner runs in Linux, including when Vitest ran on Windows.
const coverage = readFileSync(coverageReport, "utf8");
const normalizedCoverage = coverage.replace(/^SF:(.*)$/gm, (_, sourcePath) =>
  `SF:${sourcePath.replaceAll("\\", "/")}`,
);
if (normalizedCoverage !== coverage) {
  writeFileSync(coverageReport, normalizedCoverage);
}

const result = spawnSync(
  "docker",
  ["compose", "-f", "compose.sonar.yml", "run", "--rm", "scanner"],
  { cwd: projectDir, stdio: "inherit" },
);

if (result.error) {
  console.error(`Não foi possível executar o Docker: ${result.error.message}`);
}

process.exit(result.status ?? 1);
