export function PostlaunchSamplingPage() {
  return (
    <div className="grid">
      <section className="section-header">
        <h2>上线后抽检</h2>
        <p>市场 TL 在前台页面做随机抽检，记录展示问题、内容问题和问题归因，并回溯到上线前抽检结果。</p>
      </section>

      <div className="card">
        <h3>抽检范围</h3>
        <ul className="sampling-rule-list">
          <li>每批次至少抽检 10-20 个前台页面。</li>
          <li>覆盖不同板块、不同输出人、不同国家/域名。</li>
          <li>重点检查前台展示、商家名变量、FAQ/ST 自然度、AI 感和前端拼接异常。</li>
        </ul>
      </div>

      <div className="card">
        <h3>问题归因预留</h3>
        <table>
          <thead>
            <tr>
              <th>问题类型</th>
              <th>归因方向</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>单页问题</td>
              <td>页面修复</td>
              <td>安排修复并复查，记录问题页面与复查结果。</td>
            </tr>
            <tr>
              <td>批量问题</td>
              <td>回溯批次</td>
              <td>追查是工具漏判、人工遗漏、规则不清还是上线展示问题。</td>
            </tr>
            <tr>
              <td>高频问题</td>
              <td>规则升级</td>
              <td>同一国家/板块连续高频出现时，提升抽检比例或转阶段性全检。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
