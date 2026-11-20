interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Subtle left-edge atmospheric shadow vignette keeping right 65% of live ruins crisp */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(95deg, rgba(9, 17, 23, 0.86) 0%, rgba(9, 17, 23, 0.56) 34%, rgba(9, 17, 23, 0.08) 64%, rgba(9, 17, 23, 0.22) 100%)',
        }}
      />

      {/* Top safe spacer */}
      <div className="h-10" />

      {/* Left-third Title Lockup & Start CTA over calm negative space */}
      <main className="relative z-10 px-10 md:px-16 max-w-xl flex flex-col items-start gap-6">
        {/* Bespoke inline SVG crest & display title lockup */}
        <div className="flex flex-col items-start gap-3">
          <svg
            viewBox="0 0 360 118"
            className="w-[310px] md:w-[360px] h-auto overflow-visible"
            role="img"
            aria-label="Sunken Sanctum"
          >
            {/* Ancient runic archway emblem */}
            <g transform="translate(0, 6)">
              <path
                d="M16 56 L16 26 C16 12 46 12 46 26 L46 56"
                fill="none"
                stroke="#9c865b"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M23 56 L23 28 C23 20 39 20 39 28 L39 56"
                fill="none"
                stroke="#46efff"
                strokeWidth="1.8"
                strokeOpacity="0.88"
              />
              <polygon points="31,24 36,34 31,44 26,34" fill="#63f7ff" />
              <line x1="10" y1="56" x2="52" y2="56" stroke="#7d6b4a" strokeWidth="3" />
            </g>

            {/* Carved Title Typography */}
            <text
              x="66"
              y="46"
              fill="#e9f4f2"
              stroke="#071117"
              strokeWidth="4"
              paintOrder="stroke fill"
              fontFamily="Cinzel, Georgia, serif"
              fontWeight="700"
              fontSize="36"
              letterSpacing="5"
            >
              SUNKEN
            </text>
            <text
              x="66"
              y="84"
              fill="#5ef4ff"
              stroke="#071117"
              strokeWidth="4"
              paintOrder="stroke fill"
              fontFamily="Cinzel, Georgia, serif"
              fontWeight="700"
              fontSize="34"
              letterSpacing="6"
            >
              SANCTUM
            </text>

            {/* Engraved rule line & subtitle */}
            <line x1="66" y1="97" x2="294" y2="97" stroke="#8c7955" strokeWidth="1.5" strokeOpacity="0.7" />
            <text
              x="66"
              y="113"
              fill="#a8c2bd"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="600"
              fontSize="11"
              letterSpacing="3.4"
            >
              LEVEL I · RIFT OF THE OVERGROWN
            </text>
          </svg>
        </div>

        {/* Single primary Start CTA */}
        <div className="pointer-events-auto flex items-center gap-4 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="group relative flex items-center gap-3 px-8 py-3.5 bg-[#12333e] hover:bg-[#194756] active:translate-y-px text-[#e8fcff] border-2 border-[#4ae8ff]/80 shadow-[0_8px_24px_rgba(0,0,0,0.65)] transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#5bf6ff]" aria-hidden="true">
              <polygon points="4,2 18,10 4,18" />
            </svg>
            <span className="text-base font-bold tracking-[0.22em] uppercase">Enter Ruins</span>
          </button>
        </div>
      </main>

      {/* Single flat borderless control-hint line in bottom safe margin */}
      <div className="relative z-10 px-10 md:px-16 pb-7 flex items-center justify-between">
        <p className="font-ui text-xs tracking-[0.14em] uppercase text-[#a3bebc] hud-text-shadow">
          Click Move &amp; Attack · WASD Move · 1–4 Abilities · Space Strike · P Pause
        </p>
      </div>
    </div>
  );
}
