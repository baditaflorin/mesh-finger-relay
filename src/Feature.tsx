import { useEffect, useMemo, useRef, useState } from "react";
import {
  ConfettiLayer,
  createClockSync,
  useEventLog,
  useFairRng,
  useFlashOnChange,
  useGesture,
  useMeshSlot,
  useNamedPeer,
  usePhase,
  useRotatingTurn,
  useConfetti,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Pt = { x: number; y: number };
type Stroke = {
  id: string;
  peerId: string;
  points: Pt[];
  color: string;
  ts: number;
  slotId: number;
};

const COLORS = ["#ff5577", "#ffaa33", "#ffe14d", "#5fdd6b", "#52b9ff", "#aa66ff"];
const SLOT_MS = 3000;
const CANVAS = 400;

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="finger-screen">
        <h1>finger relay</h1>
        <p>Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, myName, nameOf } = useNamedPeer(config, room);
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);
  useFairRng(room, "finger-salts");
  const phase = usePhase<"lobby" | "painting">(room, "phase", "lobby");
  const slot = useMeshSlot(clock, SLOT_MS);
  const turn = useRotatingTurn(room, clock, { slotMs: SLOT_MS, order: "shuffle" });
  const log = useEventLog<Stroke>(room, "strokes");
  const { burst } = useConfetti();

  const [color, setColor] = useState(COLORS[5]!);
  const [draft, setDraft] = useState<Pt[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gesture = useGesture();
  const isMyTurn = turn.isMyTurn;
  const sLeft = Math.ceil(turn.msToNextTurn / 1000);

  const flash = useFlashOnChange(log.size);
  useEffect(() => {
    if (flash) burst({ origin: "center", count: 24, hueRange: [260, 320] });
  }, [flash, burst]);

  const toLocal = (cx: number, cy: number): Pt => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(CANVAS, ((cx - r.left) / r.width) * CANVAS)),
      y: Math.max(0, Math.min(CANVAS, ((cy - r.top) / r.height) * CANVAS)),
    };
  };
  const commitStroke = (points: Pt[]) => {
    log.push({
      id: Math.random().toString(36).slice(2, 12),
      peerId: room.peerId,
      points,
      color,
      ts: Date.now(),
      slotId: slot.slotId,
    });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || phase.phase !== "painting") return;
    setDraft([toLocal(e.clientX, e.clientY)]);
    gesture.handlers.onPointerDown(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isMyTurn) return;
    if (draft.length > 0) setDraft((d) => [...d, toLocal(e.clientX, e.clientY)]);
    gesture.handlers.onPointerMove(e);
  };
  const finishStroke = (e: React.PointerEvent) => {
    gesture.handlers.onPointerUp(e);
    if (isMyTurn && draft.length >= 1) commitStroke(draft);
    setDraft([]);
  };
  const testStroke = () => {
    if (!isMyTurn) return;
    commitStroke([
      { x: 80, y: 200 },
      { x: 200, y: 80 },
      { x: 320, y: 200 },
    ]);
  };

  const start = () => phase.transition("painting", { from: "lobby" });
  const clear = () => log.clear();

  const currentName = turn.currentPeerId ? (nameOf(turn.currentPeerId) ?? "someone") : "—";
  const turnLabel = isMyTurn
    ? `your turn — draw! (${sLeft}s)`
    : `${currentName}'s turn (${sLeft}s)`;

  return (
    <div className="finger-screen">
      <ConfettiLayer />
      <header className="finger-header">
        <h1>finger relay</h1>
        <input
          className="finger-name"
          placeholder="your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          aria-label="your name"
        />
        <p className="finger-status">
          {room.peerCount + 1} peer{room.peerCount === 0 ? "" : "s"} · {log.size} strokes · {myName}
        </p>
      </header>

      {phase.phase === "lobby" && (
        <button type="button" className="finger-start" onClick={start}>
          start
        </button>
      )}

      <div className={`finger-turn${isMyTurn ? " is-me" : ""}`}>{turnLabel}</div>

      <div className="finger-bar" aria-hidden="true">
        <div className="finger-bar-fill" style={{ width: `${(1 - turn.progress) * 100}%` }} />
      </div>

      <svg
        ref={svgRef}
        className={`finger-canvas${flash ? " is-flash" : ""}`}
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      >
        <rect x={0} y={0} width={CANVAS} height={CANVAS} className="finger-bg" />
        {log.events.map((s) => (
          <polyline
            key={s.id}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={s.color}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {draft.length > 0 && (
          <polyline
            points={draft.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={color}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.6}
          />
        )}
      </svg>

      <div className="finger-colors" role="group" aria-label="color">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`finger-color${c === color ? " is-on" : ""}`}
            data-color={c}
            style={{ background: c }}
            aria-label={`color ${c}`}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div className="finger-actions">
        <button
          type="button"
          className="finger-test-stroke"
          aria-label="test stroke"
          onClick={testStroke}
        >
          test stroke
        </button>
        <button type="button" className="finger-clear" onClick={clear}>
          clear canvas
        </button>
      </div>
    </div>
  );
}
