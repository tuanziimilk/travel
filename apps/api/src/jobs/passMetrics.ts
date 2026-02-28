export type PassMetricRow = {
  passOnline: unknown;
  passAi: unknown;
  passOp: unknown;
  scoreOpTotal: unknown;
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

export function collectPassMetrics(rows: PassMetricRow[]): PassMetricsPayload {
  const opEligibleRows = rows.filter((item) => item.scoreOpTotal !== null && item.scoreOpTotal !== undefined);
  const publishPassCount = rows.filter((item) => {
    const aiPass = Number(item.passAi) === 1;
    const opEligible = item.scoreOpTotal !== null && item.scoreOpTotal !== undefined;
    const opPass = opEligible && Number(item.passOp) === 1;
    return aiPass || opPass;
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
