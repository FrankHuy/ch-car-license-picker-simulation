import { useEffect, useMemo, useState } from "react";
import { clearConfig, loadConfig, saveConfig } from "./storage";
import {
  createDefaultConfig,
  formatPlate,
  generateCandidates,
  getSequenceLength,
} from "./plateEngine";
import type { CandidateSource, PickerConfig, PickSession, PlateSegment, PlateType } from "./types";

type Screen = "preset" | "notice" | "picking" | "done";

const SOURCE_LABELS: Record<CandidateSource, string> = {
  "required-list": "预置",
  "required-regex": "规则",
  random: "随机",
};

const PLATE_TYPE_LABELS: Record<PlateType, string> = {
  blue: "小型汽车号牌",
  "new-energy": "新能源汽车号牌",
};

function App() {
  const [config, setConfig] = useState<PickerConfig>(() => loadConfig());
  const [screen, setScreen] = useState<Screen>("preset");
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
        setSession((current) =>
          current && current.status === "picking" ? { ...current, status: "expired" } : current,
        );
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

  function startSession() {
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
    setScreen("picking");
  }

  function selectPlate(plate: string) {
    setSession((current) =>
      current && current.status === "picking" ? { ...current, selectedPlate: plate } : current,
    );
  }

  function confirmPlate() {
    setSession((current) =>
      current?.status === "picking" && current.selectedPlate
        ? { ...current, confirmedPlate: current.selectedPlate, status: "confirmed" }
        : current,
    );
    setScreen("done");
  }

  function resetConfig() {
    clearConfig();
    setConfig(createDefaultConfig());
    setSession(null);
  }

  if (screen === "preset") {
    return (
      <main className="preset-shell">
        <section className="preset-card">
          <div className="preset-heading">
            <p>模拟器预设</p>
            <h1>车管所选号终端参数</h1>
            <span>完成预设后进入全屏业务界面，选号过程不展示后台配置。</span>
          </div>

          <div className="preset-grid">
            <div className="field-group">
              <label>号牌种类</label>
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
                <label>号段投放</label>
                <button className="text-button" type="button" onClick={addSegment}>
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
                        onChange={(event) =>
                          updateSegment(segment.id, { enabled: event.target.checked })
                        }
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
                      onChange={(event) =>
                        updateSegment(segment.id, { authority: event.target.value.toUpperCase() })
                      }
                    />
                    <input
                      aria-label="起始序列"
                      value={segment.start}
                      onChange={(event) =>
                        updateSegment(segment.id, { start: event.target.value.toUpperCase() })
                      }
                    />
                    <span>至</span>
                    <input
                      aria-label="结束序列"
                      value={segment.end}
                      onChange={(event) =>
                        updateSegment(segment.id, { end: event.target.value.toUpperCase() })
                      }
                    />
                    <button
                      aria-label="删除号段"
                      className="icon-button"
                      disabled={config.segments.length <= 1}
                      type="button"
                      onClick={() => removeSegment(segment.id)}
                    >
                      x
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
                  updateConfig({ ...config, requiredNumbers: splitLines(event.target.value) })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="requiredPatterns">必出号码正则</label>
              <textarea
                id="requiredPatterns"
                value={config.requiredPatterns.join("\n")}
                onChange={(event) =>
                  updateConfig({ ...config, requiredPatterns: splitLines(event.target.value) })
                }
              />
            </div>

            <div className="field-group compact">
              <label htmlFor="countdown">选号倒计时秒数</label>
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
          </div>

          <footer className="preset-actions">
            <button className="quiet-button" type="button" onClick={resetConfig}>
              恢复默认
            </button>
            <button className="start-button" type="button" onClick={() => setScreen("notice")}>
              进入车管所选号界面
            </button>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="kiosk-shell">
      <header className="kiosk-header">
        <div className="national-mark">机动车业务办理系统</div>
        <div className="agency-title">
          <strong>公安交通管理综合应用平台</strong>
          <span>机动车号牌现场随机选号</span>
        </div>
        <div className="header-status">
          <span>{PLATE_TYPE_LABELS[config.plateType]}</span>
          <button type="button" onClick={() => setScreen("preset")}>
            返回预设
          </button>
        </div>
      </header>

      <section className="process-bar">
        <Step active={screen === "notice"} done={screen !== "notice"} label="业务须知" />
        <Step active={screen === "picking"} done={screen === "done"} label="随机选号" />
        <Step active={screen === "done"} done={screen === "done"} label="确认号牌" />
        <Step active={screen === "done"} done={screen === "done"} label="业务完成" />
      </section>

      {screen === "notice" ? (
        <section className="notice-screen">
          <div className="notice-box">
            <h1>机动车号牌随机选号</h1>
            <div className="notice-copy">
              <p>一、请确认业务信息无误后开始随机选号。</p>
              <p>二、系统将一次性随机生成五十副候选号牌，申请人须在限定时间内选择一副号牌。</p>
              <p>三、确认号牌后，本次选号结果生效；超时未确认的，本轮选号自动失效。</p>
              <p>四、选号过程中请勿刷新、关闭页面或离开终端。</p>
            </div>
            {session?.warnings.length ? (
              <div className="system-warning">
                {session.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="notice-actions">
            <button className="kiosk-secondary" type="button" onClick={() => setScreen("preset")}>
              返回
            </button>
            <button className="kiosk-primary" type="button" onClick={startSession}>
              开始随机选号
            </button>
          </div>
        </section>
      ) : null}

      {screen === "picking" ? (
        <section className="picking-screen">
          <div className="selection-topline">
            <div>
              <strong>请在下列号牌中选择一副</strong>
              <span>点击号牌后，请按“确认号牌”完成本次选号。</span>
            </div>
            <div className={remaining <= 10 ? "kiosk-timer warning" : "kiosk-timer"}>
              剩余时间 {formatSeconds(remaining)}
            </div>
          </div>

          {session?.status === "expired" ? (
            <div className="expired-banner">选号时间已到，本轮随机选号失效。</div>
          ) : null}

          {session?.warnings.length ? (
            <div className="system-warning slim">
              {session.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="official-plate-grid">
            {session?.candidates.map((candidate, index) => (
              <button
                className={[
                  "official-plate",
                  session.selectedPlate === candidate.plate ? "selected" : "",
                ].join(" ")}
                disabled={session.status !== "picking"}
                key={candidate.plate}
                type="button"
                onClick={() => selectPlate(candidate.plate)}
              >
                <span className="plate-index">{String(index + 1).padStart(2, "0")}</span>
                <strong>{formatPlate(candidate.plate)}</strong>
                <em>{SOURCE_LABELS[candidate.source]}</em>
              </button>
            ))}
          </div>

          <footer className="kiosk-footer">
            <div className="chosen-readout">
              <span>已选号牌</span>
              <strong>{selectedCandidate ? formatPlate(selectedCandidate.plate) : "尚未选择"}</strong>
            </div>
            <div className="kiosk-actions">
              <button className="kiosk-secondary" type="button" onClick={() => setScreen("notice")}>
                上一步
              </button>
              <button
                className="kiosk-primary"
                disabled={!session || session.status !== "picking" || !session.selectedPlate}
                type="button"
                onClick={confirmPlate}
              >
                确认号牌
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      {screen === "done" && session?.confirmedPlate ? (
        <section className="done-screen">
          <div className="success-panel">
            <div className="success-mark">选号成功</div>
            <p>您已确认机动车号牌</p>
            <strong>{formatPlate(session.confirmedPlate)}</strong>
            <span>
              来源：
              {SOURCE_LABELS[
                session.candidates.find((item) => item.plate === session.confirmedPlate)?.source ??
                  "random"
              ]}
            </span>
          </div>
          <div className="notice-actions">
            <button className="kiosk-secondary" type="button" onClick={() => setScreen("preset")}>
              返回预设
            </button>
            <button className="kiosk-primary" type="button" onClick={() => setScreen("notice")}>
              办理下一笔业务
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Step({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={["step", active ? "active" : "", done ? "done" : ""].join(" ")}>
      <span>{done ? "✓" : ""}</span>
      <strong>{label}</strong>
    </div>
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

export default App;
