'use client';

import { useRef, useState } from 'react';
import f from '@/components/portal/rep/rep-forms.module.css';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

// A small draw-with-mouse/finger signature box. Emits a PNG data URL on each stroke
// end, or null when cleared. Intentionally dependency-free (raw canvas).
export default function SignaturePad({ onChange, width = 600, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (e.currentTarget.width / rect.width),
      y: (e.clientY - rect.top) * (e.currentTarget.height / rect.height),
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0A1F44';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    hasInk.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current && canvasRef.current) {
      setEmpty(false);
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className={f.sigWrap}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        aria-label="Signature box. Draw your signature with a finger or the mouse."
        // White paper on purpose: the stored PNG is dark ink on a clear background.
        className={f.sigCanvas}
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      <div className={f.sigBar}>
        <span className={empty ? f.hint : f.fileOk}>
          {empty ? 'Draw your signature above' : 'Signature captured'}
        </span>
        <button type="button" className={f.fileBtn} onClick={clear} disabled={empty}>
          Clear
        </button>
      </div>
    </div>
  );
}
