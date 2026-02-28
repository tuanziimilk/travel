import { Link, Route, Switch, useLocation } from "wouter";
import { ManualPage } from "./pages/ManualPage";
import { UploadPage } from "./pages/UploadPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

function NavLink({ href, label }: { href: string; label: string }) {
  const [location] = useLocation();
  const active = location === href || (href === "/manual" && location === "/");
  return (
    <Link href={href}>
      <span className={`nav-btn ${active ? "active" : ""}`}>
        {label}
      </span>
    </Link>
  );
}

export default function App() {
  return (
    <div className="container">
      <section className="top-nav">
        <div className="logo-text">About 质检对比工具</div>
        <div className="btn-group">
          <nav>
            <NavLink href="/manual" label="手动评分" />
            <NavLink href="/upload" label="批量上传" />
            <NavLink href="/history" label="历史批次" />
            <NavLink href="/analytics" label="评估看板" />
          </nav>
        </div>
      </section>

      <section className="main-panel">
        <Switch>
          <Route path="/manual" component={ManualPage} />
          <Route path="/upload" component={UploadPage} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/" component={ManualPage} />
        </Switch>
      </section>
    </div>
  );
}
