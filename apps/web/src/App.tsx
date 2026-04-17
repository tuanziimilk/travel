import * as Accordion from "@radix-ui/react-accordion";
import * as Select from "@radix-ui/react-select";
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { categoryCalibrationDefaultAiModel, translationDefaultAiModel, type AiModel, type ModuleId } from "@about-demo/trpc";
import { trpc } from "./lib/trpc";

const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })));
const FaqAnalyticsPage = lazy(() => import("./pages/FaqAnalyticsPage").then((module) => ({ default: module.FaqAnalyticsPage })));
const FaqHistoryPage = lazy(() => import("./pages/FaqHistoryPage").then((module) => ({ default: module.FaqHistoryPage })));
const FaqManualPage = lazy(() => import("./pages/FaqManualPage").then((module) => ({ default: module.FaqManualPage })));
const FaqOutputHistoryPage = lazy(() => import("./pages/FaqOutputHistoryPage").then((module) => ({ default: module.FaqOutputHistoryPage })));
const FaqOutputPage = lazy(() => import("./pages/FaqOutputPage").then((module) => ({ default: module.FaqOutputPage })));
const FaqUploadPage = lazy(() => import("./pages/FaqUploadPage").then((module) => ({ default: module.FaqUploadPage })));
const GgCleaningPage = lazy(() => import("./pages/GgCleaningPage").then((module) => ({ default: module.GgCleaningPage })));
const CategoryCalibrationPage = lazy(() =>
  import("./pages/CategoryCalibrationPage").then((module) => ({ default: module.CategoryCalibrationPage })),
);
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const ManualPage = lazy(() => import("./pages/ManualPage").then((module) => ({ default: module.ManualPage })));
const PostlaunchSamplingPage = lazy(() =>
  import("./pages/PostlaunchSamplingPage").then((module) => ({ default: module.PostlaunchSamplingPage })),
);
const PrelaunchSamplingPage = lazy(() =>
  import("./pages/PrelaunchSamplingPage").then((module) => ({ default: module.PrelaunchSamplingPage })),
);
const SkillConfigPage = lazy(() => import("./pages/SkillConfigPage").then((module) => ({ default: module.SkillConfigPage })));
const TranslationBatchPage = lazy(() =>
  import("./pages/TranslationBatchPage").then((module) => ({ default: module.TranslationBatchPage })),
);
const TranslationTextPage = lazy(() =>
  import("./pages/TranslationTextPage").then((module) => ({ default: module.TranslationTextPage })),
);
const UploadPage = lazy(() => import("./pages/UploadPage").then((module) => ({ default: module.UploadPage })));

type WorkspaceId =
  | "quality"
  | "output"
  | "sampling-pre"
  | "sampling-post"
  | "skills"
  | "translation"
  | "gg-cleaning"
  | "category-calibration";
type QualityPageId = "manual" | "upload" | "history" | "analytics";
type OutputPageId = "faq" | "history";
type TranslationPageId = "batch" | "text";
type AppPageId = QualityPageId | OutputPageId | TranslationPageId | "batch";

function sectionForWorkspace(workspaceId: WorkspaceId) {
  if (workspaceId === "sampling-pre" || workspaceId === "sampling-post") return "sampling";
  if (workspaceId === "category-calibration") return "other-tools";
  if (workspaceId === "gg-cleaning") return "other-tools";
  return workspaceId;
}

function NavLink({
  href,
  label,
  activePrefix,
}: {
  href: string;
  label: string;
  activePrefix?: string;
}) {
  const [location] = useLocation();
  const active = activePrefix ? location.startsWith(activePrefix) : location === href;
  const slashIndex = label.indexOf("/");
  const prefix = slashIndex >= 0 ? label.slice(0, slashIndex + 1).trim() : "";
  const suffix = slashIndex >= 0 ? label.slice(slashIndex + 1).trim() : label;
  return (
    <Link href={href}>
      <span className={`nav-btn sidebar-subnav-btn ${active ? "active" : ""}`}>
        {prefix ? <span className="sidebar-subnav-prefix">{prefix}</span> : null}
        <span>{suffix}</span>
      </span>
    </Link>
  );
}

function parseLocation(path: string): {
  workspaceId: WorkspaceId;
  moduleId: ModuleId;
  pageId: AppPageId;
} {
  const parts = path.split("/").filter(Boolean);
  const workspaceId = (parts[0] as WorkspaceId) || "quality";

  if (workspaceId === "quality") {
    const moduleId = (parts[1] as ModuleId) || "about";
    const pageId = (parts[2] as QualityPageId) || "manual";
    return { workspaceId, moduleId, pageId };
  }

  if (workspaceId === "skills") {
    const moduleId = (parts[1] as ModuleId) || "faq";
    return { workspaceId, moduleId, pageId: "manual" };
  }

  if (workspaceId === "output") {
    const pageId = (parts[1] as OutputPageId) || "faq";
    return { workspaceId, moduleId: "faq", pageId };
  }

  if (workspaceId === "translation") {
    const pageId = (parts[1] as TranslationPageId) || "batch";
    return { workspaceId, moduleId: "faq", pageId };
  }

  if (workspaceId === "gg-cleaning" || workspaceId === "category-calibration") {
    return { workspaceId, moduleId: "faq", pageId: "batch" };
  }

  return { workspaceId: "quality", moduleId: "faq", pageId: "manual" };
}

function workspaceLabelNext(workspaceId: WorkspaceId) {
  if (workspaceId === "quality") return "内容质检";
  if (workspaceId === "output") return "内容输出";
  if (workspaceId === "sampling-pre") return "上线前抽检";
  if (workspaceId === "sampling-post") return "上线后抽检";
  if (workspaceId === "translation") return "翻译工具";
  if (workspaceId === "gg-cleaning") return "GG采集数据清洗工具";
  if (workspaceId === "category-calibration") return "Category 校准工具";
  return "Skills 配置";
}

function qualityModuleLabel(moduleId: ModuleId) {
  return moduleId === "about" ? "About" : "FAQ";
}

function qualityModuleHref(moduleId: ModuleId, pageId: QualityPageId) {
  return `/quality/${moduleId}/${pageId}`;
}

function SidebarGroup({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Accordion.Item className="sidebar-accordion-item" value={value}>
      <Accordion.Header>
        <Accordion.Trigger className="sidebar-accordion-trigger">
          <span>{title}</span>
          <span className="sidebar-accordion-arrow" aria-hidden="true" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="sidebar-accordion-content">{children}</Accordion.Content>
    </Accordion.Item>
  );
}

function PageSkeleton() {
  return (
    <div className="card">
      <h3>页面加载中</h3>
      <p className="muted">正在加载当前工作区内容。</p>
    </div>
  );
}

export default function App() {
  const [location] = useLocation();
  const { workspaceId, moduleId, pageId } = parseLocation(location);
  const [openSections, setOpenSections] = useState<string[]>([sectionForWorkspace(workspaceId)]);
  const utils = trpc.useUtils();
  const aiConfigQuery = trpc.runtime.aiConfig.get.useQuery();
  const categoryAiConfigQuery = trpc.runtime.categoryCalibrationAiConfig.get.useQuery();
  const aiConfigSetMutation = trpc.runtime.aiConfig.set.useMutation({
    onSuccess: () => {
      void utils.runtime.aiConfig.get.invalidate();
    },
  });
  const categoryAiConfigSetMutation = trpc.runtime.categoryCalibrationAiConfig.set.useMutation({
    onSuccess: () => {
      void utils.runtime.categoryCalibrationAiConfig.get.invalidate();
    },
  });
  const isTranslationWorkspace = workspaceId === "translation";
  const isGgCleaningWorkspace = workspaceId === "gg-cleaning";
  const isCategoryCalibrationWorkspace = workspaceId === "category-calibration";
  const categoryDefaultAppliedRef = useRef(false);
  const currentModelValue = isGgCleaningWorkspace
    ? "无需AI"
    : isTranslationWorkspace
      ? translationDefaultAiModel
      : isCategoryCalibrationWorkspace
        ? categoryAiConfigQuery.data?.aiModel || categoryCalibrationDefaultAiModel
        : aiConfigQuery.data?.aiModel || "";
  const modelOptions = isGgCleaningWorkspace
    ? ["无需AI"]
    : isTranslationWorkspace
      ? [translationDefaultAiModel]
      : isCategoryCalibrationWorkspace
        ? categoryAiConfigQuery.data?.availableModels || []
        : aiConfigQuery.data?.availableModels || [];

  const handleModelChange = (value: string) => {
    if (!value) return;
    if (isCategoryCalibrationWorkspace) {
      if (categoryAiConfigSetMutation.isPending) return;
      categoryAiConfigSetMutation.mutate({ aiModel: value as AiModel });
      return;
    }
    if (aiConfigSetMutation.isPending) return;
    aiConfigSetMutation.mutate({ aiModel: value as AiModel });
  };

  useEffect(() => {
    const activeSection = sectionForWorkspace(workspaceId);
    setOpenSections((current) => (current.includes(activeSection) ? current : [...current, activeSection]));
  }, [workspaceId]);

  useEffect(() => {
    if (!isCategoryCalibrationWorkspace) {
      categoryDefaultAppliedRef.current = false;
      return;
    }
    if (categoryDefaultAppliedRef.current) return;
    if (categoryAiConfigQuery.isLoading || categoryAiConfigSetMutation.isPending) return;
    const current = categoryAiConfigQuery.data?.aiModel || "";
    if (current === categoryCalibrationDefaultAiModel) {
      categoryDefaultAppliedRef.current = true;
      return;
    }
    categoryDefaultAppliedRef.current = true;
    categoryAiConfigSetMutation.mutate({ aiModel: categoryCalibrationDefaultAiModel as AiModel });
  }, [
    categoryAiConfigQuery.data?.aiModel,
    categoryAiConfigQuery.isLoading,
    categoryAiConfigSetMutation,
    categoryAiConfigSetMutation.isPending,
    isCategoryCalibrationWorkspace,
  ]);

  const renderPage = () => {
    if (workspaceId === "output") {
      if (pageId === "history") return <FaqOutputHistoryPage />;
      return <FaqOutputPage />;
    }

    if (workspaceId === "translation") {
      if (pageId === "text") return <TranslationTextPage />;
      return <TranslationBatchPage />;
    }

    if (workspaceId === "gg-cleaning") return <GgCleaningPage />;
    if (workspaceId === "category-calibration") return <CategoryCalibrationPage />;
    if (workspaceId === "sampling-pre") return <PrelaunchSamplingPage />;
    if (workspaceId === "sampling-post") return <PostlaunchSamplingPage />;
    if (workspaceId === "skills") return <SkillConfigPage moduleId={moduleId} />;

    if (moduleId === "faq") {
      if (pageId === "manual") return <FaqManualPage />;
      if (pageId === "upload") return <FaqUploadPage />;
      if (pageId === "history") return <FaqHistoryPage />;
      return <FaqAnalyticsPage />;
    }

    if (pageId === "manual") return <ManualPage />;
    if (pageId === "upload") return <UploadPage />;
    if (pageId === "history") return <HistoryPage />;
    return <AnalyticsPage />;
  };

  return (
    <div className={`app-shell app-theme-${workspaceId === "quality" ? moduleId : "faq"}`}>
      <aside className="app-sidebar">
        <div className="sidebar-panel">
          <div className="sidebar-title">工作台分区</div>
          <Accordion.Root className="sidebar-accordion" type="multiple" value={openSections} onValueChange={setOpenSections}>
            <SidebarGroup value="quality" title="内容质检">
              <div className="sub-tab-switch">
                <Link href={qualityModuleHref("about", (pageId as QualityPageId) || "manual")}>
                  <span className={`tab-btn ${moduleId === "about" ? "active" : ""}`}>ABOUT</span>
                </Link>
                <Link href={qualityModuleHref("faq", (pageId as QualityPageId) || "manual")}>
                  <span className={`tab-btn ${moduleId === "faq" ? "active" : ""}`}>FAQ</span>
                </Link>
              </div>
              <div className="sidebar-subnav">
                <NavLink href={`/quality/${moduleId}/manual`} label={`${qualityModuleLabel(moduleId)} / 手动评分`} activePrefix={`/quality/${moduleId}/manual`} />
                <NavLink href={`/quality/${moduleId}/upload`} label={`${qualityModuleLabel(moduleId)} / 批量上传`} activePrefix={`/quality/${moduleId}/upload`} />
                <NavLink href={`/quality/${moduleId}/history`} label={`${qualityModuleLabel(moduleId)} / 历史批次`} activePrefix={`/quality/${moduleId}/history`} />
                <NavLink href={`/quality/${moduleId}/analytics`} label={`${qualityModuleLabel(moduleId)} / 评估看板`} activePrefix={`/quality/${moduleId}/analytics`} />
              </div>
            </SidebarGroup>

            <SidebarGroup value="output" title="内容输出">
              <div className="sidebar-subnav sidebar-subnav-output">
                <NavLink href="/output/faq" label="FAQ / 输出" activePrefix="/output/faq" />
                <NavLink href="/output/history" label="FAQ / 历史结果" activePrefix="/output/history" />
              </div>
            </SidebarGroup>

            <SidebarGroup value="sampling" title="抽检">
              <div className="sidebar-subnav">
                <NavLink href="/sampling-pre" label="上线前抽检 / 抽检任务" activePrefix="/sampling-pre" />
                <NavLink href="/sampling-post" label="上线后抽检 / TL 抽检" activePrefix="/sampling-post" />
              </div>
            </SidebarGroup>

            <SidebarGroup value="translation" title="翻译工具">
              <div className="sidebar-subnav">
                <NavLink href="/translation/batch" label="批量翻译" activePrefix="/translation/batch" />
                <NavLink href="/translation/text" label="文本翻译" activePrefix="/translation/text" />
              </div>
            </SidebarGroup>

            <SidebarGroup value="skills" title="Skills 配置">
              <div className="sidebar-subnav">
                <NavLink href="/skills/faq" label="Skills 管理面板" activePrefix="/skills/" />
              </div>
            </SidebarGroup>

            <SidebarGroup value="other-tools" title="其他工具">
              <div className="sidebar-subnav">
                <NavLink href="/gg-cleaning" label="GG采集数据清洗工具" activePrefix="/gg-cleaning" />
                <NavLink href="/category-calibration" label="Category校准工具" activePrefix="/category-calibration" />
              </div>
            </SidebarGroup>
          </Accordion.Root>
        </div>
      </aside>

      <div className="app-content">
        <div className="container">
          <section className="top-nav">
            <div className="logo-text">SC 内容生产与质检工具</div>
            <div className="btn-group">
              <div className="model-switch" aria-label="runtime-ai-model">
                <span className="model-switch-label">模型</span>
                <Select.Root
                  value={currentModelValue}
                  onValueChange={handleModelChange}
                  disabled={
                    isTranslationWorkspace ||
                    isGgCleaningWorkspace ||
                    (isCategoryCalibrationWorkspace
                      ? categoryAiConfigQuery.isLoading || categoryAiConfigSetMutation.isPending
                      : aiConfigQuery.isLoading || aiConfigSetMutation.isPending)
                  }
                >
                  <Select.Trigger className="select-trigger model-switch-trigger" aria-label="runtime-ai-model-select">
                    <Select.Value placeholder="选择模型" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="select-content model-switch-content" position="popper" sideOffset={8}>
                      <Select.Viewport className="select-viewport">
                        {modelOptions.map((model) => (
                          <Select.Item className="select-item model-switch-item" key={model} value={model}>
                            <Select.ItemText>{model}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <span className="module-chip">{workspaceLabelNext(workspaceId)}</span>
            </div>
          </section>

          <section className="main-panel">
            <Suspense fallback={<PageSkeleton />}>{renderPage()}</Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
