/** Selo DEMO para dados fictícios do seed (UI_LAYOUT §4). */
export function DemoBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center rounded-[4px] bg-amber-50 px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-amber-900" title="Dado fictício gerado pelo seed de demonstração">
      DEMO
    </span>
  );
}
