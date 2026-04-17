import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type EnvMap = Record<string, string>;

type RuntimeAiConfig = {
  toolKey: string;
  provider: string;
  aiModel: string;
  aiInputCostPer1M: number;
  aiOutputCostPer1M: number;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const localEnvPath = resolve(repoRoot, ".env");

function parseEnvFile(content: string) {
  const env: EnvMap = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    env[key] = rest.join("=");
  }
  return env;
}

function maskSecret(value: string) {
  if (!value) return "<empty>";
  return `${value.slice(0, 4)}***`;
}

function normalizeSshKeyPath(raw: string) {
  if (!raw) return "";
  const mntMatch = raw.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (mntMatch) {
    const drive = mntMatch[1].toUpperCase();
    const rest = mntMatch[2].replace(/\//g, "\\");
    return `${drive}:\\${rest}`;
  }
  return raw;
}

async function getServerEnvSnapshot(sshUser: string, sshHost: string, sshKey: string) {
  const remoteScript = `
from pathlib import Path
import json

p = Path('/app/site/SC-quality-scoring/.env')
lines = {}
for line in p.read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        lines[k] = v

keys = [
    'OPENAI_BASE_URL',
    'OPENAI_API_KEY',
    'GEMINI_BASE_URL',
    'GEMINI_API_KEY',
    'AI_BASE_URL',
    'AI_API_KEY',
    'AI_MODEL',
    'TRANSLATION_AI_MODEL',
    'CATEGORY_CALIBRATION_AI_MODEL',
]
print(json.dumps({k: lines.get(k, '') for k in keys}))
`.trim();
  const encodedScript = Buffer.from(remoteScript, "utf8").toString("base64");
  const remoteCommand = `python3 -c "import base64; exec(base64.b64decode('${encodedScript}').decode('utf-8'))"`;

  const { stdout } = await execFileAsync(
    "ssh",
    ["-o", "StrictHostKeyChecking=no", "-i", sshKey, `${sshUser}@${sshHost}`, remoteCommand],
    { cwd: repoRoot },
  );
  return JSON.parse(stdout.trim()) as EnvMap;
}

async function getRuntimeConfig(apiBase: string, toolKey: string) {
  const url = `${apiBase}/trpc/runtime.aiConfig.get?input=${encodeURIComponent(JSON.stringify({ toolKey }))}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`runtime.aiConfig.get(${toolKey}) failed: ${response.status}`);
  }
  const payload = (await response.json()) as { result?: { data?: RuntimeAiConfig } };
  if (!payload.result?.data) {
    throw new Error(`runtime.aiConfig.get(${toolKey}) returned no data`);
  }
  return payload.result.data;
}

function printCheck(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${detail}`);
}

async function main() {
  const localEnv = parseEnvFile(await readFile(localEnvPath, "utf8"));
  const sshUser = localEnv.DEPLOY_SERVER_USER;
  const sshHost = localEnv.DEPLOY_SERVER_HOST;
  const sshKey = normalizeSshKeyPath(localEnv.DEPLOY_SSH_KEY || "");

  if (!sshUser || !sshHost || !sshKey) {
    throw new Error("Missing DEPLOY_SERVER_USER / DEPLOY_SERVER_HOST / DEPLOY_SSH_KEY in repo root .env");
  }

  const expected = {
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
    AI_BASE_URL: "https://api.openai.com/v1",
    AI_MODEL: "gemini-2.5-flash-lite",
    TRANSLATION_AI_MODEL: "gemini-2.5-flash-lite",
    CATEGORY_CALIBRATION_AI_MODEL: "gemini-2.5-flash-lite",
  };

  const serverEnv = await getServerEnvSnapshot(sshUser, sshHost, sshKey);
  const apiBase = `http://${sshHost}:3001`;
  const runtimeChecks = await Promise.all([
    getRuntimeConfig(apiBase, "output-faq"),
    getRuntimeConfig(apiBase, "translation-batch"),
    getRuntimeConfig(apiBase, "translation-text"),
    getRuntimeConfig(apiBase, "category-calibration"),
  ]);

  console.log("Server .env");
  printCheck("OPENAI_BASE_URL", serverEnv.OPENAI_BASE_URL === expected.OPENAI_BASE_URL, serverEnv.OPENAI_BASE_URL || "<missing>");
  printCheck("GEMINI_BASE_URL", serverEnv.GEMINI_BASE_URL === expected.GEMINI_BASE_URL, serverEnv.GEMINI_BASE_URL || "<missing>");
  printCheck("AI_BASE_URL", serverEnv.AI_BASE_URL === expected.AI_BASE_URL, serverEnv.AI_BASE_URL || "<missing>");
  printCheck("AI_MODEL", serverEnv.AI_MODEL === expected.AI_MODEL, serverEnv.AI_MODEL || "<missing>");
  printCheck(
    "TRANSLATION_AI_MODEL",
    serverEnv.TRANSLATION_AI_MODEL === expected.TRANSLATION_AI_MODEL,
    serverEnv.TRANSLATION_AI_MODEL || "<missing>",
  );
  printCheck(
    "CATEGORY_CALIBRATION_AI_MODEL",
    serverEnv.CATEGORY_CALIBRATION_AI_MODEL === expected.CATEGORY_CALIBRATION_AI_MODEL,
    serverEnv.CATEGORY_CALIBRATION_AI_MODEL || "<missing>",
  );
  printCheck("OPENAI_API_KEY", Boolean(serverEnv.OPENAI_API_KEY), maskSecret(serverEnv.OPENAI_API_KEY || ""));
  printCheck("GEMINI_API_KEY", Boolean(serverEnv.GEMINI_API_KEY), maskSecret(serverEnv.GEMINI_API_KEY || ""));
  printCheck("AI_API_KEY", Boolean(serverEnv.AI_API_KEY), maskSecret(serverEnv.AI_API_KEY || ""));

  console.log("\nRuntime defaults");
  for (const config of runtimeChecks) {
    const ok = config.provider === "gemini" && config.aiModel === "gemini-2.5-flash-lite";
    printCheck(config.toolKey, ok, `${config.provider} / ${config.aiModel}`);
  }

  const failures = [
    serverEnv.OPENAI_BASE_URL !== expected.OPENAI_BASE_URL,
    serverEnv.GEMINI_BASE_URL !== expected.GEMINI_BASE_URL,
    serverEnv.AI_BASE_URL !== expected.AI_BASE_URL,
    serverEnv.AI_MODEL !== expected.AI_MODEL,
    serverEnv.TRANSLATION_AI_MODEL !== expected.TRANSLATION_AI_MODEL,
    serverEnv.CATEGORY_CALIBRATION_AI_MODEL !== expected.CATEGORY_CALIBRATION_AI_MODEL,
    !serverEnv.OPENAI_API_KEY,
    !serverEnv.GEMINI_API_KEY,
    !serverEnv.AI_API_KEY,
    ...runtimeChecks.map((config) => !(config.provider === "gemini" && config.aiModel === "gemini-2.5-flash-lite")),
  ].filter(Boolean).length;

  if (failures > 0) {
    console.error(`\nServer AI default audit failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log("\nServer AI default audit passed.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
