import { useEffect, useState } from "react";
import type { ModuleId } from "@about-demo/trpc";
import { trpc } from "../lib/trpc";

export function SkillConfigPage({ moduleId }: { moduleId: ModuleId }) {
  const [editor, setEditor] = useState("");
  const [dirty, setDirty] = useState(false);

  const skillQuery = trpc.skill.get.useQuery(
    { moduleId },
    {
      refetchOnWindowFocus: false,
    },
  );
  const saveMutation = trpc.skill.save.useMutation();

  useEffect(() => {
    if (skillQuery.data?.skillMd != null) {
      setEditor(skillQuery.data.skillMd);
      setDirty(false);
    }
  }, [skillQuery.data?.skillMd, moduleId]);

  async function onSave() {
    await saveMutation.mutateAsync({ moduleId, skillMd: editor });
    await skillQuery.refetch();
  }

  return (
    <div className="card">
      <h2>评分规则配置</h2>
      <p className="muted">
        当前板块：{moduleId.toUpperCase()}，来源：{skillQuery.data?.source ?? "-"}
      </p>

      <div className="field" style={{ marginTop: 12 }}>
        <label>SKILL.md 内容</label>
        <textarea
          value={editor}
          onChange={(event) => {
            setEditor(event.target.value);
            setDirty(true);
          }}
          style={{ minHeight: 420, fontFamily: "Consolas, monospace", fontSize: 13 }}
        />
      </div>

      <div className="upload-actions" style={{ marginTop: 14 }}>
        <button className="btn-ghost" type="button" onClick={() => void skillQuery.refetch()}>
          重新加载
        </button>
        <button
          className="btn-ghost"
          type="button"
          disabled={!dirty || saveMutation.isPending || !editor.trim()}
          onClick={() => void onSave()}
        >
          {saveMutation.isPending ? "保存中..." : "保存规则"}
        </button>
      </div>

      {skillQuery.error && <p style={{ color: "#b00020", marginTop: 10 }}>{skillQuery.error.message}</p>}
      {saveMutation.error && <p style={{ color: "#b00020", marginTop: 10 }}>{saveMutation.error.message}</p>}
      {saveMutation.isSuccess && <p style={{ color: "#0b7a00", marginTop: 10 }}>保存成功</p>}
    </div>
  );
}

