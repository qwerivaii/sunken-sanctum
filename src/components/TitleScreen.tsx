interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Moody sumi-ink asymmetrical vignette keeping the live misty ruins visible on center-right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(96deg, rgba(7, 8, 10, 0.9) 0%, rgba(9, 10, 12, 0.62) 34%, rgba(9, 10, 12, 0.14) 64%, rgba(7, 8, 10, 0.36) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-36 pointer-events-none"
        style={{
          background: 'linear-gradient(0deg, rgba(6, 7, 9, 0.85) 0%, rgba(6, 7, 9, 0) 100%)',
        }}
      />

      {/* Top safe spacer */}
      <div className="h-10" />

      {/* Left-third Phantom Blade Zero calligraphic ink-and-steel lockup */}
      <main className="relative z-10 px-10 md:px-16 max-w-2xl flex flex-col items-start gap-7">
        {/* Bespoke inline SVG ink-wash crest & wide-tracked silver-bone title */}
        <div className="flex flex-col items-start">
          <svg
            viewBox="0 0 430 144"
            className="w-[330px] md:w-[430px] h-auto overflow-visible"
            role="img"
            aria-label="Sunken Sanctum"
          >
            {/* Subtle ink-wash horizontal slash behind title */}
            <path
              d="M6 68 Q95 54 218 65 T412 58 L394 82 Q245 92 108 84 T2 80 Z"
              fill="#050608"
              fillOpacity="0.62"
            />
            {/* Delicate diagonal blade gleam */}
            <line
              x1="14"
              y1="106"
              x2="372"
              y2="106"
              stroke="#b9b1a3"
              strokeWidth="0.9"
              strokeOpacity="0.48"
            />
            <polygon points="372,106 382,103.5 390,106 382,108.5" fill="#d69b27" fillOpacity="0.85" />

            {/* Vertical vermilion hanko-style blade seal on far left */}
            <g transform="translate(8, 22)">
              <rect
                x="0"
                y="0"
                width="26"
                height="66"
                fill="#7f1319"
                fillOpacity="0.88"
                stroke="#c93b42"
                strokeWidth="1"
              />
              <rect
                x="3.5"
                y="3.5"
                width="19"
                height="59"
                fill="none"
                stroke="#f0e7d8"
                strokeOpacity="0.45"
                strokeWidth="0.7"
              />
              {/* Stylized archaic blade-and-gate rune inside seal */}
              <path
                d="M13 11 L13 54 M8 22 L18 22 M7 36 L13 30 L19 36 M9 47 L17 47"
                stroke="#f2eadc"
                strokeWidth="1.6"
                strokeLinecap="square"
                fill="none"
              />
            </g>

            {/* Primary Bone-Silver Display Title */}
            <text
              x="50"
              y="58"
              fill="#ece8df"
              stroke="#07080a"
              strokeWidth="3.5"
              paintOrder="stroke fill"
              fontFamily="Cinzel, 'Cormorant Garamond', Georgia, serif"
              fontWeight="600"
              fontSize="38"
              letterSpacing="9"
            >
              SUNKEN
            </text>
            <text
              x="50"
              y="95"
              fill="#d5cfc2"
              stroke="#07080a"
              strokeWidth="3.5"
              paintOrder="stroke fill"
              fontFamily="Cinzel, 'Cormorant Garamond', Georgia, serif"
              fontWeight="600"
              fontSize="34"
              letterSpacing="11"
            >
              SANCTUM
            </text>

            {/* Quiet classical subtitle under blade rule */}
            <text
              x="50"
              y="126"
              fill="#b8b0a1"
              fontFamily="'Cormorant Garamond', Georgia, serif"
              fontWeight="600"
              fontSize="16"
              letterSpacing="4.5"
            >
              ACT I · RIFT OF THE OVERGROWN
            </text>
          </svg>
        </div>

        {/* Phantom Blade Zero Bonfire-style feathered ink-brush Start CTA */}
        <div className="pointer-events-auto flex flex-col items-start gap-2 pl-1">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="group relative flex items-center gap-4 min-w-[272px] px-7 py-3.5 pbz-ink-ribbon hover:pbz-ink-ribbon-crimson focus-visible:pbz-ink-ribbon-crimson focus-visible:outline-none text-left cursor-pointer transition-transform duration-150 active:translate-y-px"
          >
            {/* Subtle top/bottom steel hairlines that brighten crimson-gold on hover */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#9b9487]/65 to-transparent group-hover:via-[#d9363e]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-[#9b9487]/55 to-transparent group-hover:via-[#d69b27]"
            />

            {/* Vermilion diamond selection marker (exact PBZ Bonfire menu cue) */}
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rotate-45 bg-[#c92831] border border-[#f2d6d8]/75 shadow-[0_0_10px_rgba(201,40,49,0.75)] shrink-0 transition-transform duration-150 group-hover:scale-110"
            />

            <span className="font-display text-base font-semibold tracking-[0.28em] text-[#f2eee6] group-hover:text-white whitespace-nowrap hud-text-shadow">
              ENTER RUINS
            </span>
          </button>
        </div>
      </main>

      {/* Single flat borderless control-hint line in bottom safe margin */}
      <div className="relative z-10 px-10 md:px-16 pb-7 flex items-center justify-between">
        <p className="font-ui text-xs tracking-[0.14em] text-[#a7a196] hud-text-shadow">
          Click Move &amp; Attack · WASD Move · 1–4 Arts · Space Strike · P Pause
        </p>
      </div>
    </div>
  );
}
