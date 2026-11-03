// Static photographic moulding is shaded once, before the animation starts.
export function FrameCraft({texture}: {texture?: string}) {
  return <svg className="frame-craft" viewBox="0 0 1000 800" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <defs>
      <path data-frame-stroke d="M500 19H941Q981 19 981 59V741Q981 781 941 781H59Q19 781 19 741V59Q19 19 59 19H500Z" />
      <clipPath id="studio-frame-reveal"><path data-frame-clip d="M0 0" /></clipPath>
    </defs>
    <image data-frame-texture data-source="/sites/guide-intro/cassetta-frame-met.jpg" href={texture} width="1000" height="800" clipPath="url(#studio-frame-reveal)" />
  </svg>;
}
