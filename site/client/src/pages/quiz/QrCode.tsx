import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** A QR code as inline SVG (crisp at any size, no image request). */
export function QrCode({ text, label, size = 220 }: { text: string; label: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { d, n: n + 4 };
  }, [text]);
  return (
    <svg className="qr" role="img" aria-label={label} viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#fff" rx="2" />
      <path d={path.d} fill="#1a1533" />
    </svg>
  );
}
