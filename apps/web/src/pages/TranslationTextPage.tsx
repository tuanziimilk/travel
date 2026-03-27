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
      <section className="section-header translation-header">
        <h2>文本翻译</h2>
        <p>粘贴任意语种或混合语种文本，系统会统一翻译为简体中文，适合快速处理单段或多段内容。</p>
      </section>

      <div className="translation-text-layout">
        <div className="card translation-pane translation-pane-input">
          <div className="translation-step-head">
            <span className="translation-step-index">1</span>
            <h3>输入原文</h3>
          </div>

          <div className="translation-textarea-wrapper">
            <textarea
              className="translation-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"粘贴需要统一翻译的文本...\n支持单段或多段混合语种内容。"}
            />
            <div className="translation-word-count">
              {text.length} / {translationTextMaxChars}
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="translation-action-bar-inline">
            <button
              className="btn-primary output-inline-btn translation-action-primary"
              type="button"
              disabled={runMutation.isPending}
              onClick={() => void runTranslation()}
            >
              {runMutation.isPending ? "翻译中..." : "开始翻译"}
            </button>
            <button className="btn-ghost output-inline-btn translation-action-secondary" type="button" onClick={clearAll}>
              清空
            </button>
          </div>
        </div>

        <div className="card translation-pane translation-pane-result">
          <div className="translation-step-head translation-step-head-secondary translation-result-head">
            <span className="translation-step-index">2</span>
            <h3>翻译结果</h3>
            <span className="translation-target-tag">固定输出：简体中文</span>
          </div>

          {result ? (
            <textarea className="translation-textarea translation-result-textarea" value={result.translatedText} readOnly />
          ) : (
            <div className="translation-result-empty">
              <div className="translation-result-empty-inner">
                <strong>翻译结果将在这里显示</strong>
                <p>完成后可直接复制结果，或回填到左侧继续处理。</p>
              </div>
            </div>
          )}

          <div className="translation-result-actions-cluster translation-result-actions-always">
            <div className="translation-pane-footer translation-pane-footer-result">
              <div className="translation-inline-actions translation-inline-actions-result">
                <button
                  className="btn-primary output-inline-btn translation-result-primary"
                  type="button"
                  onClick={() => void copyResult()}
                  disabled={!result}
                >
                  复制结果
                </button>
                <button
                  className="btn-ghost output-inline-btn translation-secondary-btn"
                  type="button"
                  onClick={swapToRetry}
                  disabled={!result}
                >
                  回填继续翻译
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="translation-bottom-summary">
        <div className="translation-mini-summary translation-bottom-summary-grid">
          <div className="translation-mini-chip">
            <span>检测语言</span>
            <strong>{result?.detectedLanguages.join(", ") || "-"}</strong>
          </div>
          <div className="translation-mini-chip">
            <span>混合语种</span>
            <strong>{result ? (result.isMixed ? "是" : "否") : "-"}</strong>
          </div>
          <div className="translation-mini-chip">
            <span>预计费用</span>
            <strong>{result ? formatUsd(result.runtime.estimatedCostUsd) : "-"}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
