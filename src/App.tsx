import { useEffect, useMemo, useState } from "react";
import { clearConfig, loadConfig, saveConfig } from "./storage";
import {
  createDefaultConfig,
  generateCandidates,
  getSequenceLength,
  normalizePlate,
} from "./plateEngine";
import type { PickerConfig, PickSession, PlateSegment, PlateType } from "./types";

type Screen = "preset" | "notice" | "picking" | "confirm" | "done";

const PLATE_TYPE_LABELS: Record<PlateType, string> = {
  blue: "小型汽车号牌",
  "new-energy": "新能源汽车号牌",
};

function App() {
  const [config, setConfig] = useState<PickerConfig>(() => loadConfig());
  const [screen, setScreen] = useState<Screen>("preset");
  const [session, setSession] = useState<PickSession | null>(null);
  const [displayCandidates, setDisplayCandidates] = useState<PickSession["candidates"]>([]);
  const [drawStarted, setDrawStarted] = useState(false);
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

  useEffect(() => {
    if (!session || screen !== "picking" || drawStarted || session.status !== "picking") {
      return;
    }

    const rolling = window.setInterval(() => {
      setDisplayCandidates((current) => shuffleCandidates(current));
    }, 120);

    return () => window.clearInterval(rolling);
  }, [drawStarted, screen, session]);

  const selectedCandidate = useMemo(() => {
    if (!session?.selectedPlate) {
      return undefined;
    }
    return session.candidates.find((candidate) => candidate.plate === session.selectedPlate);
  }, [session]);

  function updateConfig(nextConfig: PickerConfig) {
    setConfig(nextConfig);
    setSession(null);
    setDrawStarted(false);
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
    setDisplayCandidates(result.candidates);
    setDrawStarted(false);
    setScreen("picking");
  }

  function enterKiosk() {
    const result = generateCandidates(config);
    const regexWarnings = result.warnings.filter((warning) => warning.startsWith("正则 "));

    if (regexWarnings.length > 0) {
      window.alert(regexWarnings.join("\n"));
      return;
    }

    setScreen("notice");
  }

  function startDraw() {
    if (!session || session.status !== "picking" || displayCandidates.length === 0) {
      return;
    }

    const firstPlate = displayCandidates[0].plate;
    setDrawStarted(true);
    setSession({ ...session, candidates: displayCandidates, selectedPlate: firstPlate });
  }

  function selectPlate(plate: string) {
    if (!drawStarted) {
      return;
    }

    setSession((current) =>
      current && current.status === "picking" ? { ...current, selectedPlate: plate } : current,
    );
  }

  function confirmPlate() {
    setSession((current) =>
      current?.status === "picking" && current.selectedPlate
        ? { ...current, confirmedPlate: current.selectedPlate }
        : current,
    );
    setScreen("confirm");
  }

  function returnToPicking() {
    setSession((current) => current ? { ...current, confirmedPlate: undefined } : current);
    setScreen("picking");
  }

  function completePlatePick() {
    setSession((current) =>
      current?.confirmedPlate ? { ...current, status: "confirmed" } : current,
    );
    setScreen("done");
  }

  function resetConfig() {
    clearConfig();
    setConfig(createDefaultConfig());
    setSession(null);
    setDrawStarted(false);
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

            <div className="field-group">
              <label htmlFor="ownerName">所有人</label>
              <input
                id="ownerName"
                value={config.ownerName}
                onChange={(event) =>
                  updateConfig({ ...config, ownerName: event.target.value })
                }
              />
            </div>

            <div className="field-group">
              <label htmlFor="vehicleBrand">车辆品牌</label>
              <input
                id="vehicleBrand"
                value={config.vehicleBrand}
                onChange={(event) =>
                  updateConfig({ ...config, vehicleBrand: event.target.value })
                }
              />
            </div>
          </div>

          <footer className="preset-actions">
            <button className="quiet-button" type="button" onClick={resetConfig}>
              恢复默认
            </button>
            <button className="start-button" type="button" onClick={enterKiosk}>
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
        <div className="national-mark">机动车自助选号系统</div>
        <div className="agency-title">
          <strong>机动车自助选号系统</strong>
          <span>现场随机选号</span>
        </div>
        <div className="header-status">
          <span>{PLATE_TYPE_LABELS[config.plateType]}</span>
        </div>
      </header>

      <section className="process-bar">
        <Step active={screen === "notice"} done={screen !== "notice"} label="阶段一：阅读选号须知" />
        <Step
          active={screen === "picking" || screen === "confirm"}
          done={screen === "done"}
          label="阶段二：选择号牌"
        />
        <Step active={screen === "done"} done={screen === "done"} label="阶段三：完成选号" />
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
          </div>

          <div className="notice-actions">
            <button className="kiosk-secondary" type="button" onClick={() => setScreen("preset")}>
              返回
            </button>
            <button className="kiosk-primary" type="button" onClick={startSession}>
              进入选号
            </button>
          </div>
        </section>
      ) : null}

      {screen === "picking" ? (
        <section className="picking-screen">
          <div className="selection-topline">
            <div>
              {drawStarted ? (
                <strong>
                  请在 <b>{remaining}</b> 秒内点击<b>确认号牌</b>，共<b>50</b>个号牌号码供您选择，您可查看并点选心仪的号牌。
                </strong>
              ) : (
                <strong>
                  请在 <b>{remaining}</b> 秒内点击<b>开始选号</b>，共<b>50</b>个号牌号码供您选择，您可查看并点选心仪的号牌。
                </strong>
              )}
            </div>
          </div>

          <div className="selection-control-row">
            <button
              className={drawStarted ? "draw-button confirm" : "draw-button"}
              disabled={!session || session.status !== "picking"}
              type="button"
              onClick={drawStarted ? confirmPlate : startDraw}
            >
              {drawStarted ? "确认号牌" : "开始选号"}
            </button>
            {drawStarted ? (
              <div className="current-selection">
                <span>当前选择号码：</span>
                <strong>{selectedCandidate ? compactPlate(selectedCandidate.plate) : ""}</strong>
              </div>
            ) : null}
          </div>

          {session?.status === "expired" ? (
            <div className="expired-banner">选号时间已到，本轮随机选号失效。</div>
          ) : null}

          <div className="official-plate-grid">
            {displayCandidates.map((candidate, index) => (
              <button
                className={[
                  "official-plate",
                  session?.selectedPlate === candidate.plate ? "selected" : "",
                  !drawStarted ? "rolling" : "",
                  index === 48 ? "tail-center-left" : "",
                  index === 49 ? "tail-center-right" : "",
                ].join(" ")}
                disabled={session?.status !== "picking"}
                key={candidate.plate}
                type="button"
                onClick={() => selectPlate(candidate.plate)}
              >
                <strong>{compactPlate(candidate.plate)}</strong>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>

          <footer className="kiosk-footer">
            <div className="vehicle-readout">
              <span>所有人：{config.ownerName || "未填写"}</span>
              <i>|</i>
              <span>车辆品牌：{config.vehicleBrand || "未填写"}</span>
            </div>
            <div className="kiosk-actions">
            </div>
          </footer>
        </section>
      ) : null}

      {screen === "confirm" && session?.confirmedPlate ? (
        <section className="confirm-screen">
          <div className="confirm-topline">
            请在 <b>{remaining}</b> 秒内完成选号，您可以翻页查看并点选心仪的号牌。
          </div>

          <div className="confirm-number-box">
            <span>您当前选择号码：</span>
            <strong>{compactPlate(session.confirmedPlate)}</strong>
          </div>

          <div className="confirm-actions">
            <button className="return-button" type="button" onClick={returnToPicking}>
              返回重选
            </button>
            <button
              className="draw-button confirm"
              disabled={session.status !== "picking"}
              type="button"
              onClick={completePlatePick}
            >
              确认号牌
            </button>
          </div>

          <KioskFooter config={config} />
        </section>
      ) : null}

      {screen === "done" && session?.confirmedPlate ? (
        <section className="done-screen">
          <div className="success-panel">
            <p>恭喜您，已成功完成选号！</p>
            <div className="final-card">
              <span>您的爱车号牌号码为：</span>
              <strong>{compactPlate(session.confirmedPlate)}</strong>
            </div>
            <div className="balloon balloon-left" />
            <div className="balloon balloon-right" />
          </div>
          <div className="notice-actions">
            <button
              className="draw-button confirm"
              type="button"
              onClick={() => {
                setScreen("preset");
                setSession(null);
                setDrawStarted(false);
                setDisplayCandidates([]);
              }}
            >
              完成选号
            </button>
          </div>
          <KioskFooter config={config} />
        </section>
      ) : null}
    </main>
  );
}

function KioskFooter({ config }: { config: PickerConfig }) {
  return (
    <footer className="kiosk-footer">
      <div className="vehicle-readout">
        <span>所有人：{config.ownerName || "未填写"}</span>
        <i>|</i>
        <span>车辆品牌：{config.vehicleBrand || "未填写"}</span>
      </div>
    </footer>
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

function compactPlate(plate: string): string {
  return normalizePlate(plate);
}

function shuffleCandidates<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export default App;
