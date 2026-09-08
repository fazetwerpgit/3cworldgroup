'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SignatureMethod, StoredSignature } from './signatureStore';

/** Ink width in CSS pixels; thick enough to survive being scaled into the PDF box. */
const STROKE_WIDTH = 2.5;
/** Transparent margin kept around the ink so the stamp does not clip the strokes. */
const EXPORT_PADDING = 8;
/** Rendered at 96px so a typed signature stays crisp after the PDF scales it. */
const TYPE_FONT_SIZE = 96;
const SCRIPT_FONT_STACK = '"Dancing Script", cursive';

interface Props {
  /** The signature the page currently holds, shown as a preview. */
  value: StoredSignature | null;
  /** Seeds the Type tab so the common case is one tap. */
  signerName?: string;
  /** Called with a PNG data URL, or null when the rep clears their signature. */
  onChange: (png: string | null, method: SignatureMethod) => void;
}

/**
 * Crops a canvas to its non-transparent pixels plus padding and returns a PNG
 * data URL, or null when nothing was drawn. The server scales whatever it gets
 * into the signature box, so trimming is what stops a small signature drawn in
 * one corner of the pad from being shrunk to a speck in the document.
 */
function toTrimmedPng(source: HTMLCanvasElement): string | null {
  const context = source.getContext('2d');
  if (!context || source.width === 0 || source.height === 0) return null;

  const { width, height } = source;
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Only the alpha channel matters: the ink is opaque, the rest is clear.
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null; // Nothing was drawn.

  const left = Math.max(0, minX - EXPORT_PADDING);
  const top = Math.max(0, minY - EXPORT_PADDING);
  const right = Math.min(width, maxX + 1 + EXPORT_PADDING);
  const bottom = Math.min(height, maxY + 1 + EXPORT_PADDING);

  const trimmed = document.createElement('canvas');
  trimmed.width = right - left;
  trimmed.height = bottom - top;
  const trimmedContext = trimmed.getContext('2d');
  if (!trimmedContext) return null;
  trimmedContext.drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed.toDataURL('image/png');
}

/** Draws the typed name in the script font and returns it as a trimmed PNG. */
async function renderTypedSignature(name: string): Promise<string | null> {
  const text = name.trim();
  if (!text) return null;

  // The face is declared by the sign page's stylesheet; ask for it explicitly
  // so the first render is not silently drawn in the fallback cursive font.
  try {
    await document.fonts?.load(`${TYPE_FONT_SIZE}px ${SCRIPT_FONT_STACK}`);
  } catch {
    // Fall through and draw with whatever the browser resolves.
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;

  const font = `${TYPE_FONT_SIZE}px ${SCRIPT_FONT_STACK}`;
  context.font = font;
  const metrics = context.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || TYPE_FONT_SIZE * 0.8;
  const descent = metrics.actualBoundingBoxDescent || TYPE_FONT_SIZE * 0.35;

  canvas.width = Math.ceil(metrics.width) + EXPORT_PADDING * 2;
  canvas.height = Math.ceil(ascent + descent) + EXPORT_PADDING * 2;
  // Resizing a canvas resets its context state, so restore the font here.
  context.font = font;
  context.fillStyle = '#000000';
  context.textBaseline = 'alphabetic';
  context.fillText(text, EXPORT_PADDING, EXPORT_PADDING + ascent);

  return toTrimmedPng(canvas);
}

export function SignaturePad({ value, signerName = '', onChange }: Props) {
  const [tab, setTab] = useState<SignatureMethod>(value?.method ?? 'draw');
  const [typedName, setTypedName] = useState(signerName);
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mirrors `hasInk` for code that runs outside render (resize, pointer
  // handlers) and must not read stale state.
  const hasInkRef = useRef(false);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  // Typing is faster than rendering; only the newest render may report back.
  const typeRequest = useRef(0);
  // Set on the first keystroke so an empty Type tab never clears a signature
  // carried over from an earlier document in the set.
  const typedTouched = useRef(false);

  const context = () => canvasRef.current?.getContext('2d') ?? null;

  const markInk = (value: boolean) => {
    hasInkRef.current = value;
    setHasInk(value);
  };

  const applyStrokeStyle = (target: CanvasRenderingContext2D) => {
    target.lineWidth = STROKE_WIDTH;
    target.lineCap = 'round';
    target.lineJoin = 'round';
    target.strokeStyle = '#000000';
  };

  // Size the backing store to the device pixel ratio so strokes are not blurry
  // on an iPhone, and keep drawing coordinates in CSS pixels via the scale.
  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fitToBox = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width === width && canvas.height === height) return;

      canvas.width = width;
      canvas.height = height;
      const target = canvas.getContext('2d');
      if (!target) return;
      target.scale(ratio, ratio);
      applyStrokeStyle(target);
      // Resizing wipes the bitmap; say so rather than leaving a stale preview
      // of a signature that is no longer on the pad.
      if (hasInkRef.current) {
        markInk(false);
        onChange(null, 'draw');
      }
    };

    fitToBox();
    const observer = new ResizeObserver(fitToBox);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [tab, onChange]);

  // Re-render the typed signature whenever the name or the tab changes.
  useEffect(() => {
    if (tab !== 'type') return;
    if (!typedName.trim() && !typedTouched.current) return;
    const request = typeRequest.current + 1;
    typeRequest.current = request;

    void renderTypedSignature(typedName).then((png) => {
      if (typeRequest.current !== request) return; // A newer keystroke won.
      onChange(png, 'type');
    });
  }, [tab, typedName, onChange]);

  const pointIn = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const target = context();
    if (!target) return;
    // Capture so a finger that slides off the pad still finishes its stroke.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = pointIn(event);
    // A tap with no movement should still leave a dot.
    applyStrokeStyle(target);
    target.beginPath();
    target.arc(lastPoint.current.x, lastPoint.current.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
    target.fillStyle = '#000000';
    target.fill();
    markInk(true);
  };

  const extendStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const target = context();
    const previous = lastPoint.current;
    if (!target || !previous) return;
    const next = pointIn(event);
    target.beginPath();
    target.moveTo(previous.x, previous.y);
    target.lineTo(next.x, next.y);
    target.stroke();
    lastPoint.current = next;
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(toTrimmedPng(canvas), 'draw');
  };

  const clearDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    const target = context();
    if (canvas && target) {
      // clearRect works in the scaled space, so use CSS pixel dimensions.
      const ratio = window.devicePixelRatio || 1;
      target.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    }
    markInk(false);
    onChange(null, 'draw');
  }, [onChange]);

  return (
    <div className="grid gap-3">
      <div role="tablist" aria-label="Signature method" className="flex gap-2">
        {(['draw', 'type'] as const).map((method) => (
          <Button
            key={method}
            type="button"
            role="tab"
            aria-selected={tab === method}
            variant={tab === method ? 'default' : 'outline'}
            onClick={() => setTab(method)}
            className={tab === method ? 'bg-[#0A1F44] text-white hover:bg-[#0A1F44]/90' : ''}
          >
            {method === 'draw' ? 'Draw' : 'Type'}
          </Button>
        ))}
      </div>

      {tab === 'draw' ? (
        <div className="grid gap-2">
          <canvas
            ref={canvasRef}
            aria-label="Signature pad"
            // touch-action:none stops iOS from scrolling the page mid-stroke.
            className="h-40 w-full touch-none rounded-md border border-slate-300 bg-white"
            onPointerDown={startStroke}
            onPointerMove={extendStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Sign with your finger.</p>
            <Button type="button" variant="outline" size="sm" onClick={clearDrawing} disabled={!hasInk}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="esign-typed-name">
            Type your full name
          </label>
          <input
            id="esign-typed-name"
            value={typedName}
            onChange={(event) => {
              typedTouched.current = true;
              setTypedName(event.target.value);
            }}
            autoComplete="name"
            autoCapitalize="words"
            spellCheck={false}
            // 16px keeps iOS from zooming the page when the field is focused.
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base"
          />
          <div
            aria-hidden="true"
            className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-5xl leading-tight text-black"
            style={{ fontFamily: SCRIPT_FONT_STACK }}
          >
            {typedName.trim()}
          </div>
        </div>
      )}

      {value ? (
        <figure className="grid gap-1">
          <figcaption className="text-sm text-slate-500">Signature to be applied</figcaption>
          {/* Client-generated data URL, so next/image would add nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.png}
            alt="Your signature"
            className="h-16 w-auto max-w-full self-start object-contain"
          />
        </figure>
      ) : null}
    </div>
  );
}

export default SignaturePad;
