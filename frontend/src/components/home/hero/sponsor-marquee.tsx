"use client";

const SPONSORS = ["CHAINLINK", "WORLD ID", "UNLINK"];

const EDGE_FADE_MASK = "linear-gradient(to right, transparent, black 10%, black 90%, transparent)";

function MarqueeRow({ items, prefix, style }: { items: string[]; prefix: string; style?: React.CSSProperties }) {
  return (
    <div className="marquee flex min-w-full shrink-0 items-center gap-4 pr-4 text-sm font-bold uppercase text-white/80" style={style}>
      {items.map((item, index) => (
        <span className="flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-2.5 backdrop-blur-sm whitespace-nowrap" key={`${prefix}-${item}-${index}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function SponsorMarquee() {
  const repeated = Array(20).fill(SPONSORS).flat() as string[];

  return (
    <div
      className="mx-auto mt-8 flex w-full max-w-7xl flex-col gap-4 overflow-hidden py-4"
      style={{ maskImage: EDGE_FADE_MASK, WebkitMaskImage: EDGE_FADE_MASK }}
    >
      <MarqueeRow items={repeated} prefix="row1" />
      <MarqueeRow items={[...repeated].reverse()} prefix="row2" style={{ animationDirection: "reverse", animationDuration: "55s" }} />
    </div>
  );
}
