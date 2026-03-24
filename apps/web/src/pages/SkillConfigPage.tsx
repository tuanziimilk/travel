import * as Select from "@radix-ui/react-select";
import { useEffect, useMemo, useState } from "react";
import { capabilityOptions, uploaderOptions, type Capability, type ModuleId, type ScType } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";
import { formatChinaDateTime } from "../utils/time";

const capabilityLabelMap: Record<Capability, string> = {
  quality: "质检",
  generation: "输出",
  sampling_prelaunch: "上线前抽检",
  sampling_postlaunch: "上线后抽检",
};

const routeStatusLabelMap = {
  active: "已启用",
  placeholder: "占位中",
} as const;

const routeSourceLabelMap = {
  route_rule: "默认规则",
  override: "覆盖配置",
} as const;

const documentSourceLabelMap: Record<string, string> = {
  file: "文件",
  override: "模块覆盖",
  fallback_about_file: "FAQ 回退 About 文件",
  route_override: "路由覆盖",
  route_rule: "默认规则",
  unavailable: "暂不可用",
};

const actionTypeLabelMap: Record<string, string> = {
  save: "保存",
  rollback: "回退",
  bootstrap: "初始化",
};

const skillScTypeOptions = ["all", "about", "faq"] as const;
type SkillScTypeFilter = (typeof skillScTypeOptions)[number];

const routeStatusOptions = ["all", "active", "placeholder"] as const;
type RouteStatusFilter = (typeof routeStatusOptions)[number];

const subclassFilterAll = "__all__";
const subclassFilterFallback = "__fallback__";

const faqSubclassOptions = [
  "shipping",
  "newsletter/first order/sign up/",
  "student",
  "military",
  "senior",
  "birthday",
  "teacher",
  "first responder",
  "child",
  "new customer",
  "nhs",
  "loyalty program",
  "employee",
  "referral",
  "existing customer",
  "app",
  "clearance",
  "family",
  "blue light card",
  "aaa",
  "gift card",
  "price guarantee",
  "return",
] as const;

function isQualityModuleRoute(capability: Capability, scType: ScType, subclass: string) {
  return capability === "quality" && subclass === "" && (scType === "about" || scType === "faq");
}

function getDisplaySubclass(subclass: string) {
  return subclass || "未命中 subclass";
}

function toRouteId(item: { capability: Capability; scType: ScType; subclass: string }) {
  return `${item.capability}::${item.scType}::${item.subclass}`;
}

export function SkillConfigPage({ moduleId }: { moduleId: ModuleId }) {
  const [capability, setCapability] = useState<Capability>("generation");
  const [scType, setScType] = useState<SkillScTypeFilter>("all");
  const [subclassFilter, setSubclassFilter] = useState<string>(subclassFilterAll);
  const [statusFilter, setStatusFilter] = useState<RouteStatusFilter>("all");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [editor, setEditor] = useState("");
  const [editorName, setEditorName] = useState<(typeof uploaderOptions)[number]>("Zoe");
  const [changeNote, setChangeNote] = useState("");
  const [overwrite, setOverwrite] = useState(true);
  const [uploadedSkillFileName, setUploadedSkillFileName] = useState("");
  const [activeHistoryVersionId, setActiveHistoryVersionId] = useState("");

  const normalizedSubclassFilter =
    subclassFilter === subclassFilterAll ? "" : subclassFilter === subclassFilterFallback ? "" : subclassFilter;

  const availableScTypeOptions = useMemo(
    () => (capability === "generation" ? (["faq"] as const) : skillScTypeOptions),
    [capability],
  );

  const resolvedQueryScType =
    capability === "generation" ? "faq" : scType === "all" ? undefined : (scType as ScType);
  const fallbackScType =
    capability === "generation" ? "faq" : scType === "all" ? (moduleId === "about" ? "about" : "faq") : (scType as ScType);

  const subclassOptions = useMemo(() => {
    if (capability === "generation") {
      return [
        { value: subclassFilterAll, label: "ALL" },
        { value: subclassFilterFallback, label: "未命中 subclass" },
        ...faqSubclassOptions.map((item) => ({ value: item, label: item })),
      ];
    }
    return [
      { value: subclassFilterAll, label: "ALL" },
      { value: subclassFilterFallback, label: "未命中 subclass" },
    ];
  }, [capability]);

  const routesQuery = trpc.skill.routes.useQuery(
    { capability, scType: resolvedQueryScType, subclass: normalizedSubclassFilter },
    { refetchOnWindowFocus: false },
  );

  const filteredRoutes = useMemo(() => {
    const items = routesQuery.data || [];
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [routesQuery.data, statusFilter]);

  const selectedRoute = useMemo(
    () => filteredRoutes.find((item) => toRouteId(item) === selectedRouteId) || null,
    [filteredRoutes, selectedRouteId],
  );

  const isLiveQualityRoute = Boolean(
    selectedRoute && isQualityModuleRoute(selectedRoute.capability, selectedRoute.scType, selectedRoute.subclass),
  );

  const routeDocumentQuery = trpc.skill.routeDocument.useQuery(
    {
      capability: selectedRoute?.capability || capability,
      scType: selectedRoute?.scType || fallbackScType,
      subclass: selectedRoute?.subclass || "",
    },
    { enabled: Boolean(selectedRoute), refetchOnWindowFocus: false },
  );

  const historyQuery = trpc.skill.history.useQuery(
    {
      capability: selectedRoute?.capability || capability,
      scType: selectedRoute?.scType || fallbackScType,
      subclass: selectedRoute?.subclass || "",
    },
    { enabled: Boolean(selectedRoute), refetchOnWindowFocus: false },
  );

  const historyDetailQuery = trpc.skill.historyDetail.useQuery(
    { versionId: activeHistoryVersionId },
    { enabled: Boolean(activeHistoryVersionId), refetchOnWindowFocus: false },
  );

  const refreshSkillState = async () => {
    await Promise.all([routesQuery.refetch(), routeDocumentQuery.refetch(), historyQuery.refetch()]);
  };

  const saveModuleMutation = trpc.skill.save.useMutation({
    onSuccess: async () => {
      await refreshSkillState();
    },
  });

  const saveRouteMutation = trpc.skill.saveRouteOverride.useMutation({
    onSuccess: async () => {
      await refreshSkillState();
    },
  });

  const rollbackMutation = trpc.skill.rollback.useMutation({
    onSuccess: async () => {
      await refreshSkillState();
      setActiveHistoryVersionId("");
    },
  });

  useEffect(() => {
    setSubclassFilter(subclassFilterAll);
    setStatusFilter("all");
  }, [capability, scType]);

  useEffect(() => {
    if (capability === "generation" && scType !== "faq") {
      setScType("faq");
    }
  }, [capability, scType]);

  useEffect(() => {
    if (!filteredRoutes.length) {
      setSelectedRouteId("");
      return;
    }
    const hasCurrent = filteredRoutes.some((item) => toRouteId(item) === selectedRouteId);
    if (!hasCurrent) {
      setSelectedRouteId(toRouteId(filteredRoutes[0]));
    }
  }, [filteredRoutes, selectedRouteId]);

  useEffect(() => {
    setEditor(routeDocumentQuery.data?.skillMd || "");
    setUploadedSkillFileName("");
    setActiveHistoryVersionId("");
  }, [routeDocumentQuery.data?.skillMd, selectedRouteId]);

  async function handleSkillFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setEditor(text);
    setUploadedSkillFileName(file.name);
  }

  async function onSave() {
    if (!selectedRoute) return;

    if (isLiveQualityRoute) {
      await saveModuleMutation.mutateAsync({
        moduleId: selectedRoute.scType as "about" | "faq",
        skillMd: editor,
        editor: editorName,
        changeNote,
      });
      return;
    }

    await saveRouteMutation.mutateAsync({
      capability: selectedRoute.capability,
      scType: selectedRoute.scType,
      subclass: selectedRoute.subclass,
      skillMd: editor,
      editor: editorName,
      changeNote,
      overwrite,
    });
  }

  async function onRollback(versionId: string, versionNo: number) {
    if (!selectedRoute) return;
    const confirmed = window.confirm(`确认回退到版本 V${versionNo} 吗？回退后会生成一条新的历史版本。`);
    if (!confirmed) return;
    await rollbackMutation.mutateAsync({
      capability: selectedRoute.capability,
      scType: selectedRoute.scType,
      subclass: selectedRoute.subclass,
      versionId,
      editor: editorName,
      changeNote,
    });
  }

  const currentSourceLabel = routeDocumentQuery.data?.source
    ? documentSourceLabelMap[routeDocumentQuery.data.source] || routeDocumentQuery.data.source
    : selectedRoute
      ? routeSourceLabelMap[selectedRoute.source]
      : "-";

  const executionBadge = isLiveQualityRoute
    ? { label: "已接管真实执行", text: "这里保存的质检 skill，会直接影响 About / FAQ 实际评分。" }
    : capability === "generation"
      ? { label: "已接入路由管理", text: "这里可以查看 FAQ 输出当前生效内容、历史版本和回退记录。" }
      : { label: "配置阶段", text: "当前能力仍处于配置阶段，修改不会直接触发线上执行。" };

  const scopeText = isLiveQualityRoute
    ? "影响范围：当前选中路由对应的 About / FAQ 质检任务。"
    : capability === "generation"
      ? "影响范围：当前 FAQ 输出路由的覆盖内容与历史版本。"
      : "影响范围：仅当前路由配置。";

  const currentContent = routeDocumentQuery.data?.skillMd?.trim() || "";
  const draftContent = editor.trim();
  const isUnchanged = Boolean(currentContent && draftContent === currentContent);
  const saveDisabled =
    !selectedRoute ||
    !draftContent ||
    !editorName.trim() ||
    !changeNote.trim() ||
    saveRouteMutation.isPending ||
    saveModuleMutation.isPending ||
    rollbackMutation.isPending;

  return (
    <div className="grid">
      <section className="section-header">
        <h2>Skills 配置</h2>
        <p>按能力、SC 类型和 subclass 查看当前生效 skill，并支持历史版本查看与回退。</p>
      </section>

      <div className="card">
        <h3>筛选面板</h3>
        <div className="skill-filter-grid skill-filter-grid-4">
          <div className="field">
            <label>能力类型</label>
            <Select.Root value={capability} onValueChange={(value) => setCapability(value as Capability)}>
              <Select.Trigger className="select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {capabilityOptions.map((item) => (
                      <Select.Item className="select-item" key={item} value={item}>
                        <Select.ItemText>{capabilityLabelMap[item]}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="field">
            <label>SC 类型</label>
            <Select.Root value={capability === "generation" ? "faq" : scType} onValueChange={(value) => setScType(value as SkillScTypeFilter)}>
              <Select.Trigger className="select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {availableScTypeOptions.map((item) => (
                      <Select.Item className="select-item" key={item} value={item}>
                        <Select.ItemText>{item === "all" ? "ALL" : item.toUpperCase()}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="field">
            <label>subclass 筛选</label>
            <Select.Root value={subclassFilter} onValueChange={setSubclassFilter}>
              <Select.Trigger className="select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {subclassOptions.map((item) => (
                      <Select.Item className="select-item" key={item.value} value={item.value}>
                        <Select.ItemText>{item.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="field">
            <label>状态筛选</label>
            <Select.Root value={statusFilter} onValueChange={(value) => setStatusFilter(value as RouteStatusFilter)}>
              <Select.Trigger className="select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {routeStatusOptions.map((item) => (
                      <Select.Item className="select-item" key={item} value={item}>
                        <Select.ItemText>{item === "all" ? "全部状态" : routeStatusLabelMap[item]}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>执行状态</h3>
        <p className="muted">
          <strong>{executionBadge.label}</strong>：{executionBadge.text}
        </p>
        <p className="muted">{scopeText}</p>
      </div>

      <div className="skill-config-layout">
        <div className="card skill-config-list-card">
          <h3>路由列表</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>能力</th>
                  <th>类型</th>
                  <th>subclass</th>
                  <th>状态</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map((item) => {
                  const routeId = toRouteId(item);
                  const active = routeId === selectedRouteId;
                  return (
                    <tr key={routeId} className={active ? "skill-route-row active" : "skill-route-row"} onClick={() => setSelectedRouteId(routeId)}>
                      <td>{capabilityLabelMap[item.capability]}</td>
                      <td>{item.scType.toUpperCase()}</td>
                      <td className="skill-subclass-cell">
                        <span className="skill-subclass-text" title={getDisplaySubclass(item.subclass)}>
                          {getDisplaySubclass(item.subclass)}
                        </span>
                      </td>
                      <td>
                        <span className={`skill-status-inline status-${item.status}`}>
                          <span className="skill-status-dot" />
                          <span>{routeStatusLabelMap[item.status]}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`skill-source-inline source-${item.source}`}>{routeSourceLabelMap[item.source]}</span>
                      </td>
                    </tr>
                  );
                })}
                {!filteredRoutes.length ? (
                  <tr>
                    <td colSpan={5}>当前筛选条件下没有可显示的路由。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {routesQuery.error ? <p className="error-text">加载路由失败：{routesQuery.error.message}</p> : null}
        </div>

        <div className="card skill-config-editor-card">
          <div className="skill-detail-head">
            <h3>Skill 详情</h3>
            <span className={`skill-status-inline status-${selectedRoute?.status || "placeholder"}`}>
              <span className="skill-status-dot" />
              <span>{selectedRoute ? routeStatusLabelMap[selectedRoute.status] : "未选择"}</span>
            </span>
          </div>

          <div className="skill-detail-divider" />

          <div className="grid skill-detail-grid">
            <div className="skill-route-meta skill-route-meta-panel">
              <span className="skill-meta-chip">能力：{selectedRoute ? capabilityLabelMap[selectedRoute.capability] : "-"}</span>
              <span className="skill-meta-chip">类型：{selectedRoute?.scType?.toUpperCase() || "-"}</span>
              <span className="skill-meta-chip skill-meta-chip-accent">subclass：{getDisplaySubclass(selectedRoute?.subclass || "")}</span>
            </div>

            <div className="skill-detail-notice">
              <strong>当前 skill key：{selectedRoute?.defaultSkillKey || "-"}</strong>
              <span>文档来源：{currentSourceLabel}</span>
              <p>{routeDocumentQuery.data?.message || "当前路由下还没有可直接查看的生效 SKILL.md 内容。"}</p>
            </div>

            <div className="field">
              <label className="skill-block-label">上传 SKILL.md</label>
              <label className="skill-upload-dropzone">
                <span className="skill-upload-action">选择文件</span>
                <span className="skill-upload-name">{uploadedSkillFileName || "未选择任何文件"}</span>
                <input className="skill-upload-input" type="file" accept=".md,.txt" onChange={(event) => void handleSkillFile(event.target.files?.[0] || null)} />
              </label>
            </div>

            {!isLiveQualityRoute ? (
              <label className="skill-overwrite-row skill-overwrite-row-panel">
                <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                <span>覆盖当前路由 skill</span>
              </label>
            ) : null}

            <div className="field">
              <label className="skill-block-label">{isLiveQualityRoute ? "线上生效中的 Skill 内容" : "Skill 内容"}</label>
              <textarea
                className="skill-editor-textarea"
                value={editor}
                onChange={(event) => setEditor(event.target.value)}
                placeholder="可直接粘贴 SKILL.md，或通过上方上传文件导入。"
              />
              {isUnchanged ? <p className="muted">当前草稿与线上生效内容一致；如继续保存，仍会生成一条历史版本。</p> : null}
            </div>

            <div className="skill-edit-meta-grid">
              <div className="field">
                <label className="skill-block-label">修改人</label>
                <Select.Root value={editorName} onValueChange={(value) => setEditorName(value as (typeof uploaderOptions)[number])}>
                  <Select.Trigger className="select-trigger">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="select-content" position="popper" sideOffset={8}>
                      <Select.Viewport className="select-viewport">
                        {uploaderOptions.map((item) => (
                          <Select.Item className="select-item" key={item} value={item}>
                            <Select.ItemText>{item}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <div className="field">
                <label className="skill-block-label">修改备注</label>
                <input
                  className="input"
                  value={changeNote}
                  maxLength={255}
                  onChange={(event) => setChangeNote(event.target.value)}
                  placeholder="例如：修复错误覆盖，恢复优惠资格描述"
                />
              </div>
            </div>

            <div className="upload-actions skill-detail-actions">
              <button className="btn-ghost" type="button" onClick={() => void refreshSkillState()}>
                刷新
              </button>
              <button className="btn-primary" type="button" disabled={saveDisabled} onClick={() => void onSave()}>
                {saveRouteMutation.isPending || saveModuleMutation.isPending ? "保存中..." : isLiveQualityRoute ? "保存生效 skill" : "保存覆盖"}
              </button>
            </div>

            {saveRouteMutation.error ? <p className="error-text">{saveRouteMutation.error.message}</p> : null}
            {saveModuleMutation.error ? <p className="error-text">{saveModuleMutation.error.message}</p> : null}
            {rollbackMutation.error ? <p className="error-text">{rollbackMutation.error.message}</p> : null}

            <div className="skill-history-panel">
              <div className="skill-history-head">
                <h4>历史版本</h4>
                <span className="skill-history-count">共 {historyQuery.data?.length || 0} 条</span>
              </div>
              <div className="skill-version-list">
                {(historyQuery.data || []).map((item, index) => {
                  const rollbackDisabled = !editorName.trim() || !changeNote.trim() || rollbackMutation.isPending;
                  return (
                    <div className="skill-version-card" key={item.id}>
                      <div className="skill-version-header-row">
                        <div className="skill-version-top-row">
                          <span className={`skill-history-version-pill${index > 0 ? " is-muted" : ""}`}>V{item.versionNo}</span>
                          <span className="skill-version-author">{item.editor}</span>
                        </div>
                        <div className="skill-version-actions">
                          <button className="btn-micro" type="button" onClick={() => setActiveHistoryVersionId(item.id)}>
                            查看
                          </button>
                          <button
                            className="btn-micro"
                            type="button"
                            disabled={rollbackDisabled}
                            onClick={() => void onRollback(item.id, item.versionNo)}
                          >
                            回退
                          </button>
                        </div>
                      </div>
                      <div className="skill-version-time">{formatChinaDateTime(item.createdAt)}</div>
                      {item.changeNote ? <div className="skill-version-remark" title={item.changeNote}>{item.changeNote}</div> : null}
                    </div>
                  );
                })}
                {!historyQuery.isLoading && !historyQuery.data?.length ? <div className="skill-history-empty">当前 skill 暂无历史版本。</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeHistoryVersionId ? (
        <div className="history-detail-overlay" role="dialog" aria-modal="true" onClick={() => setActiveHistoryVersionId("")}>
          <div className="history-detail-card skill-history-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="history-detail-head">
              <h3>历史版本详情</h3>
              <button className="history-detail-close" type="button" aria-label="关闭详情" onClick={() => setActiveHistoryVersionId("")}>
                ×
              </button>
            </div>

            <div className="skill-history-compare-grid">
              <div className="skill-history-compare-head skill-history-compare-head-history">历史版本</div>
              <div className="skill-history-compare-head skill-history-compare-head-current">当前生效内容</div>

              <div className="skill-history-version-meta skill-history-version-meta-history">
                <span>版本：V{historyDetailQuery.data?.versionNo || "-"}</span>
                <span>修改人：{historyDetailQuery.data?.editor || "-"}</span>
                <span>时间：{formatChinaDateTime(historyDetailQuery.data?.createdAt)}</span>
                <span>备注：{historyDetailQuery.data?.changeNote || "-"}</span>
              </div>
              <div className="skill-history-version-meta skill-history-version-meta-current">
                <span>来源：{currentSourceLabel}</span>
                <span>当前路由：{selectedRoute?.defaultSkillKey || "-"}</span>
              </div>

              <textarea className="skill-history-textarea" readOnly value={historyDetailQuery.data?.skillMd || ""} />
              <textarea className="skill-history-textarea" readOnly value={routeDocumentQuery.data?.skillMd || ""} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
