import * as Accordion from "@radix-ui/react-accordion";
import * as Select from "@radix-ui/react-select";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { AiModel, ModuleId } from "@about-demo/trpc";
import { trpc } from "./lib/trpc";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { FaqAnalyticsPage } from "./pages/FaqAnalyticsPage";
import { FaqHistoryPage } from "./pages/FaqHistoryPage";
import { FaqManualPage } from "./pages/FaqManualPage";
import { FaqOutputHistoryPage } from "./pages/FaqOutputHistoryPage";
import { FaqOutputPage } from "./pages/FaqOutputPage";
import { FaqUploadPage } from "./pages/FaqUploadPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ManualPage } from "./pages/ManualPage";
import { PostlaunchSamplingPage } from "./pages/PostlaunchSamplingPage";
import { PrelaunchSamplingPage } from "./pages/PrelaunchSamplingPage";
import { SkillConfigPage } from "./pages/SkillConfigPage";
import { UploadPage } from "./pages/UploadPage";

type WorkspaceId = "quality" | "output" | "sampling-pre" | "sampling-post" | "skills";
type QualityPageId = "manual" | "upload" | "history" | "analytics";
type OutputPageId = "faq" | "history";
type AppPageId = QualityPageId | OutputPageId;

function sectionForWorkspace(workspaceId: WorkspaceId) {
  if (workspaceId === "sampling-pre" || workspaceId === "sampling-post") return "sampling";
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

  return { workspaceId, moduleId: "faq", pageId: "manual" };
}

function workspaceLabel(workspaceId: WorkspaceId) {
  if (workspaceId === "quality") return "内容质检";
  if (workspaceId === "output") return "内容输出";
  if (workspaceId === "sampling-pre") return "上线前抽检";
  if (workspaceId === "sampling-post") return "上线后抽检";
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

export default function App() {
  const [location] = useLocation();
  const { workspaceId, moduleId, pageId } = parseLocation(location);
  const [openSections, setOpenSections] = useState<string[]>([sectionForWorkspace(workspaceId)]);
  const utils = trpc.useUtils();
  const aiConfigQuery = trpc.runtime.aiConfig.get.useQuery();
  const aiConfigSetMutation = trpc.runtime.aiConfig.set.useMutation({
    onSuccess: () => {
      void utils.runtime.aiConfig.get.invalidate();
    },
  });

  const handleModelChange = (value: string) => {
    if (!value || aiConfigSetMutation.isPending) return;
    aiConfigSetMutation.mutate({ aiModel: value as AiModel });
  };

  useEffect(() => {
    const activeSection = sectionForWorkspace(workspaceId);
    setOpenSections((current) => (current.includes(activeSection) ? current : [...current, activeSection]));
  }, [workspaceId]);

  const renderPage = () => {
    if (workspaceId === "output") {
      if (pageId === "history") return <FaqOutputHistoryPage />;
      return <FaqOutputPage />;
    }
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

            <SidebarGroup value="skills" title="Skills 配置">
              <div className="sidebar-subnav">
                <NavLink href="/skills/faq" label="Skills 管理面板" activePrefix="/skills/" />
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
                  value={aiConfigQuery.data?.aiModel || ""}
                  onValueChange={handleModelChange}
                  disabled={aiConfigQuery.isLoading || aiConfigSetMutation.isPending}
                >
                  <Select.Trigger className="select-trigger model-switch-trigger" aria-label="runtime-ai-model-select">
                    <Select.Value placeholder="选择模型" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="select-content model-switch-content" position="popper" sideOffset={8}>
                      <Select.Viewport className="select-viewport">
                        {(aiConfigQuery.data?.availableModels || []).map((model) => (
                          <Select.Item className="select-item model-switch-item" key={model} value={model}>
                            <Select.ItemText>{model}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <span className="module-chip">{workspaceLabel(workspaceId)}</span>
            </div>
          </section>

          <section className="main-panel">{renderPage()}</section>
        </div>
      </div>
    </div>
  );
}
