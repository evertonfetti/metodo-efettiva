/** Skeleton de carregamento (UI_LAYOUT §8: skeletons, não spinner de tela inteira). */
export default function Loading() {
  return (
    <div className="flex w-full max-w-[1240px] flex-col gap-6 px-4 pt-[88px] pb-10 md:px-8" role="status" aria-label="Carregando">
      <div className="h-8 w-64 animate-pulse rounded-[8px] bg-surface-sunken" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[110px] animate-pulse rounded-[12px] border border-border bg-surface" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[12px] border border-border bg-surface" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
