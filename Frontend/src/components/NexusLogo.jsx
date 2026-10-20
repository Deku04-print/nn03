
import { nexusStyleClass } from '../utils/styleTokens.js';

export default function NexusLogo({
  size = 36,
  showText = true,
  layout = 'horizontal', // 'horizontal' | 'vertical'
  color = '#2563eb',     // Single brand color
  textColor = 'currentColor',
  className = '',
}) {
  const isVertical = layout === 'vertical';

  return (
    <div
      className={[`nexus-brand-logo ${className}`, "nxs-85j96v", nexusStyleClass("flexDirection", isVertical ? 'column' : 'row'), nexusStyleClass("gap", isVertical ? 10 : 12)].filter(Boolean).join(" ")}
      
    >
      {/* Precision Lens + Code Emblem */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        
        aria-hidden="true"
       className={["nxs-bo3n4y", nexusStyleClass("color", color)].filter(Boolean).join(" ")}>
        {/* Outer Precision Lens Frame with smooth rounded corners */}
        <rect
          x="3"
          y="3"
          width="34"
          height="34"
          rx="10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Optical Aperture Ring */}
        <circle
          cx="20"
          cy="20"
          r="10.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeDasharray="2 3"
          opacity="0.45"
        />

        {/* Code Chevron: Left < */}
        <path
          d="M16 15.5L11.5 20L16 24.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Code Chevron: Right > */}
        <path
          d="M24 15.5L28.5 20L24 24.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Central Focus NEXUS Node */}
        <circle cx="20" cy="20" r="2.4" fill="currentColor" />

        {/* Lens Crosshair Ticks */}
        <line x1="20" y1="3" x2="20" y2="6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="33.5" x2="20" y2="37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="3" y1="20" x2="6.5" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="33.5" y1="20" x2="37" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      {/* Typography Wordmark in Single Color */}
      {showText && (
        <span
          
         className={["nxs-142s9zd", nexusStyleClass("fontSize", isVertical ? Math.max(size * 0.52, 20) : Math.max(size * 0.58, 19)), nexusStyleClass("color", textColor)].filter(Boolean).join(" ")}>
          <span>NEXUS</span>
        </span>
      )}
    </div>
  );
}
