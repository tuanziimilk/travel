export type PassMetricRow = {
  passOnline: unknown;
  passAi: unknown;
  passOp: unknown;
  scoreOpTotal: unknown;
  scoreOnlineTotal?: unknown;
  scoreAiTotal?: unknown;
};

export type PublishCandidateVersion = "ai" | "op";

export type PublishCandidateDecision = {
  publish: boolean;
  selectedVersion: PublishCandidateVersion | null;
};

export type PassMetricsPayload = {
  validRowCount: number;
  opEligibleRowCount: number;
  hasOpData: boolean;
  publishPassCount: number;
  publishPassRate: number;
  onlinePassCount: number;
  aiPassCount: number;
  opPassCount: number;
  onlinePassRate: number;
  aiPassRate: number;
  opPassRate: number;
  aiPassLift: number;
  opPassLift: number;
};

export function ratePercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function pickAboutPublishCandidate(row: PassMetricRow): PublishCandidateDecision {
  const onlineScore = Number(row.scoreOnlineTotal ?? 0);
  const aiScore = Number(row.scoreAiTotal ?? 0);
  const hasOpScore = row.scoreOpTotal !== null && row.scoreOpTotal !== undefined && row.scoreOpTotal !== "";
  const opScore = hasOpScore ? Number(row.scoreOpTotal) : Number.NEGATIVE_INFINITY;

  const aiEligible = aiScore > onlineScore && aiScore > 8;
  const opEligible = hasOpScore && opScore > onlineScore && opScore > 8;

  if (aiEligible && opEligible) {
    return {
      publish: true,
      selectedVersion: opScore >= aiScore ? "op" : "ai",
    };
  }

  if (opEligible) return { publish: true, selectedVersion: "op" };
  if (aiEligible) return { publish: true, selectedVersion: "ai" };
  return { publish: false, selectedVersion: null };
}

export function collectPassMetrics(
  rows: PassMetricRow[],
  options?: {
    publishDecider?: (row: PassMetricRow) => PublishCandidateDecision;
  },
): PassMetricsPayload {
  const opEligibleRows = rows.filter((item) => item.scoreOpTotal !== null && item.scoreOpTotal !== undefined);
  const publishPassCount = rows.filter((item) => {
    if (options?.publishDecider) return options.publishDecider(item).publish;
    const onlinePass = Number(item.passOnline) === 1;
    const aiPass = Number(item.passAi) === 1;
    const opEligible = item.scoreOpTotal !== null && item.scoreOpTotal !== undefined;
    const opPass = opEligible && Number(item.passOp) === 1;
    return onlinePass || aiPass || opPass;
  }).length;
  const onlinePassCount = rows.filter((item) => Number(item.passOnline) === 1).length;
  const aiPassCount = rows.filter((item) => Number(item.passAi) === 1).length;
  const opPassCount = opEligibleRows.filter((item) => Number(item.passOp) === 1).length;
  const validRowCount = rows.length;
  const opEligibleRowCount = opEligibleRows.length;
  const hasOpData = opEligibleRowCount > 0;

  const publishPassRate = ratePercent(publishPassCount, validRowCount);
  const onlinePassRate = ratePercent(onlinePassCount, validRowCount);
  const aiPassRate = ratePercent(aiPassCount, validRowCount);
  const opPassRate = ratePercent(opPassCount, opEligibleRowCount);

  return {
    validRowCount,
    opEligibleRowCount,
    hasOpData,
    publishPassCount,
    publishPassRate,
    onlinePassCount,
    aiPassCount,
    opPassCount,
    onlinePassRate,
    aiPassRate,
    opPassRate,
    aiPassLift: Math.round((aiPassRate - onlinePassRate) * 10) / 10,
    opPassLift: Math.round((opPassRate - aiPassRate) * 10) / 10,
  };
}
