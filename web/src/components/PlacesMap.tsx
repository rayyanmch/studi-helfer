"use client";

// Karte mit echten Kartenkacheln (OpenStreetMap, tile.openstreetmap.org), selbst gezeichnet ohne Karten-Bibliothek:
// Kacheln als Bilder, Pins nach Lage, Ziehen zum Verschieben, Plus/Minus zum Zoomen. Ohne Internet bleibt der Hintergrund
// ruhig grau und die Pins stehen trotzdem an der richtigen Stelle.

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { UNI, type Place } from "@/lib/places";

const TILE = 256;

/** Lage → Pixel in der ganzen Welt bei diesem Zoom (Web-Mercator, wie bei jeder Online-Karte). */
function world(lat: number, lon: number, z: number) {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export function PlacesMap({
  places,
  selected,
  onSelect,
  height,
  zoom: startZoom = 14,
  controls = false,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (id: string) => void;
  height: number;
  zoom?: number;
  controls?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [z, setZ] = useState(startZoom);
  // Mittelpunkt als Lage (nicht in Pixeln), damit er beim Zoomen stehen bleibt
  const [center, setCenter] = useState({ lat: UNI.lat, lon: UNI.lon });
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(120, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(120, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const c = world(center.lat, center.lon, z);
  const left = c.x - w / 2;
  const top = c.y - height / 2;
  const n = 2 ** z;
  const tiles: { key: string; x: number; y: number; tx: number; ty: number }[] = [];
  for (let ty = Math.max(0, Math.floor(top / TILE)); ty <= Math.min(n - 1, Math.floor((top + height) / TILE)); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
      tiles.push({ key: `${z}/${tx}/${ty}`, x: tx * TILE - left, y: ty * TILE - top, tx: ((tx % n) + n) % n, ty });
    }
  }
  const at = (lat: number, lon: number) => {
    const p = world(lat, lon, z);
    return [p.x - left, p.y - top] as const;
  };
  const [ux, uy] = at(UNI.lat, UNI.lon);

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, wx: c.x, wy: c.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const px = d.wx - (e.clientX - d.x);
    const py = d.wy - (e.clientY - d.y);
    const size = TILE * n;
    const lon = (px / size) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / size))) * 180) / Math.PI;
    setCenter({ lat, lon });
  };
  const up = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`no-drag relative touch-none select-none overflow-hidden rounded-[12px] bg-sunken shadow-[inset_0_0_0_1px_var(--line)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ height }}
    >
      {tiles.map((t) => (
        <span key={t.key} aria-hidden className="pointer-events-none absolute" style={{ left: t.x, top: t.y, width: TILE, height: TILE }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="map-tile size-full" alt="" draggable={false} src={tileUrl(z, t.tx, t.ty)} />
        </span>
      ))}

      <span
        aria-hidden
        className="pointer-events-none absolute z-[1] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--accent)] bg-white shadow-[0_0_0_6px_rgba(22,32,42,0.15)]"
        style={{ left: ux, top: uy }}
        title={UNI.name}
      />
      {places.slice(0, 60).map((p, i) => {
        const [x, y] = at(p.lat, p.lon);
        if (x < -20 || y < -20 || x > w + 20 || y > height + 20) return null;
        const on = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            title={p.name}
            aria-label={p.name}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent text-[10px] font-bold text-on-accent shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform hover:scale-110 ${on ? "z-[3] size-[30px] shadow-[0_0_0_4px_rgba(22,32,42,0.28)]" : "z-[2] size-[22px]"}`}
            style={{ left: x, top: y }}
          >
            {i + 1}
          </button>
        );
      })}

      {controls && (
        <div className="absolute right-2 top-2 z-[4] flex flex-col overflow-hidden rounded-[9px] bg-surface shadow-[0_1px_6px_rgba(0,0,0,0.25)]">
          <button aria-label="Zoom in" onClick={() => setZ((v) => Math.min(17, v + 1))} className="press flex size-8 items-center justify-center hover:bg-hover">
            <Plus size={16} aria-hidden />
          </button>
          <span aria-hidden className="h-px bg-line-soft" />
          <button aria-label="Zoom out" onClick={() => setZ((v) => Math.max(12, v - 1))} className="press flex size-8 items-center justify-center hover:bg-hover">
            <Minus size={16} aria-hidden />
          </button>
        </div>
      )}
      <span className="pointer-events-none absolute bottom-0 right-0 z-[4] rounded-tl-md bg-white/80 px-1.5 py-px text-[10px] text-[#444]">© OpenStreetMap contributors</span>
    </div>
  );
}
