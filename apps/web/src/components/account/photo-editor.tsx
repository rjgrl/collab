import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { AccountAvatar } from "@/components/account/account-avatar";
import { FilePicker } from "@/components/forms/file-picker";

/** Preview frame edge in CSS pixels and the saved image edge in pixels. */
const FRAME = 240;
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Loaded = { url: string; image: HTMLImageElement };

/**
 * Chosen-but-unsaved photo with zoom and pan. The parent saves `crop()` (a square image of
 * exactly what the frame shows) only when the user clicks Upload.
 */
export function usePhotoEditor() {
  const [file, setFile] = useState<File>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!file) {
      setLoaded(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    let alive = true;
    image.onload = () => {
      if (!alive) return;
      setLoaded({ url, image });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setError(undefined);
    };
    image.onerror = () => alive && setError("This file could not be read as an image.");
    image.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Size of the image at zoom 1 when it just covers the frame.
  const base = loaded ? FRAME / Math.min(loaded.image.naturalWidth, loaded.image.naturalHeight) : 1;
  const width = loaded ? loaded.image.naturalWidth * base * zoom : FRAME;
  const height = loaded ? loaded.image.naturalHeight * base * zoom : FRAME;
  // Keep the image covering the frame: no empty edges.
  const clamp = (x: number, y: number, w = width, h = height) => ({
    x: Math.max(-(w - FRAME) / 2, Math.min((w - FRAME) / 2, x)),
    y: Math.max(-(h - FRAME) / 2, Math.min((h - FRAME) / 2, y)),
  });

  return {
    file,
    loaded,
    zoom,
    offset,
    width,
    height,
    error,
    choose(next?: File) {
      setError(undefined);
      setFile(next);
    },
    reset() {
      setFile(undefined);
      setError(undefined);
    },
    setZoom(next: number) {
      const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      if (!loaded) return;
      const w = loaded.image.naturalWidth * base * value;
      const h = loaded.image.naturalHeight * base * value;
      setZoom(value);
      setOffset((current) => clamp(current.x, current.y, w, h));
    },
    move(dx: number, dy: number) {
      setOffset((current) => clamp(current.x + dx, current.y + dy));
    },
    recenter() {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    },
    /** Square PNG/JPEG of the framed area. */
    async crop(): Promise<File> {
      if (!file || !loaded) throw new Error("Choose a photo first.");
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser cannot prepare this photo.");
      const scale = OUTPUT / FRAME;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        loaded.image,
        (FRAME / 2 - width / 2 + offset.x) * scale,
        (FRAME / 2 - height / 2 + offset.y) * scale,
        width * scale,
        height * scale,
      );
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
      if (!blob) throw new Error("Your browser cannot prepare this photo.");
      const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
      return new File([blob], name, { type });
    },
  };
}

export type PhotoEditor = ReturnType<typeof usePhotoEditor>;

export function PhotoEditorView({
  editor,
  currentImage,
  name,
  inputId,
  accessibleLabel,
  accept,
  disabled,
  help,
}: {
  editor: PhotoEditor;
  currentImage?: string | null;
  name: string;
  inputId: string;
  accessibleLabel: string;
  accept: string;
  disabled?: boolean;
  help: string;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { loaded } = editor;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!loaded || disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    editor.move(event.clientX - drag.current.x, event.clientY - drag.current.y);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      editor.move(...moves[event.key]!);
    } else if (event.key === "+" || event.key === "=") editor.setZoom(editor.zoom + 0.1);
    else if (event.key === "-") editor.setZoom(editor.zoom - 0.1);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {loaded ? (
        <div
          role="group"
          aria-label="Photo preview. Drag or use arrow keys to move; plus and minus to zoom."
          tabIndex={0}
          className="relative cursor-grab touch-none overflow-hidden rounded-full border-4 border-background bg-muted shadow-md ring-1 ring-border outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(event) => editor.setZoom(editor.zoom - Math.sign(event.deltaY) * 0.1)}
          onKeyDown={onKeyDown}
        >
          <img
            src={loaded.url}
            alt="Preview of the chosen photo (not saved yet)"
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: editor.width,
              height: editor.height,
              left: FRAME / 2 - editor.width / 2 + editor.offset.x,
              top: FRAME / 2 - editor.height / 2 + editor.offset.y,
            }}
          />
        </div>
      ) : (
        <AccountAvatar
          image={currentImage}
          name={name}
          className="size-60 border-4 border-background shadow-md ring-1 ring-border"
        />
      )}

      {loaded ? (
        <div className="flex w-full max-w-xs items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={disabled || editor.zoom <= MIN_ZOOM}
            onClick={() => editor.setZoom(editor.zoom - 0.25)}
          >
            <Minus className="size-4" />
          </Button>
          <input
            type="range"
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={editor.zoom}
            disabled={disabled}
            onChange={(event) => editor.setZoom(Number(event.target.value))}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={disabled || editor.zoom >= MAX_ZOOM}
            onClick={() => editor.setZoom(editor.zoom + 0.25)}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Reset position and zoom"
            disabled={disabled}
            onClick={editor.recenter}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-1.5 text-center">
        <FilePicker
          id={inputId}
          file={editor.file}
          accept={accept}
          disabled={disabled}
          accessibleLabel={accessibleLabel}
          describedBy={`${inputId}-help`}
          chooseLabel={currentImage || editor.file ? "Choose another photo" : "Choose photo"}
          onChange={editor.choose}
        />
        <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
          {loaded ? "Not saved yet. Drag to move, zoom to fit, then upload. " : ""}
          {help}
        </p>
        {editor.error ? (
          <p role="alert" className="text-sm text-destructive">
            {editor.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
