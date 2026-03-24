import { and, desc, eq, max } from "drizzle-orm";
import type { Capability, ScType } from "@about-demo/trpc";
import { db } from "../db/client";
import { skillVersionHistory } from "../db/schema";
import { makeId } from "../utils/id";

export type SkillTargetType = "module_live" | "route_override";
export type SkillActionType = "save" | "rollback" | "bootstrap";

export type SkillVersionStream = {
  capability: Capability;
  scType: ScType;
  subclass: string;
  targetType: SkillTargetType;
};

export type SkillVersionRecord = SkillVersionStream & {
  id: string;
  versionNo: number;
  actionType: SkillActionType;
  editor: string;
  changeNote: string;
  skillMd: string;
  sourceSnapshot: string;
  createdAt: Date;
};

function normalizeSubclass(value?: string) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function baseWhere(stream: SkillVersionStream) {
  return and(
    eq(skillVersionHistory.capability, stream.capability),
    eq(skillVersionHistory.scType, stream.scType),
    eq(skillVersionHistory.subclass, normalizeSubclass(stream.subclass)),
    eq(skillVersionHistory.targetType, stream.targetType),
  );
}

export async function listSkillVersionHistory(stream: SkillVersionStream) {
  const rows = await db.select().from(skillVersionHistory).where(baseWhere(stream)).orderBy(desc(skillVersionHistory.versionNo));
  return rows as SkillVersionRecord[];
}

export async function getSkillVersionDetail(versionId: string) {
  const rows = await db.select().from(skillVersionHistory).where(eq(skillVersionHistory.id, versionId));
  return (rows[0] as SkillVersionRecord | undefined) || null;
}

export async function getLatestSkillVersion(stream: SkillVersionStream) {
  const rows = await db
    .select()
    .from(skillVersionHistory)
    .where(baseWhere(stream))
    .orderBy(desc(skillVersionHistory.versionNo))
    .limit(1);
  return (rows[0] as SkillVersionRecord | undefined) || null;
}

export async function createSkillVersion(input: SkillVersionStream & {
  actionType: SkillActionType;
  editor: string;
  changeNote: string;
  skillMd: string;
  sourceSnapshot: string;
}) {
  const subclass = normalizeSubclass(input.subclass);
  const nextRows = await db
    .select({ versionNo: max(skillVersionHistory.versionNo) })
    .from(skillVersionHistory)
    .where(
      and(
        eq(skillVersionHistory.capability, input.capability),
        eq(skillVersionHistory.scType, input.scType),
        eq(skillVersionHistory.subclass, subclass),
        eq(skillVersionHistory.targetType, input.targetType),
      ),
    );

  const versionNo = Number(nextRows[0]?.versionNo || 0) + 1;
  const record = {
    id: makeId(),
    capability: input.capability,
    scType: input.scType,
    subclass,
    targetType: input.targetType,
    versionNo,
    actionType: input.actionType,
    editor: input.editor.trim(),
    changeNote: input.changeNote.trim(),
    skillMd: input.skillMd,
    sourceSnapshot: input.sourceSnapshot,
    createdAt: new Date(),
  };

  await db.insert(skillVersionHistory).values(record);
  return record;
}
