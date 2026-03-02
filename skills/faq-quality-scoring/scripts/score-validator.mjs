#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

function parseArgs(argv) {
  const args = {
    file: null,
    termName: null,
    checkPass: false,
    checkRanking: false,
    requireMer: false,
    strict: false,
    lintExamples: false,
    examplesFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      args.help = true;
      continue;
    }
    if (token === "--file") {
      args.file = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token.startsWith("--file=")) {
      args.file = token.slice("--file=".length) || null;
      continue;
    }
    if (token === "--termname") {
      args.termName = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token.startsWith("--termname=")) {
      args.termName = token.slice("--termname=".length) || null;
      continue;
    }
    if (token === "--check-pass") {
      args.checkPass = true;
      continue;
    }
    if (token === "--check-ranking") {
      args.checkRanking = true;
      continue;
    }
    if (token === "--require-mer") {
      args.requireMer = true;
      continue;
    }
    if (token === "--strict") {
      args.strict = true;
      continue;
    }
    if (token === "--lint-examples") {
      args.lintExamples = true;
      continue;
    }
    if (token === "--examples") {
      args.examplesFile = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token.startsWith("--examples=")) {
      args.examplesFile = token.slice("--examples=".length) || null;
      continue;
    }
  }

  return args;
}

function usage() {
  return [
    "用法：",
    "  1) 从 stdin 读取：",
    "     cat output.json | node scripts/score-validator.mjs [--termname \"TermName\"]",
    "  2) 从文件读取：",
    "     node scripts/score-validator.mjs --file output.json [--termname \"TermName\"]",
    "  3) 可选一致性增强校验：",
    "     node scripts/score-validator.mjs --file output.json --check-pass",
    "     node scripts/score-validator.mjs --file output.json --check-ranking",
    "     node scripts/score-validator.mjs --file output.json --require-mer",
    "  4) 严格模式（组合开关）：",
    "     node scripts/score-validator.mjs --file output.json --strict",
    "  5) 自检 examples.jsonl：",
    "     node scripts/score-validator.mjs --lint-examples [--examples assets/examples.jsonl]",
    "",
    "说明：",
    "  - 只校验 JSON 输出格式与一致性，不重算评分逻辑。",
    "  - 传入 --termname 时，会检测输出文本中是否出现该字符串（出现则判失败）。",
    "  - --check-pass 会额外校验 pass_for_publish 与阈值规则是否一致（基于输出分数字段）。",
    "  - --check-ranking 会额外校验 comparison.ranking 是否与分数+并列规则一致（基于输出分数字段）。",
    "  - --require-mer 要求输出文本中至少出现一次 {Mer.}（用于强制占位符习惯）。",
    "  - --strict 等价于同时启用：--check-pass --check-ranking --require-mer。",
    "  - --lint-examples 会校验 examples.jsonl 的行内 JSON 结构与分数范围（不调用模型）。",
  ].join("\n");
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOneDecimal(numberValue) {
  if (!Number.isFinite(numberValue)) return false;
  const scaled = numberValue * 10;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

function inRange(numberValue, minInclusive, maxInclusive) {
  return (
    Number.isFinite(numberValue) &&
    numberValue >= minInclusive - 1e-9 &&
    numberValue <= maxInclusive + 1e-9
  );
}

function uniqueArray(arr) {
  return Array.from(new Set(arr));
}

function validateScoreNumber(errors, path, value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} 必须是 number`);
    return;
  }
  if (!hasOneDecimal(value)) errors.push(`${path} 必须保留 1 位小数`);
  if (!inRange(value, min, max)) errors.push(`${path} 范围必须在 ${min}~${max}`);
}

function validateString(errors, path, value) {
  if (typeof value !== "string") errors.push(`${path} 必须是 string`);
}

function validateBoolean(errors, path, value) {
  if (typeof value !== "boolean") errors.push(`${path} 必须是 boolean`);
}

function validateStringArray(errors, path, value, minLen, maxLen) {
  if (!Array.isArray(value)) {
    errors.push(`${path} 必须是 array`);
    return;
  }
  if (value.length < minLen || value.length > maxLen) {
    errors.push(`${path} 长度必须在 ${minLen}~${maxLen}`);
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "string" || value[i].trim().length === 0) {
      errors.push(`${path}[${i}] 必须是非空字符串`);
    }
  }
}

function validateDocShape(errors, doc, options = {}) {
  const checkPass = options.checkPass === true;
  const checkRanking = options.checkRanking === true;
  const requireMer = options.requireMer === true;
  if (!isPlainObject(doc)) {
    errors.push("根对象必须是 JSON object");
    return;
  }

  for (const key of ["meta", "results", "comparison", "notes"]) {
    if (!(key in doc)) errors.push(`缺少顶层字段：${key}`);
  }
  if (errors.length > 0) return;

  if (!isPlainObject(doc.meta)) errors.push("meta 必须是 object");
  if (!Array.isArray(doc.results)) errors.push("results 必须是 array");
  if (!isPlainObject(doc.comparison)) errors.push("comparison 必须是 object");
  if (typeof doc.notes !== "string") errors.push("notes 必须是 string");
  if (errors.length > 0) return;

  validateString(errors, "meta.TermID", doc.meta.TermID);
  validateString(errors, "meta.Domain", doc.meta.Domain);
  validateString(errors, "meta.Country", doc.meta.Country);

  if (!Array.isArray(doc.meta.versions_present)) {
    errors.push("meta.versions_present 必须是 array");
  } else {
    const allowedVersions = new Set(["online", "ai", "op"]);
    const versions = doc.meta.versions_present;
    const unique = uniqueArray(versions);
    if (unique.length !== versions.length) errors.push("meta.versions_present 不得包含重复值");
    for (let i = 0; i < versions.length; i += 1) {
      if (typeof versions[i] !== "string" || !allowedVersions.has(versions[i])) {
        errors.push(`meta.versions_present[${i}] 必须是 online/ai/op 之一`);
      }
    }
    if (!unique.includes("online") || !unique.includes("ai")) {
      errors.push("meta.versions_present 必须至少包含 online 与 ai");
    }
  }

  const allowedVersionSet = new Set(["online", "ai", "op"]);
  const resultVersions = [];
  const scoreByVersion = new Map();
  for (let i = 0; i < doc.results.length; i += 1) {
    const item = doc.results[i];
    const basePath = `results[${i}]`;
    if (!isPlainObject(item)) {
      errors.push(`${basePath} 必须是 object`);
      continue;
    }

    for (const key of [
      "version",
      "score_total",
      "score_breakdown",
      "strengths",
      "weaknesses",
      "suggestions",
      "pass_for_publish",
    ]) {
      if (!(key in item)) errors.push(`${basePath} 缺少字段：${key}`);
    }
    if (errors.length > 0) continue;

    if (typeof item.version !== "string" || !allowedVersionSet.has(item.version)) {
      errors.push(`${basePath}.version 必须是 online/ai/op 之一`);
    } else {
      resultVersions.push(item.version);
    }

    validateScoreNumber(errors, `${basePath}.score_total`, item.score_total, 0, 10);

    if (!isPlainObject(item.score_breakdown)) {
      errors.push(`${basePath}.score_breakdown 必须是 object`);
    } else {
      for (const key of ["A", "B", "C", "D"]) {
        if (!(key in item.score_breakdown)) errors.push(`${basePath}.score_breakdown 缺少字段：${key}`);
      }
      if (isPlainObject(item.score_breakdown)) {
        validateScoreNumber(errors, `${basePath}.score_breakdown.A`, item.score_breakdown.A, 0, 3);
        validateScoreNumber(errors, `${basePath}.score_breakdown.B`, item.score_breakdown.B, 0, 4);
        validateScoreNumber(errors, `${basePath}.score_breakdown.C`, item.score_breakdown.C, 0, 2);
        validateScoreNumber(errors, `${basePath}.score_breakdown.D`, item.score_breakdown.D, 0, 1);

        if (
          typeof item.score_total === "number" &&
          isPlainObject(item.score_breakdown) &&
          ["A", "B", "C", "D"].every((k) => typeof item.score_breakdown[k] === "number")
        ) {
          const sum =
            item.score_breakdown.A +
            item.score_breakdown.B +
            item.score_breakdown.C +
            item.score_breakdown.D;
          if (Math.abs(sum - item.score_total) > 0.1 + 1e-9) {
            errors.push(`${basePath} A+B+C+D 与 score_total 误差必须 <= 0.1`);
          }
        }
      }
    }

    validateStringArray(errors, `${basePath}.strengths`, item.strengths, 3, 6);
    validateStringArray(errors, `${basePath}.weaknesses`, item.weaknesses, 3, 6);
    validateStringArray(errors, `${basePath}.suggestions`, item.suggestions, 2, 5);
    validateBoolean(errors, `${basePath}.pass_for_publish`, item.pass_for_publish);

    if (
      typeof item.version === "string" &&
      allowedVersionSet.has(item.version) &&
      typeof item.score_total === "number" &&
      isPlainObject(item.score_breakdown) &&
      typeof item.score_breakdown.A === "number" &&
      typeof item.score_breakdown.B === "number"
    ) {
      scoreByVersion.set(item.version, {
        total: item.score_total,
        A: item.score_breakdown.A,
        B: item.score_breakdown.B,
      });
    }

    if (
      checkPass &&
      typeof item.pass_for_publish === "boolean" &&
      typeof item.score_total === "number" &&
      isPlainObject(item.score_breakdown) &&
      typeof item.score_breakdown.A === "number" &&
      typeof item.score_breakdown.B === "number"
    ) {
      const expected =
        item.score_total >= 8.0 - 1e-9 &&
        item.score_breakdown.A >= 2.0 - 1e-9 &&
        item.score_breakdown.B >= 3.0 - 1e-9;
      if (item.pass_for_publish !== expected) {
        errors.push(`${basePath}.pass_for_publish 与阈值规则不一致（启用 --check-pass 时校验）`);
      }
    }
  }

  const uniqueResultVersions = uniqueArray(resultVersions);
  if (uniqueResultVersions.length !== resultVersions.length) {
    errors.push("results[].version 不得重复");
  }

  if (isPlainObject(doc.comparison)) {
    for (const key of ["best_version", "ranking", "key_deltas"]) {
      if (!(key in doc.comparison)) errors.push(`comparison 缺少字段：${key}`);
    }
    if ("best_version" in doc.comparison) {
      if (
        typeof doc.comparison.best_version !== "string" ||
        !allowedVersionSet.has(doc.comparison.best_version)
      ) {
        errors.push("comparison.best_version 必须是 online/ai/op 之一");
      }
    }
    if ("ranking" in doc.comparison) {
      if (!Array.isArray(doc.comparison.ranking)) {
        errors.push("comparison.ranking 必须是 array");
      } else {
        const rankUnique = uniqueArray(doc.comparison.ranking);
        if (rankUnique.length !== doc.comparison.ranking.length) {
          errors.push("comparison.ranking 不得包含重复值");
        }
        for (let i = 0; i < doc.comparison.ranking.length; i += 1) {
          const v = doc.comparison.ranking[i];
          if (typeof v !== "string" || !allowedVersionSet.has(v)) {
            errors.push(`comparison.ranking[${i}] 必须是 online/ai/op 之一`);
          }
        }
      }
    }
    if ("key_deltas" in doc.comparison) {
      validateStringArray(errors, "comparison.key_deltas", doc.comparison.key_deltas, 2, 5);
    }
  }

  if (Array.isArray(doc.meta?.versions_present)) {
    const expectedVersions = uniqueArray(doc.meta.versions_present).sort();
    const actualVersions = uniqueArray(resultVersions).sort();
    if (expectedVersions.join("|") !== actualVersions.join("|")) {
      errors.push("meta.versions_present 与 results[].version 集合必须一致");
    }

    const hasOp = expectedVersions.includes("op");
    if (!hasOp && actualVersions.includes("op")) {
      errors.push("About_OP 缺失时不应出现 op version（以 meta.versions_present 为准）");
    }

    if (Array.isArray(doc.comparison?.ranking)) {
      const rankingVersions = uniqueArray(doc.comparison.ranking).sort();
      if (rankingVersions.join("|") !== expectedVersions.join("|")) {
        errors.push("comparison.ranking 必须包含且只包含 meta.versions_present 的所有版本");
      }
    }
    if (typeof doc.comparison?.best_version === "string" && Array.isArray(doc.comparison?.ranking)) {
      if (doc.comparison.ranking[0] !== doc.comparison.best_version) {
        errors.push("comparison.best_version 必须等于 comparison.ranking[0]");
      }
    }

    if (checkRanking && Array.isArray(doc.comparison?.ranking) && scoreByVersion.size > 0) {
      const versionPriority = { op: 3, ai: 2, online: 1 };
      const expectedRanking = [...expectedVersions].sort((v1, v2) => {
        const s1 = scoreByVersion.get(v1);
        const s2 = scoreByVersion.get(v2);
        if (!s1 || !s2) return 0;
        if (s2.total !== s1.total) return s2.total - s1.total;
        if (s2.B !== s1.B) return s2.B - s1.B;
        if (s2.A !== s1.A) return s2.A - s1.A;
        return (versionPriority[v2] ?? 0) - (versionPriority[v1] ?? 0);
      });

      const actualRanking = doc.comparison.ranking;
      if (expectedRanking.join("|") !== actualRanking.join("|")) {
        errors.push("comparison.ranking 与并列胜负规则不一致（启用 --check-ranking 时校验）");
      }
    }
  }

  if (requireMer) {
    const raw = JSON.stringify(doc);
    if (!raw.includes("{Mer.}")) errors.push("输出必须至少包含一次 {Mer.}（启用 --require-mer 时校验）");
  }
}

function validateExampleLine(errors, obj, lineNo) {
  const base = `examples line ${lineNo}`;
  if (!isPlainObject(obj)) {
    errors.push(`${base}: 必须是 object`);
    return;
  }
  for (const k of ["Country", "version", "about_text", "expected", "notes"]) {
    if (!(k in obj)) errors.push(`${base}: 缺少字段 ${k}`);
  }
  if (typeof obj.Country !== "string" || obj.Country.trim().length === 0) {
    errors.push(`${base}: Country 必须是非空 string`);
  }
  if (!["online", "ai", "op"].includes(obj.version)) {
    errors.push(`${base}: version 必须是 online/ai/op`);
  }
  if (typeof obj.about_text !== "string" || obj.about_text.trim().length === 0) {
    errors.push(`${base}: about_text 必须是非空 string`);
  }
  if (!isPlainObject(obj.expected)) {
    errors.push(`${base}: expected 必须是 object`);
    return;
  }
  for (const k of ["A", "B", "C", "D", "total"]) {
    if (!(k in obj.expected)) errors.push(`${base}: expected 缺少字段 ${k}`);
  }
  validateScoreNumber(errors, `${base}.expected.A`, obj.expected.A, 0, 3);
  validateScoreNumber(errors, `${base}.expected.B`, obj.expected.B, 0, 4);
  validateScoreNumber(errors, `${base}.expected.C`, obj.expected.C, 0, 2);
  validateScoreNumber(errors, `${base}.expected.D`, obj.expected.D, 0, 1);
  validateScoreNumber(errors, `${base}.expected.total`, obj.expected.total, 0, 10);

  if (
    typeof obj.expected.total === "number" &&
    ["A", "B", "C", "D"].every((k) => typeof obj.expected[k] === "number")
  ) {
    const sum = obj.expected.A + obj.expected.B + obj.expected.C + obj.expected.D;
    if (Math.abs(sum - obj.expected.total) > 0.1 + 1e-9) {
      errors.push(`${base}: expected A+B+C+D 与 total 误差必须 <= 0.1`);
    }
  }

  if (typeof obj.notes !== "string" || obj.notes.trim().length === 0) {
    errors.push(`${base}: notes 必须是非空 string`);
  }
}

async function lintExamplesFile(filePath) {
  const errors = [];
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const countries = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (err) {
      errors.push(`examples line ${i + 1}: JSON 解析失败：${err?.message ?? String(err)}`);
      continue;
    }
    validateExampleLine(errors, obj, i + 1);
    if (typeof obj?.Country === "string") {
      countries.set(obj.Country, (countries.get(obj.Country) ?? 0) + 1);
    }
  }

  if (lines.length < 8) errors.push("examples: 行数必须至少为 8");
  if (countries.size < 6) errors.push("examples: 覆盖国家必须至少为 6 个");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, lines: lines.length, countries: Array.from(countries.entries()) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  if (args.lintExamples) {
    const examplesPath =
      args.examplesFile && args.examplesFile.trim().length > 0
        ? args.examplesFile
        : new URL("../assets/examples.jsonl", import.meta.url);

    const result = await lintExamplesFile(examplesPath);
    if (!result.ok) {
      process.stderr.write("examples 校验失败：\n");
      for (const e of result.errors) process.stderr.write(`- ${e}\n`);
      process.exit(1);
    }
    process.stdout.write("OK\n");
    process.stdout.write(`examples lines: ${result.lines}\n`);
    process.stdout.write(`countries: ${result.countries.length}\n`);
    process.exit(0);
  }

  if (args.strict) {
    args.checkPass = true;
    args.checkRanking = true;
    args.requireMer = true;
  }

  const raw =
    args.file && args.file.trim().length > 0
      ? await fs.readFile(args.file, "utf8")
      : await readAllStdin();

  if (args.termName && args.termName.trim().length > 0) {
    if (raw.includes(args.termName)) {
      process.stderr.write(`发现禁用项：输出包含 TermName 字符串：${args.termName}\n`);
      process.exit(1);
    }
  }

  let doc;
  try {
    const cleaned = raw.replace(/^\uFEFF/, "");
    doc = JSON.parse(cleaned);
  } catch (err) {
    process.stderr.write(`JSON 解析失败：${err?.message ?? String(err)}\n`);
    process.exit(1);
  }

  const errors = [];
  validateDocShape(errors, doc, {
    checkPass: args.checkPass,
    checkRanking: args.checkRanking,
    requireMer: args.requireMer,
  });

  if (errors.length > 0) {
    process.stderr.write("校验失败：\n");
    for (const e of errors) process.stderr.write(`- ${e}\n`);
    process.exit(1);
  }

  process.stdout.write("OK\n");
}

main().catch((err) => {
  process.stderr.write(`运行失败：${err?.stack ?? err?.message ?? String(err)}\n`);
  process.exit(1);
});
