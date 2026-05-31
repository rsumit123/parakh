import type { Product } from "../api/types";
import { gradeTone } from "./grade";

const TONE_BG: Record<string, [string, string]> = {
  good: ["#1fa463", "#0b3d2c"],
  ok: ["#f0a23b", "#9a6212"],
  bad: ["#e2574c", "#7e1e18"],
};

/** Render a branded result card to a PNG blob using canvas (no dependencies). */
export function renderShareCard(product: Product): Promise<Blob> {
  const { score } = product;
  const tone = gradeTone(score.grade);
  const [c1, c2] = TONE_BG[tone];

  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";

  // Brand
  ctx.font = "800 44px sans-serif";
  ctx.fillText("Parakh", W / 2, 130);
  ctx.font = "600 26px sans-serif";
  ctx.globalAlpha = 0.85;
  ctx.fillText("NUTRI-SCORE", W / 2, 250);
  ctx.globalAlpha = 1;

  // Grade ring
  const cx = W / 2;
  const cy = 470;
  const r = 150;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.font = "800 180px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(score.grade, cx, cy + 8);
  ctx.textBaseline = "alphabetic";

  // Score + verdict
  ctx.font = "800 56px sans-serif";
  ctx.fillText(`${score.overall} / 100`, W / 2, 730);
  ctx.font = "700 46px sans-serif";
  ctx.fillText(score.verdict, W / 2, 800);

  // Product name (truncated)
  const name = (product.name || "Unknown product").slice(0, 40);
  ctx.font = "600 40px sans-serif";
  ctx.globalAlpha = 0.92;
  ctx.fillText(name, W / 2, 900);
  ctx.globalAlpha = 1;

  // Footer
  ctx.font = "600 30px sans-serif";
  ctx.globalAlpha = 0.8;
  ctx.fillText("Scan your food at parakh.skdev.one", W / 2, 1010);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/** Share the result via the Web Share API (with image when supported), falling back
 *  to downloading the PNG. Returns the method used (for UX/messaging). */
export async function shareResult(product: Product): Promise<"shared" | "downloaded"> {
  const blob = await renderShareCard(product);
  const file = new File([blob], "parakh-score.png", { type: "image/png" });
  const text = `${product.name || "This product"} scored ${product.score.grade} (${product.score.overall}/100) on Parakh`;

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: "Parakh", text });
    return "shared";
  }

  // Fallback: trigger a download of the image.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "parakh-score.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
