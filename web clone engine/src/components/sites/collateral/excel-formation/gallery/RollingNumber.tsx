"use client";

/** A number that rolls: one wheel per digit (ten stacked digits moved with translateY), a dash while there is nothing to show yet. Wheels are hidden from assistive technology; the label says the value. */
export function RollingNumber({ value, decimals = 0, intDigits = 1, suffix = "", label }: { value: number | null; decimals?: number; intDigits?: number; suffix?: string; label: string }) {
  const text = value === null ? "" : value.toFixed(decimals);
  const [whole = "", fraction = ""] = text.split(".");
  const wholeSlots: (number | null)[] = Array.from({ length: intDigits }, (_, i) => { const at = i - (intDigits - whole.length); return at >= 0 && whole[at] !== undefined ? Number(whole[at]) : null; });
  return <>
    <span className="sdr-number" aria-hidden="true" data-empty={value === null || undefined}>
      <span className="sdr-numberDash">–</span>
      <span className="sdr-numberValue">
        {wholeSlots.map((digit, i) => <Wheel key={`i${i}`} digit={digit} />)}
        {decimals > 0 && <>.{Array.from({ length: decimals }, (_, i) => <Wheel key={`f${i}`} digit={fraction[i] !== undefined ? Number(fraction[i]) : 0} />)}</>}
        {suffix && <span className="sdr-numberSuffix">{suffix}</span>}
      </span>
    </span>
    <span className="sr-only">{label}</span>
  </>;
}

function Wheel({ digit }: { digit: number | null }) {
  return <span className="sdr-wheelSlot" data-off={digit === null || undefined}>
    <span className="sdr-wheel"><span className="sdr-strip" style={{ transform: `translateY(${-(digit ?? 0) * 10}%)` }}>{Array.from({ length: 10 }, (_, i) => <span key={i}>{i}</span>)}</span></span>
  </span>;
}
