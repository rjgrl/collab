import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { AccountAvatar, photoSource } from "@/components/account/account-avatar";
import { FilePicker } from "@/components/forms/file-picker";

/** Preview frame edge in CSS pixels and the saved image edge in pixels. */
const FRAME = 240;
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Source = { file: File; url: string; image: HTMLImageElement; fromCurrent: boolean };
type View = { zoom: number; x: number; y: number };
const CENTER: View = { zoom: 1, x: 0, y: 0 };

function loadImage(file: File, fromCurrent: boolean) {
  return new Promise<Source>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ file, url, image, fromCurrent });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as an image."));
    };
    image.src = url;
  });
}

/**
 * Photo being edited: a newly chosen file, or the current photo re-opened for repositioning.
 * Nothing is saved here; the parent saves `crop()` or applies `removed` when the user saves.
 */
export function usePhotoEditor(currentImage?: string | null) {
  const [source, setSource] = useState<Source>();
  const [view, setView] = useState<View>(CENTER);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string>();
  // Pointer drags write here and to the DOM directly; React state follows on release.
  const live = useRef<View>(CENTER);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frame = useRef(0);

  const replace = useCallback((next?: Source) => {
    setSource(next);
    live.current = CENTER;
    setView(CENTER);
  }, []);
  // Bumped to re-open the current photo after Discard or a save.
  const [reload, setReload] = useState(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Open the current photo for repositioning; a missing photo keeps the placeholder.
  const currentUrl = photoSource(currentImage);
  useEffect(() => {
    if (!currentUrl) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(currentUrl, { credentials: "include" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return;
        const loaded = await loadImage(
          new File([blob], "profile-photo", { type: blob.type }),
          true,
        );
        if (alive) replace(loaded);
        else URL.revokeObjectURL(loaded.url);
      } catch {
        // Not editable (for example an external host without CORS): show it as before.
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentUrl, replace, reload]);
  // Each source owns an object URL; release the previous one when it is replaced.
  useEffect(() => () => source && URL.revokeObjectURL(source.url), [source]);

  // Size at zoom 1 when the image just covers the frame.
  const base = source ? FRAME / Math.min(source.image.naturalWidth, source.image.naturalHeight) : 1;
  const baseWidth = source ? source.image.naturalWidth * base : FRAME;
  const baseHeight = source ? source.image.naturalHeight * base : FRAME;
  const clamp = (next: View): View => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom));
    const maxX = (baseWidth * zoom - FRAME) / 2;
    const maxY = (baseHeight * zoom - FRAME) / 2;
    return {
      zoom,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };
  const paint = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const { zoom, x, y } = live.current;
      if (imageRef.current)
        imageRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
    });
  };
  const commit = (next: View) => {
    live.current = clamp(next);
    paint();
    setView(live.current);
  };

  const adjusted = view.zoom !== CENTER.zoom || view.x !== CENTER.x || view.y !== CENTER.y;
  return {
    source,
    file: source && !source.fromCurrent ? source.file : undefined,
    view,
    removed,
    error,
    baseWidth,
    baseHeight,
    imageRef,
    /** True when saving would change something. */
    dirty: removed || Boolean(source && (!source.fromCurrent || adjusted)),
    isNewFile: Boolean(source && !source.fromCurrent),
    async choose(next?: File) {
      setError(undefined);
      if (!next) return;
      try {
        replace(await loadImage(next, false));
        setRemoved(false);
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    remove() {
      replace(undefined);
      setRemoved(true);
    },
    /** Drop unsaved changes and show the current photo again. */
    discard() {
      replace(undefined);
      setRemoved(false);
      setError(undefined);
      setReload((value) => value + 1);
    },
    /** Live, unrendered pan used while dragging. */
    nudge(dx: number, dy: number) {
      live.current = clamp({ ...live.current, x: live.current.x + dx, y: live.current.y + dy });
      paint();
    },
    settle() {
      setView(live.current);
    },
    move(dx: number, dy: number) {
      commit({ ...live.current, x: live.current.x + dx, y: live.current.y + dy });
    },
    setZoom(zoom: number) {
      commit({ ...live.current, zoom });
    },
    recenter() {
      commit(CENTER);
    },
    /** Square image of exactly what the frame shows. */
    async crop(): Promise<File> {
      if (!source) throw new Error("Choose a photo first.");
      const { zoom, x, y } = live.current;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser cannot prepare this photo.");
      const scale = OUTPUT / FRAME;
      const width = baseWidth * zoom;
      const height = baseHeight * zoom;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        source.image,
        (FRAME / 2 - width / 2 + x) * scale,
        (FRAME / 2 - height / 2 + y) * scale,
        width * scale,
        height * scale,
      );
      const type = source.file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
      if (!blob) throw new Error("Your browser cannot prepare this photo.");
      const stem = source.fromCurrent ? "profile-photo" : source.file.name.replace(/\.[^.]+$/, "");
      return new File([blob], `${stem}${type === "image/png" ? ".png" : ".jpg"}`, { type });
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
  const { source, view } = editor;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!source || disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    editor.nudge(event.clientX - drag.current.x, event.clientY - drag.current.y);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    editor.settle();
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) =>
    editor.setZoom(view.zoom - Math.sign(event.deltaY) * 0.1);
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
    } else if (event.key === "+" || event.key === "=") editor.setZoom(view.zoom + 0.1);
    else if (event.key === "-") editor.setZoom(view.zoom - 0.1);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {source ? (
        <div
          role="group"
          aria-label="Photo preview. Drag or use arrow keys to move; plus and minus to zoom."
          tabIndex={0}
          className="relative cursor-grab touch-none overflow-hidden rounded-full border-4 border-background bg-muted shadow-md ring-1 ring-border outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        >
          <img
            ref={editor.imageRef}
            src={source.url}
            alt={
              source.fromCurrent
                ? `${name}'s profile photo`
                : "Preview of the chosen photo (not saved yet)"
            }
            draggable={false}
            className="pointer-events-none absolute max-w-none origin-center will-change-transform"
            style={{
              width: editor.baseWidth,
              height: editor.baseHeight,
              left: (FRAME - editor.baseWidth) / 2,
              top: (FRAME - editor.baseHeight) / 2,
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
            }}
          />
        </div>
      ) : (
        <AccountAvatar
          image={editor.removed ? null : currentImage}
          name={name}
          className="size-60 border-4 border-background shadow-md ring-1 ring-border"
        />
      )}

      {source ? (
        <div className="flex w-full max-w-xs items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={disabled || view.zoom <= MIN_ZOOM}
            onClick={() => editor.setZoom(view.zoom - 0.25)}
          >
            <Minus className="size-4" />
          </Button>
          <input
            type="range"
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            disabled={disabled}
            onChange={(event) => editor.setZoom(Number(event.target.value))}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={disabled || view.zoom >= MAX_ZOOM}
            onClick={() => editor.setZoom(view.zoom + 0.25)}
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
          chooseLabel={source || currentImage ? "Choose another photo" : "Choose photo"}
          onChange={(file) => void editor.choose(file)}
        />
        <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
          {editor.removed
            ? "Photo will be removed when you save. "
            : editor.dirty
              ? "Not saved yet. "
              : source
                ? "Drag to move or zoom to adjust. "
                : ""}
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
