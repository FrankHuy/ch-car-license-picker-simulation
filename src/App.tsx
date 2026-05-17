import { useEffect, useMemo, useState } from "react";
import {
  clearConfig,
  loadConfig,
  saveConfig,
} from "./storage";
import {
  createDefaultConfig,
  formatPlate,
  generateCandidates,
  getSequenceLength,
} from "./plateEngine";
import type { CandidateSource, PickerConfig, PickSession, PlateSegment, PlateType } from "./types";

const SOURCE_LABELS: Record<CandidateSource, string> = {
  "required-list": "必出序列",
  "required-regex": "必出正则",
  random: "随机生成",
};

const PLATE_TYPE_LABELS: Record<PlateType, string> = {
  blue: "小型汽车蓝牌",
  "new-energy": "新能源号牌",
};

function App() {
  const [config, setConfig] = useState<PickerConfig>(() => loadConfig());
  const [session, setSession] = useState<PickSession | null>(null);
  const [remaining, setRemaining] = useState(config.countdownSeconds);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    if (!session || session.status !== "picking") {
      return;
    }

    const tick = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      const nextRemaining = Math.max(session.countdownSeconds - elapsed, 0);
      setRemaining(nextRemaining);

      if (nextRemaining === 0) {
        setSession((current) => current && current.status === "picking"
          ? { ...current, status: "expired" }
          : current);
      }
    }, 250);

    return () => window.clearInterval(tick);
  }, [session]);

  const selectedCandidate = useMemo(() => {
    if (!session?.selectedPlate) {
      return undefined;
    }
    return session.candidates.find((candidate) => candidate.plate === session.selectedPlate);
  }, [session]);

  function updateConfig(nextConfig: PickerConfig) {
    setConfig(nextConfig);
    setSession(null);
  }

  function updateSegment(id: string, patch: Partial<PlateSegment>) {
    updateConfig({
      ...config,
      segments: config.segments.map((segment) =>
        segment.id === id ? { ...segment, ...patch } : segment,
      ),
    });
  }

  function addSegment() {
    const length = getSequenceLength(config.plateType);
    updateConfig({
      ...config,
      segments: [
        ...config.segments,
        {
          id: crypto.randomUUID(),
          province: "京",
          authority: "A",
          start: "0".repeat(length),
          end: "9".repeat(length),
          enabled: true,
        },
      ],
    });
  }

  function removeSegment(id: string) {
    updateConfig({
      ...config,
      segments: config.segments.filter((segment) => segment.id !== id),
    });
  }

  function changePlateType(plateType: PlateType) {
    const sequenceLength = getSequenceLength(plateType);
    updateConfig({
      ...config,
      plateType,
      segments: config.segments.map((segment) => ({
        ...segment,
        start: segment.start.slice(0, sequenceLength).padEnd(sequenceLength, "0"),
        end: segment.end.slice(0, sequenceLength).padEnd(sequenceLength, "9"),
      })),
    });
  }

  function startPicking() {
    const result = generateCandidates(config);
    const nextSession: PickSession = {
      candidates: result.candidates,
      startedAt: Date.now(),
      countdownSeconds: config.countdownSeconds,
      status: result.candidates.length > 0 ? "picking" : "expired",
      warnings: result.warnings,
    };
    setRemaining(config.countdownSeconds);
    setSession(nextSession);
  }

  function selectPlate(plate: string) {
    setSession((current) => current && current.status === "picking"
      ? { ...current, selectedPlate: plate }
      : current);
  }

  function confirmPlate() {
    setSession((current) => current?.status === "picking" && current.selectedPlate
      ? { ...current, confirmedPlate: current.selectedPlate, status: "confirmed" }
      : current);
  }

  function resetConfig() {
    clearConfig();
    setConfig(createDefaultConfig());
    setSession(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">车管所现场选号终端模拟</p>
          <h1>车牌选号模拟器</h1>
        </div>
        <button className="ghost-button" type="button" onClick={resetConfig}>
          重置配置
        </button>
      </header>

      <section className="workspace">
        <aside className="config-panel">
          <div className="panel-title">
            <h2>选号配置</h2>
            <span>{PLATE_TYPE_LABELS[config.plateType]}</span>
          </div>

          <div className="field-group">
            <label>号牌类型</label>
            <div className="segmented">
              {(["blue", "new-energy"] as PlateType[]).map((type) => (
                <button
                  className={config.plateType === type ? "active" : ""}
                  key={type}
                  type="button"
                  onClick={() => changePlateType(type)}
                >
                  {PLATE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <div className="row-title">
              <label>投放号段</label>
              <button type="button" className="text-button" onClick={addSegment}>
                新增号段
              </button>
            </div>
            <div className="segment-list">
              {config.segments.map((segment) => (
                <div className="segment-row" key={segment.id}>
                  <label className="switch">
                    <input
                      checked={segment.enabled}
                      type="checkbox"
                      onChange={(event) => updateSegment(segment.id, { enabled: event.target.checked })}
                    />
                    <span />
                  </label>
                  <input
                    aria-label="省份简称"
                    maxLength={1}
                    value={segment.province}
                    onChange={(event) => updateSegment(segment.id, { province: event.target.value })}
                  />
                  <input
                    aria-label="发牌机关"
                    maxLength={1}
                    value={segment.authority}
                    onChange={(event) => updateSegment(segment.id, { authority: event.target.value.toUpperCase() })}
                  />
                  <input
                    aria-label="起始序列"
                    value={segment.start}
                    onChange={(event) => updateSegment(segment.id, { start: event.target.value.toUpperCase() })}
                  />
                  <span className="dash">至</span>
                  <input
                    aria-label="结束序列"
                    value={segment.end}
                    onChange={(event) => updateSegment(segment.id, { end: event.target.value.toUpperCase() })}
                  />
                  <button
                    aria-label="删除号段"
                    className="icon-button"
                    disabled={config.segments.length <= 1}
                    type="button"
                    onClick={() => removeSegment(segment.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="requiredNumbers">必出号码序列</label>
            <textarea
              id="requiredNumbers"
              value={config.requiredNumbers.join("\n")}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  requiredNumbers: splitLines(event.target.value),
                })
              }
            />
          </div>

          <div className="field-group">
            <label htmlFor="requiredPatterns">必出号码正则</label>
            <textarea
              id="requiredPatterns"
              value={config.requiredPatterns.join("\n")}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  requiredPatterns: splitLines(event.target.value),
                })
              }
            />
          </div>

          <div className="field-group compact">
            <label htmlFor="countdown">倒计时秒数</label>
            <input
              id="countdown"
              min={10}
              max={300}
              type="number"
              value={config.countdownSeconds}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  countdownSeconds: clamp(Number(event.target.value), 10, 300),
                })
              }
            />
          </div>
        </aside>

        <section className="terminal-panel">
          <div className="terminal-header">
            <div>
              <p className="eyebrow">50选1</p>
              <h2>{session ? sessionTitle(session.status) : "等待开始选号"}</h2>
            </div>
            <div className={`timer ${remaining <= 10 && session?.status === "picking" ? "danger" : ""}`}>
              {session ? formatSeconds(remaining) : formatSeconds(config.countdownSeconds)}
            </div>
          </div>

          {session?.warnings.length ? (
            <div className="warnings">
              {session.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="plate-grid">
            {session?.candidates.length ? (
              session.candidates.map((candidate) => (
                <button
                  className={[
                    "plate-tile",
                    candidate.source,
                    session.selectedPlate === candidate.plate ? "selected" : "",
                    session.confirmedPlate === candidate.plate ? "confirmed" : "",
                  ].join(" ")}
                  disabled={session.status !== "picking"}
                  key={candidate.plate}
                  type="button"
                  onClick={() => selectPlate(candidate.plate)}
                >
                  <strong>{formatPlate(candidate.plate)}</strong>
                  <span>{SOURCE_LABELS[candidate.source]}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <h3>配置完成后开始选号</h3>
                <p>系统会按必出序列、必出正则、普通随机的优先级生成最多50个候选号牌。</p>
              </div>
            )}
          </div>

          <footer className="terminal-actions">
            <div className="selection">
              <span>当前选择</span>
              <strong>{selectedCandidate ? formatPlate(selectedCandidate.plate) : "未选择"}</strong>
              {selectedCandidate?.matchedRule ? <em>{selectedCandidate.matchedRule}</em> : null}
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={startPicking}>
                {session ? "重新生成" : "开始选号"}
              </button>
              <button
                className="primary-button"
                disabled={!session || session.status !== "picking" || !session.selectedPlate}
                type="button"
                onClick={confirmPlate}
              >
                确认选号
              </button>
            </div>
          </footer>

          {session?.status === "confirmed" && session.confirmedPlate ? (
            <div className="result-strip">
              <span>最终号牌</span>
              <strong>{formatPlate(session.confirmedPlate)}</strong>
              <small>
                来源：{SOURCE_LABELS[session.candidates.find((item) => item.plate === session.confirmedPlate)?.source ?? "random"]}
              </small>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.max(seconds % 60, 0).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function sessionTitle(status: PickSession["status"]): string {
  if (status === "confirmed") {
    return "选号已确认";
  }
  if (status === "expired") {
    return "本轮已超时";
  }
  return "请选择一个号牌";
}

export default App;
