import { TYPE_COLORS, DEFAULT_COLOR } from '../lib/supabase';

interface Props {
  types: { type: string; count: number }[];
  enabledTypes: Set<string>;
  onToggleType: (type: string) => void;
  search: string;
  onSearch: (value: string) => void;
}

export function FilterPanel({ types, enabledTypes, onToggleType, search, onSearch }: Props) {
  return (
    <div className="fixed left-5 top-5 z-50 w-[210px] rounded-xl border border-white/[0.06] bg-[rgba(10,10,20,0.85)] p-4 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-indigo-400">
        Filters
      </h3>
      <input
        type="text"
        placeholder="Search entities..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="mb-3.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white outline-none placeholder:text-[#444] focus:border-indigo-400/60 transition-colors"
      />
      <div className="text-[10px] font-medium uppercase tracking-[0.5px] text-[#444] mb-2">
        Entity Types
      </div>
      {types.map(({ type, count }) => (
        <label
          key={type}
          className="flex cursor-pointer items-center gap-2 py-1 text-xs text-[#999] transition-colors hover:text-white"
        >
          <input
            type="checkbox"
            checked={enabledTypes.has(type)}
            onChange={() => onToggleType(type)}
            className="h-3.5 w-3.5 accent-indigo-400"
          />
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_6px_currentColor]"
            style={{ background: TYPE_COLORS[type] || DEFAULT_COLOR, color: TYPE_COLORS[type] || DEFAULT_COLOR }}
          />
          <span className="flex-1">{type}</span>
          <span className="tabular-nums text-[11px] text-[#333]">{count}</span>
        </label>
      ))}
    </div>
  );
}
