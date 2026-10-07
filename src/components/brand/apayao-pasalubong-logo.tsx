type ApayaoPasalubongLogoProps = {
  compact?: boolean;
  className?: string;
};

const forest = "#174c3d";
const terracotta = "#893101";
const bambooGold = "#c48a32";

export function ApayaoPasalubongLogo({ compact = false, className = "" }: ApayaoPasalubongLogoProps) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <svg
        viewBox="0 0 128 128"
        role="img"
        aria-labelledby="apayao-logo-title apayao-logo-description"
        className={compact ? "h-10 w-10 shrink-0" : "h-12 w-12 shrink-0"}
      >
        <title id="apayao-logo-title">Apayao Pasalubong Center emblem</title>
        <desc id="apayao-logo-description">
          A Philippine Eagle silhouette framed by an Isnag-inspired woven pattern.
        </desc>
        <defs>
          <pattern id="apayao-isnag-weave" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M0 8 8 0l8 8-8 8Z" fill="none" stroke={bambooGold} strokeWidth="1.6" />
            <path d="M8 0v16M0 8h16" fill="none" stroke={terracotta} strokeWidth="0.7" opacity="0.7" />
          </pattern>
        </defs>

        <circle cx="64" cy="64" r="61" fill="#fffdf8" stroke={forest} strokeWidth="5" />
        <circle cx="64" cy="64" r="51" fill="url(#apayao-isnag-weave)" opacity="0.3" />
        <circle cx="64" cy="64" r="43" fill="#fffdf8" stroke={bambooGold} strokeWidth="2" />

        {/* Reduced Philippine Eagle silhouette: crest, hooked beak, chest, and wings. */}
        <path
          d="M63 38c-5-7-3-14 2-20 1 6 5 9 9 11-1-6 2-10 7-14 0 8 4 13 10 16-2 2-4 4-6 5l10 4-8 4c2 3 3 7 2 12-2 11-11 19-23 20-9 1-17-2-23-8-6-6-9-14-8-22l8 3-5-9 11 4c3-4 6-6 14-6Z"
          fill={forest}
        />
        <path d="M81 40 101 45l-17 6Z" fill={terracotta} />
        <path d="M59 54c-5 5-8 11-8 19 4-4 8-6 14-7 5 1 10 3 14 7-1-8-4-14-9-19-3 2-7 2-11 0Z" fill="#fffdf8" />
        <path d="M26 79c13 7 25 11 38 11s25-4 38-11c-9 15-22 23-38 23S35 94 26 79Z" fill={terracotta} />
        <path d="M36 81c8 4 17 6 28 6s20-2 28-6" fill="none" stroke={bambooGold} strokeLinecap="round" strokeWidth="3" />
      </svg>

      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold tracking-tight text-white">
            Apayao Pasalubong
          </p>
          <p className="mt-0.5 text-[13px] font-semibold tracking-tight text-white">Center</p>
          <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#e8b56f]">
            Inventory management
          </p>
        </div>
      )}
    </div>
  );
}
