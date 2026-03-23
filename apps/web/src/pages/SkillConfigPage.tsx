import * as Select from "@radix-ui/react-select";
import { useEffect, useMemo, useState } from "react";
import { capabilityOptions, type Capability, type ModuleId, type ScType } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";

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

const skillScTypeOptions = ["all", "about", "faq"] as const;
type SkillScTypeFilter = (typeof skillScTypeOptions)[number];

const routeStatusOptions = ["all", "active", "placeholder"] as const;
type RouteStatusFilter = (typeof routeStatusOptions)[number];

const subclassFilterAll = "__all__";
const subclassFilterFallback = "__fallback__";

const faqSubclassOptions = [
  "shipping",
  "newsletter/first order/sign up",
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

export function SkillConfigPage({ moduleId }: { moduleId: ModuleId }) {
  const [capability, setCapability] = useState<Capability>("generation");
  const [scType, setScType] = useState<SkillScTypeFilter>("all");
  const [subclassFilter, setSubclassFilter] = useState<string>(subclassFilterAll);
  const [statusFilter, setStatusFilter] = useState<RouteStatusFilter>("all");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [editor, setEditor] = useState("");
  const [overwrite, setOverwrite] = useState(true);
  const [uploadedSkillFileName, setUploadedSkillFileName] = useState("");

  const normalizedSubclassFilter =
    subclassFilter === subclassFilterAll ? "" : subclassFilter === subclassFilterFallback ? "" : subclassFilter;

  const resolvedQueryScType = scType === "all" ? undefined : (scType as ScType);
  const fallbackScType = scType === "all" ? (moduleId === "about" ? "about" : "faq") : (scType as ScType);

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
    () => filteredRoutes.find((item) => `${item.capability}::${item.scType}::${item.subclass}` === selectedRouteId) || null,
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
    {
      enabled: Boolean(selectedRoute),
      refetchOnWindowFocus: false,
    },
  );

  const overrideQuery = trpc.skill.routeOverride.useQuery(
    {
      capability: selectedRoute?.capability || capability,
      scType: selectedRoute?.scType || fallbackScType,
      subclass: selectedRoute?.subclass || "",
    },
    {
      enabled: Boolean(selectedRoute) && !isLiveQualityRoute,
      refetchOnWindowFocus: false,
    },
  );

  const saveModuleMutation = trpc.skill.save.useMutation({
    onSuccess: async () => {
      await Promise.all([routesQuery.refetch(), routeDocumentQuery.refetch()]);
    },
  });

  const saveRouteMutation = trpc.skill.saveRouteOverride.useMutation({
    onSuccess: async () => {
      await Promise.all([routesQuery.refetch(), overrideQuery.refetch(), routeDocumentQuery.refetch()]);
    },
  });

  useEffect(() => {
    setSubclassFilter(subclassFilterAll);
    setStatusFilter("all");
  }, [capability, scType]);

  useEffect(() => {
    if (!filteredRoutes.length) {
      setSelectedRouteId("");
      return;
    }

    const hasCurrent = filteredRoutes.some((item) => `${item.capability}::${item.scType}::${item.subclass}` === selectedRouteId);
    if (!hasCurrent) {
      const next = filteredRoutes[0];
      setSelectedRouteId(`${next.capability}::${next.scType}::${next.subclass}`);
    }
  }, [filteredRoutes, selectedRouteId]);

  useEffect(() => {
    setEditor(routeDocumentQuery.data?.skillMd || "");
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
      });
      return;
    }

    await saveRouteMutation.mutateAsync({
      capability: selectedRoute.capability,
      scType: selectedRoute.scType,
      subclass: selectedRoute.subclass,
      skillMd: editor,
      overwrite,
    });
  }

  const currentSourceLabel = routeDocumentQuery.data?.source
    ? (documentSourceLabelMap[routeDocumentQuery.data.source] || routeDocumentQuery.data.source)
    : selectedRoute
      ? routeSourceLabelMap[selectedRoute.source]
      : "-";

  const executionBadge = isLiveQualityRoute
    ? { label: "已接管真实执行", text: "这里保存的质检 skill，会直接影响 About / FAQ 实际评分。" }
    : capability === "generation"
      ? { label: "已接入路由管理", text: "当前可查看 FAQ 输出路由、线上生效文档与覆盖配置，便于后续继续扩展自动执行。" }
      : { label: "配置阶段", text: "当前能力仍处于配置或占位阶段，修改不会直接触发线上执行。" };

  const scopeText = isLiveQualityRoute
    ? "影响范围：当前选中路由对应的 About / FAQ 质检任务。"
    : capability === "generation"
      ? "影响范围：当前 FAQ 输出路由的匹配与挂载，不影响现有质检。"
      : "影响范围：仅当前路由配置。";

  return (
    <div className="grid">
      <section className="section-header">
        <h2>Skills 配置</h2>
        <p>可按能力、SC 类型、subclass、状态筛选，并直接查看当前线上生效中的 `SKILL.md` 内容。</p>
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
            <Select.Root value={scType} onValueChange={(value) => setScType(value as SkillScTypeFilter)}>
              <Select.Trigger className="select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="select-content" position="popper" sideOffset={8}>
                  <Select.Viewport className="select-viewport">
                    {skillScTypeOptions.map((item) => (
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
                  const routeId = `${item.capability}::${item.scType}::${item.subclass}`;
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
              <p>{routeDocumentQuery.data?.message || "当前路由下已接通可直接查看的生效 SKILL.md 内容。"}</p>
            </div>

            <div className="field">
              <label className="skill-block-label">上传 SKILL.md</label>
              <label className="skill-upload-dropzone">
                <span className="skill-upload-action">选择文件</span>
                <span className="skill-upload-name">{uploadedSkillFileName || "未选择任何文件"}</span>
                <input
                  className="skill-upload-input"
                  type="file"
                  accept=".md,.txt"
                  onChange={(event) => void handleSkillFile(event.target.files?.[0] || null)}
                />
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
            </div>

            <div className="upload-actions skill-detail-actions">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => void Promise.all([routesQuery.refetch(), overrideQuery.refetch(), routeDocumentQuery.refetch()])}
              >
                刷新
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={!selectedRoute || !editor.trim() || saveRouteMutation.isPending || saveModuleMutation.isPending}
                onClick={() => void onSave()}
              >
                {saveRouteMutation.isPending || saveModuleMutation.isPending
                  ? "保存中..."
                  : isLiveQualityRoute
                    ? "保存生效 skill"
                    : "保存覆盖"}
              </button>
            </div>

            {selectedRoute?.notes ? <p className="muted">备注：{selectedRoute.notes}</p> : null}
            {saveRouteMutation.error ? <p className="error-text">{saveRouteMutation.error.message}</p> : null}
            {saveModuleMutation.error ? <p className="error-text">{saveModuleMutation.error.message}</p> : null}
            {saveRouteMutation.isSuccess || saveModuleMutation.isSuccess ? <p className="output-success-text">保存成功</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
