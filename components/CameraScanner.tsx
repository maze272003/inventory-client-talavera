"use client";

import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Dialog } from "@/components/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
};

const HINT_TEXT = "Point the camera at a barcode.";
const ERROR_TEXT =
  "Camera unavailable — check permissions or type the SKU instead.";

export default function CameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const scanLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset status text whenever open toggles.
    if (statusRef.current) statusRef.current.textContent = HINT_TEXT;
    if (scanLineRef.current) scanLineRef.current.hidden = false;

    if (!open) return;

    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: IScannerControls | null = null;

    // decodeFromVideoDevice(deviceId, previewElem, callbackFn): Promise<IScannerControls>
    // callback: (result: Result | undefined, error: Exception | undefined, controls: IScannerControls) => void
    reader
      .decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (result) => {
          if (result && !stopped) {
            stopped = true;
            controls?.stop();
            onDetected(result.getText());
            onClose();
          }
        },
      )
      .then((c) => {
        controls = c;
        // If stop was called before the promise resolved, stop immediately.
        if (stopped) c.stop();
      })
      .catch(() => {
        if (statusRef.current) statusRef.current.textContent = ERROR_TEXT;
        if (scanLineRef.current) scanLineRef.current.hidden = true;
      });

    return () => {
      stopped = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="Scan barcode" size="sm">
      <div className="space-y-3">
        {/* Video viewport with scan-line animation */}
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="aspect-video w-full object-cover"
            muted
            playsInline
          />
          {/* Scan-line: sweeps top→bottom to signal active scanning */}
          <div
            ref={scanLineRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-green-400/80"
            style={{ animation: "scan-sweep 1.8s linear infinite" }}
          />
          <style>{`
            @keyframes scan-sweep {
              0%   { transform: translateY(0); }
              100% { transform: translateY(180px); }
            }
            @media (prefers-reduced-motion: reduce) {
              .cs-scan-line { animation: none; }
            }
          `}</style>
        </div>

        {/* Status / error */}
        <p ref={statusRef} role="status" className="text-xs text-text-muted">
          {HINT_TEXT}
        </p>
      </div>
    </Dialog>
  );
}
