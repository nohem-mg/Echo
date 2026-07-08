"use client";

const SECTION_LINKS = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#report", label: "Report" },
  { href: "#seal", label: "Seal" },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full border border-white/10 bg-[#111]/90 p-1 shadow-2xl backdrop-blur-xl">
      <a className="rounded-full bg-white/10 px-5 py-3 font-display text-lg font-black" href="#top">
        Echo
      </a>
      {SECTION_LINKS.map((link) => (
        <a
          className="hidden rounded-full px-4 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10 sm:block"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </a>
      ))}
      <a className="rounded-full bg-[#fff7cf] px-5 py-3 font-hand text-lg text-[#050505]" href="#top">
        start
      </a>
    </nav>
  );
}
