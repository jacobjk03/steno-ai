import { EDGE_COLORS } from '../lib/supabase';

interface Props {
  types: string[];
}

export function EdgeLegend({ types }: Props) {
  if (types.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-5 z-50 rounded-xl border border-white/[0.06] bg-[rgba(10,10,20,0.85)] p-3.5 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1.2px] text-indigo-400">
        Relationships
      </div>
      {types.map(type => (
        <div key={type} className="flex items-center gap-2 py-0.5">
          <div
            className="h-[3px] w-6 rounded-full"
            style={{ background: EDGE_COLORS[type] || '#444' }}
          />
          <span className="text-[11px] text-[#555]">{type}</span>
        </div>
      ))}
    </div>
  );
}
