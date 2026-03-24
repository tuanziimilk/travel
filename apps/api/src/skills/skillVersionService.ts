import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Capability, ModuleId, ScType } from "@about-demo/trpc";
import { readModuleSkillFile, resolveSkillPath } from "./skillStore";
import {
  createSkillVersion,
  getLatestSkillVersion,
  getSkillVersionDetail,
  listSkillVersionHistory,
  type SkillTargetType,
  type SkillVersionStream,
} from "./skillVersionStore";

function normalizeSubclass(value?: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getParentDir(filePath: string) {
  return filePath.replace(/[\\/][^\\/]+$/, "");
}

function resolveModuleId(scType: ScType): ModuleId | null {
  if (scType === "about" || scType === "faq") return scType;
  return null;
}

function resolveRouteOverridePath(capability: Capability, scType: ScType, subclass?: string) {
  const normalizedSubclass = normalizeSubclass(subclass) || "__default__";
  const slug = normalizedSubclass.replaceAll("/", "-").replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "__default__";
  return resolve(process.cwd(), ".runtime", "skill-overrides", capability, scType, slug, "SKILL.md");
}

async function readCurrentLiveSkill(stream: SkillVersionStream) {
  if (stream.targetType === "module_live") {
    const moduleId = resolveModuleId(stream.scType);
    if (!moduleId) throw new Error(`Unsupported module live stream: ${stream.scType}`);
    const document = await readModuleSkillFile(moduleId);
    return {
      skillMd: document.skillMd,
      sourceSnapshot: document.source,
    };
  }

  const filePath = resolveRouteOverridePath(stream.capability, stream.scType, stream.subclass);
  if (!existsSync(filePath)) {
    return null;
  }
  return {
    skillMd: await readFile(filePath, "utf8"),
    sourceSnapshot: "route_override",
  };
}

function writeCurrentLiveSkill(stream: SkillVersionStream, skillMd: string) {
  if (stream.targetType === "module_live") {
    const moduleId = resolveModuleId(stream.scType);
    if (!moduleId) throw new Error(`Unsupported module live stream: ${stream.scType}`);
    const filePath = resolveSkillPath(moduleId);
    mkdirSync(getParentDir(filePath), { recursive: true });
    writeFileSync(filePath, skillMd, "utf8");
    return;
  }

  const filePath = resolveRouteOverridePath(stream.capability, stream.scType, stream.subclass);
  mkdirSync(getParentDir(filePath), { recursive: true });
  writeFileSync(filePath, skillMd, "utf8");
}

export async function ensureSkillVersionBootstrap(stream: SkillVersionStream) {
  const latest = await getLatestSkillVersion(stream);
  if (latest) return latest;

  const current = await readCurrentLiveSkill(stream);
  if (!current?.skillMd?.trim()) return null;

  return createSkillVersion({
    ...stream,
    actionType: "bootstrap",
    editor: "system",
    changeNote: "初始化导入当前生效版本",
    skillMd: current.skillMd,
    sourceSnapshot: current.sourceSnapshot,
  });
}

export async function saveVersionedSkill(input: SkillVersionStream & {
  skillMd: string;
  editor: string;
  changeNote: string;
}) {
  if (!input.skillMd.trim()) throw new Error("SKILL.md 内容不能为空");
  await ensureSkillVersionBootstrap(input);
  const record = await createSkillVersion({
    ...input,
    actionType: "save",
    skillMd: input.skillMd,
    sourceSnapshot: input.targetType === "module_live" ? "file" : "route_override",
  });
  writeCurrentLiveSkill(input, input.skillMd);
  return record;
}

export async function rollbackSkillVersion(input: SkillVersionStream & {
  versionId: string;
  editor: string;
  changeNote: string;
}) {
  await ensureSkillVersionBootstrap(input);
  const version = await getSkillVersionDetail(input.versionId);
  if (!version) throw new Error("未找到指定历史版本");
  if (
    version.capability !== input.capability ||
    version.scType !== input.scType ||
    normalizeSubclass(version.subclass) !== normalizeSubclass(input.subclass) ||
    version.targetType !== input.targetType
  ) {
    throw new Error("历史版本与当前 skill 不匹配");
  }

  const record = await createSkillVersion({
    ...input,
    actionType: "rollback",
    skillMd: version.skillMd,
    sourceSnapshot: version.sourceSnapshot,
  });
  writeCurrentLiveSkill(input, version.skillMd);
  return { version: record, restoredFrom: version };
}

export async function listVersionedSkillHistory(stream: SkillVersionStream) {
  await ensureSkillVersionBootstrap(stream);
  return listSkillVersionHistory(stream);
}

export async function getCurrentModuleSkill(moduleId: ModuleId) {
  return readModuleSkillFile(moduleId);
}
