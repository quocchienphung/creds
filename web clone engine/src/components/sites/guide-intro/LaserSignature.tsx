import { memo } from "react";
import inscription from "./engraving-paths.json";
import "./laser-signature.css";

/** The photographed grain lives only inside the incision, leaving the white workspace bare. */
export const LaserSignature = memo(function LaserSignature({texture}: {texture?: string}) {
  return <div className="laser-signature" role="img" aria-label={`Laser engraved: ${inscription.text}`}>
    <svg className="laser-signature__surface" viewBox="0 0 720 96" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="signature-heat"><stop stopColor="#fff"/><stop offset=".12" stopColor="#fff6cd"/><stop offset=".3" stopColor="#ffb445" stopOpacity=".8"/><stop offset="1" stopColor="#f5551d" stopOpacity="0"/></radialGradient>
        <filter id="signature-smoke"><feGaussianBlur stdDeviation="2.4"/></filter>
        {inscription.paths.map((letter, i) => <path key={i} id={`signature-glyph-${i}`} data-laser-trace data-letter={letter.char} d={letter.d} />)}
        <clipPath id="signature-completed"><path data-laser-completed d="M0 0" /></clipPath>
        <mask id="signature-active" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="96">
          <path data-laser-active-trace stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </mask>
      </defs>
      <image data-signature-texture data-source="/sites/guide-intro/engraving-plaster.jpg" href={texture} width="720" height="96" clipPath="url(#signature-completed)" />
      <image data-signature-active href={texture} width="720" height="96" mask="url(#signature-active)" opacity="0" />
      <g data-laser-head opacity="0">
        <path d="M-18-28 0 0" stroke="#ff6837" strokeOpacity=".38" strokeWidth="2.5"/>
        <path d="M-18-28 0 0" stroke="#fff4c9" strokeWidth=".7"/>
        <circle r="16" fill="url(#signature-heat)"/>
        <ellipse rx="2.2" ry="1.6" fill="#fff"/>
        <g data-laser-smoke filter="url(#signature-smoke)"><path d="M0-2C-9-12 10-19 1-31S-5-44 2-52" stroke="#8f8e88" strokeWidth="3" strokeOpacity=".14"/></g>
        {Array.from({length:10}, (_, i) => <line key={i} data-laser-spark stroke={i % 3 ? "#efa240" : "#ffc86e"} strokeWidth={i % 2 ? "1" : "1.5"} strokeLinecap="round" />)}
      </g>
    </svg>
  </div>;
});
