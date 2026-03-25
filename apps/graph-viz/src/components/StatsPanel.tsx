interface Props {
  entities: number;
  edges: number;
  facts: number;
  visible: number;
}

export function StatsPanel({ entities, edges, facts, visible }: Props) {
  return (
    <div className="fixed top-5 right-5 z-50 min-w-[170px] rounded-xl border border-white/[0.06] bg-[rgba(10,10,20,0.85)] p-4 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-indigo-400">
        Memory Stats
      </h3>
      <Stat label="Entities" value={entities} />
      <Stat label="Edges" value={edges} />
      <Stat label="Facts" value={facts} />
      <div className="mt-2 border-t border-white/5 pt-2">
        <Stat label="Visible" value={visible} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-xs text-[#555]">{label}</span>
      <strong className="text-[13px] font-semibold tabular-nums text-white/90">{value}</strong>
    </div>
  );
}
