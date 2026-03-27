import { useState } from "react";
import { translationDefaultTargetLanguage, translationTextMaxChars } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";

function formatUsd(value?: number | string | null) {
  return `$${Number(value || 0).toFixed(6)}`;
}

export function TranslationTextPage() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const runMutation = trpc.translation.runText.useMutation();

  async function runTranslation() {
    if (!text.trim()) {
      setError("请输入需要翻译的文本。");
      return;
    }
    setError("");
    try {
      await runMutation.mutateAsync({
        text,
        targetLanguage: translationDefaultTargetLanguage,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "文本翻译失败";
      setError(message.includes("超过") ? `${message}，建议切换到批量翻译页处理。` : message);
    }
  }

  async function copyResult() {
    if (!runMutation.data?.translatedText) return;
    await navigator.clipboard.writeText(runMutation.data.translatedText);
  }

  function clearAll() {
    setText("");
    setError("");
    runMutation.reset();
  }

  function swapToRetry() {
    if (!runMutation.data?.translatedText) return;
    setText(runMutation.data.translatedText);
    runMutation.reset();
  }

  const result = runMutation.data;

  return (
    <div className="grid translation-page">
      <section className="section-header">
        <h2>文本翻译</h2>
        <p>粘贴任意语种或混合语种文本，系统会统一翻译为简体中文，适合快速处理单段或多段内容。</p>
      </section>

      <div className="card translation-target-card">
        <div className="translation-target-head">
          <div>
            <h3>目标语言</h3>
            <p className="muted">首期固定输出为简体中文，减少重复设置和误操作。</p>
          </div>
          <span className="translation-target-tip">固定输出</span>
        </div>

        <div className="translation-single-language-row">
          <input value={translationDefaultTargetLanguage} readOnly />
        </div>
      </div>

      <div className="translation-text-layout">
        <div className="card translation-pane translation-pane-input">
          <div className="translation-step-head">
            <span className="translation-step-index">1</span>
            <div>
              <h3>输入原文</h3>
              <p className="muted">支持混合语种内容。内容过长时建议切换到批量翻译。</p>
            </div>
          </div>

          <div className="field">
            <textarea
              className="translation-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="粘贴需要统一翻译的文本"
            />
            <div className="count-mode-tip-wrap">
              <span className="count-mode-tip">{text.length}/{translationTextMaxChars}</span>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="translation-inline-actions">
            <button className="btn-primary output-inline-btn" type="button" disabled={runMutation.isPending} onClick={() => void runTranslation()}>
              {runMutation.isPending ? "翻译中..." : "开始翻译"}
            </button>
            <button className="btn-ghost output-inline-btn" type="button" onClick={clearAll}>
              清空
            </button>
          </div>
        </div>

        <div className={`card translation-pane translation-pane-result${result ? "" : " is-empty"}`}>
          <div className="translation-step-head">
            <span className="translation-step-index">2</span>
            <div>
              <h3>翻译结果</h3>
              <p className="muted">翻译完成后可直接复制结果，或回填到输入框继续处理。</p>
            </div>
          </div>

          {result ? (
            <>
              <textarea className="translation-textarea" value={result.translatedText} readOnly />
              <div className="translation-inline-actions">
                <button className="btn-ghost output-inline-btn" type="button" onClick={() => void copyResult()}>
                  复制结果
                </button>
                <button className="btn-ghost output-inline-btn" type="button" onClick={swapToRetry}>
                  结果回填继续翻译
                </button>
              </div>
            </>
          ) : (
            <div className="translation-result-empty">
              <strong>翻译结果将在这里显示</strong>
              <p>完成后可直接复制结果，或回填到左侧输入框继续处理。</p>
            </div>
          )}
        </div>
      </div>

      {result ? (
        <div className="card">
          <h3>识别摘要</h3>
          <div className="translation-summary-grid translation-summary-grid-compact">
            <div className="output-status-chip">
              <span>检测语言</span>
              <strong>{result.detectedLanguages.join(", ") || "-"}</strong>
            </div>
            <div className="output-status-chip">
              <span>混合语种</span>
              <strong>{result.isMixed ? "是" : "否"}</strong>
            </div>
            <div className="output-status-chip">
              <span>预计费用</span>
              <strong>{formatUsd(result.runtime.estimatedCostUsd)}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
