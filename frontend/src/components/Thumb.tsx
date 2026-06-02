import { useState } from "react";

interface Props {
  src?: string;
  alt: string;
  className: string;
}

/** Product thumbnail: shows a shimmering skeleton while the image loads, fades the
 * image in on load, and falls back to a neutral placeholder when there's no image
 * (or it fails to load). `className` is the sized box from the calling screen. */
export function Thumb({ src, alt, className }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);

  if (!src || err) {
    return (
      <span className={className} aria-hidden="true"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem" }}>
        🛒
      </span>
    );
  }
  return (
    <span className={className} style={{ position: "relative", overflow: "hidden", display: "block" }}>
      {!loaded && <span data-testid="thumb-skeleton" className="skeleton"
        style={{ position: "absolute", inset: 0, borderRadius: "inherit" }} />}
      <img src={src} alt={alt} loading="lazy"
        onLoad={() => setLoaded(true)} onError={() => setErr(true)}
        style={{ width: "100%", height: "100%", objectFit: "contain",
                 opacity: loaded ? 1 : 0, transition: "opacity .25s ease" }} />
    </span>
  );
}
