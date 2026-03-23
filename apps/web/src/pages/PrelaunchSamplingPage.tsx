export function PrelaunchSamplingPage() {
  return (
    <div className="grid">
      <section className="section-header">
        <h2>上线前抽检</h2>
        <p>运营上传最终准备上线的文件后，从该文件里自动抽样，AI 初筛后进入人工核验和复检闭环。</p>
      </section>

      <div className="card">
        <h3>计划流程</h3>
        <div className="sampling-flow-grid">
          <div className="sampling-step">
            <strong>1. 上传最终文件</strong>
            <span>从准备上线的最终文件中创建抽检批次，不再从评分结果反推。</span>
          </div>
          <div className="sampling-step">
            <strong>2. 自动抽样</strong>
            <span>默认抽查 100 条，不足 100 条时全量检查，并保留国家、组别、SC 类型等信息。</span>
          </div>
          <div className="sampling-step">
            <strong>3. AI 初筛</strong>
            <span>输出 AI 评分、AI 评价、AI 修改建议，作为辅助判断，不替代人工结论。</span>
          </div>
          <div className="sampling-step">
            <strong>4. 人工核验与复检</strong>
            <span>支持核验人分配、原核验人优先复检、输出人与核验人自动回避。</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>汇总表预留字段</h3>
        <pre>{`SC类型 / 国家 / 国家所属小组 / TermID / TermName / Domain / 抽查原文内容 / 原文中文翻译
AI评分 / AI评价 / AI修改建议 / 问题分类 / 问题严重程度 / 输出人 / 核验人 / 核验结果
核验备注 / 上次核验人 / 复检结果`}</pre>
      </div>

      <div className="card">
        <h3>批次处理规则</h3>
        <ul className="sampling-rule-list">
          <li>严重问题 1 条及以上：整批打回整改后重新上传复检。</li>
          <li>一般问题达到或超过抽样量 5%：整批复检。</li>
          <li>一般问题低于抽样量 5%：单点优化后复检。</li>
          <li>同一输出人连续 2 次抽检不通过：TL 介入。</li>
        </ul>
      </div>
    </div>
  );
}
