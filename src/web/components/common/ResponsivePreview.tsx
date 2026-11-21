import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// An iframe gives viewport media queries the selected preview width while the
// portal preserves React context and uses the actual public rendering components.
export function ResponsivePreview({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [available, setAvailable] = useState(width);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) =>
      setAvailable(entries[0].contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!frame?.contentDocument) return;
    const doc = frame.contentDocument;
    const syncStyles = () => {
      doc.head.replaceChildren(
        ...Array.from(
          document.head.querySelectorAll('style, link[rel="stylesheet"]'),
        ).map((node) => node.cloneNode(true)),
      );
      doc.documentElement.className = document.documentElement.className;
    };
    syncStyles();
    const observer = new MutationObserver(syncStyles);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    setMount(doc.body);
    return () => observer.disconnect();
  }, [frame]);
  const scale = Math.min(1, available / width);
  return (
    <div
      ref={host}
      className="w-full overflow-hidden"
      style={{ height: 640 * scale }}
    >
      <iframe
        ref={setFrame}
        title={`Public page preview at ${width}px`}
        className="origin-top-left border-0"
        style={{ width, height: 640, transform: `scale(${scale})` }}
      />
      {mount && createPortal(children, mount)}
    </div>
  );
}
