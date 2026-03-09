import { Link, useLocation } from "wouter";
import * as Select from "@radix-ui/react-select";
import { moduleOptions, type AiModel, type ModuleId } from "@about-demo/trpc";
import { trpc } from "./lib/trpc";
import { ManualPage } from "./pages/ManualPage";
import { UploadPage } from "./pages/UploadPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { SkillConfigPage } from "./pages/SkillConfigPage";
import { FaqManualPage } from "./pages/FaqManualPage";
import { FaqUploadPage } from "./pages/FaqUploadPage";
import { FaqHistoryPage } from "./pages/FaqHistoryPage";
import { FaqAnalyticsPage } from "./pages/FaqAnalyticsPage";

function NavLink({ href, label, tone = "page" }: { href: string; label: string; tone?: "module" | "page" }) {
  const [location] = useLocation();
  const active = location === href;
  return (
    <Link href={href}>
      <span className={`nav-btn nav-btn-${tone} ${active ? (tone === "module" ? "active-module" : "active") : ""}`}>{label}</span>
    </Link>
  );
}

const pageOptions = ["manual", "upload", "history", "analytics", "skills"] as const;
type PageId = (typeof pageOptions)[number];

function parseLocation(path: string): { moduleId: ModuleId; pageId: PageId } {
  const parts = path.split("/").filter(Boolean);
  const maybeModule = parts[0] as ModuleId | undefined;
  const maybePage = parts[1] as PageId | undefined;

  const moduleId: ModuleId = moduleOptions.includes(maybeModule as ModuleId) ? (maybeModule as ModuleId) : "about";
  const pageId: PageId = pageOptions.includes(maybePage as PageId)
    ? (maybePage as PageId)
    : moduleOptions.includes(maybeModule as ModuleId)
      ? "manual"
      : pageOptions.includes(maybeModule as PageId)
        ? (maybeModule as PageId)
        : "manual";

  return { moduleId, pageId };
}

function moduleLabel(moduleId: ModuleId) {
  if (moduleId === "about") return "About 质检";
  if (moduleId === "faq") return "FAQ 质检";
  return moduleId;
}

export default function App() {
  const [location] = useLocation();
  const { moduleId, pageId } = parseLocation(location);
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

  const renderPage = () => {
    if (moduleId === "faq") {
      if (pageId === "manual") return <FaqManualPage />;
      if (pageId === "upload") return <FaqUploadPage />;
      if (pageId === "history") return <FaqHistoryPage />;
      if (pageId === "analytics") return <FaqAnalyticsPage />;
      return <SkillConfigPage moduleId={moduleId} />;
    }
    if (pageId === "manual") return <ManualPage />;
    if (pageId === "upload") return <UploadPage />;
    if (pageId === "history") return <HistoryPage />;
    if (pageId === "analytics") return <AnalyticsPage />;
    return <SkillConfigPage moduleId={moduleId} />;
  };

  return (
    <div className={`app-shell app-theme-${moduleId}`}>
      <aside className="app-sidebar">
        <div className="sidebar-panel">
          <section className="sidebar-group">
            <div className="sidebar-title">板块切换</div>
            <nav className="sidebar-nav sidebar-nav-module">
              {moduleOptions.map((item) => (
                <NavLink key={item} href={`/${item}/${pageId}`} label={moduleLabel(item)} tone="module" />
              ))}
            </nav>
          </section>

          <section className="sidebar-group" style={{ marginTop: 14 }}>
            <div className="sidebar-title-row">
              <div className="sidebar-title">功能导航</div>
              <span className="sidebar-mini-tag">{moduleId.toUpperCase()}</span>
            </div>
            <nav className="sidebar-nav sidebar-nav-page">
              <NavLink href={`/${moduleId}/manual`} label="手动评分" />
              <NavLink href={`/${moduleId}/upload`} label="批量上传" />
              <NavLink href={`/${moduleId}/history`} label="历史批次" />
              <NavLink href={`/${moduleId}/analytics`} label="评估看板" />
              <NavLink href={`/${moduleId}/skills`} label="规则配置" />
            </nav>
          </section>
        </div>
      </aside>

      <div className="app-content">
        <div className="container">
          <section className="top-nav">
            <div className="logo-text">内容质检对比工具</div>
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
              <span className="module-chip">当前板块：{moduleLabel(moduleId)}</span>
            </div>
          </section>

          <section className="main-panel">{renderPage()}</section>
        </div>
      </div>
    </div>
  );
}

