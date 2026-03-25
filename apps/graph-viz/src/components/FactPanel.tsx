import type { GraphNode, GraphLink, Fact } from '../lib/supabase';
import { TYPE_COLORS, DEFAULT_COLOR } from '../lib/supabase';

interface Props {
  node: GraphNode | null;
  facts: Fact[];
  edges: GraphLink[];
  allNodes: GraphNode[];
  loading: boolean;
  onClose: () => void;
}

export function FactPanel({ node, facts, edges, allNodes, loading, onClose }: Props) {
  if (!node) return null;

  const connectedEdges = edges.filter(l => {
    const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
    return s === node.id || t === node.id;
  });

  const findNode = (id: string) => allNodes.find(n => n.id === id);
  const color = TYPE_COLORS[node.type] || DEFAULT_COLOR;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-5 top-5 bottom-5 z-[200] w-[380px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(10,10,18,0.95)] shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl flex flex-col animate-in">
        {/* Header */}
        <div className="border-b border-white/[0.06] p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[17px] font-semibold tracking-tight text-white">
                {node.displayName}
              </h3>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.8px] text-[#555]">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span>{node.type}</span>
                <span className="text-white/10">|</span>
                <span>{node.factCount} fact{node.factCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#555] transition-all hover:bg-white/[0.08] hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Facts */}
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[1px] text-indigo-400/80">
            Facts
          </div>
          <div className="mt-2">
            {loading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-[#444]">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border border-[#222] border-t-indigo-400" />
                Loading...
              </div>
            ) : facts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.06] px-4 py-6 text-center text-xs text-[#444]">
                No facts linked to this entity
              </div>
            ) : (
              facts.map((f, i) => (
                <div
                  key={i}
                  className="mb-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5"
                >
                  <p className="text-[13px] leading-[1.65] text-[#bbb]">{f.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500/50"
                        style={{ width: `${(parseFloat(String(f.importance || 0)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-medium tabular-nums text-indigo-400/70">
                      {parseFloat(String(f.importance || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Relationships */}
          <div className="mb-1 mt-6 text-[10px] font-semibold uppercase tracking-[1px] text-indigo-400/80">
            Relationships ({connectedEdges.length})
          </div>
          <div className="mt-2">
            {connectedEdges.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.06] px-4 py-6 text-center text-xs text-[#444]">
                No relationships
              </div>
            ) : (
              connectedEdges.map((e, i) => {
                const src = typeof e.source === 'object' ? (e.source as any) : findNode(e.source);
                const tgt = typeof e.target === 'object' ? (e.target as any) : findNode(e.target);
                const isSource = (typeof e.source === 'object' ? (e.source as any).id : e.source) === node.id;
                return (
                  <div
                    key={i}
                    className="mb-1.5 flex items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 text-[12px]"
                  >
                    <span className={isSource ? 'font-medium text-white/80' : 'text-[#888]'}>
                      {src?.displayName || '?'}
                    </span>
                    <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0 text-indigo-400/50"><path d="M0 4h14M10 0.5L14.5 4 10 7.5" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
                    <span className="font-semibold text-indigo-400">{e.relation}</span>
                    <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0 text-indigo-400/50"><path d="M0 4h14M10 0.5L14.5 4 10 7.5" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
                    <span className={!isSource ? 'font-medium text-white/80' : 'text-[#888]'}>
                      {tgt?.displayName || '?'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
