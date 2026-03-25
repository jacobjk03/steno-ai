import type { GraphNode } from '../lib/supabase';
import { TYPE_COLORS, DEFAULT_COLOR } from '../lib/supabase';

interface Props {
  node: GraphNode | null;
  position: { x: number; y: number };
}

export function Tooltip({ node, position }: Props) {
  if (!node) return null;

  return (
    <div
      className="pointer-events-none fixed z-[300] rounded-xl border border-white/[0.08] bg-[rgba(12,12,24,0.95)] px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      style={{ left: position.x + 16, top: position.y + 16 }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: TYPE_COLORS[node.type] || DEFAULT_COLOR }}
        />
        <span className="text-[13px] font-semibold text-white">{node.displayName}</span>
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.5px] text-[#555]">{node.type}</div>
      <div className="mt-1 text-[11px] font-medium text-indigo-400">
        {node.factCount} fact{node.factCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
