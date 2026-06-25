/**
 * Fly-to-cart micro-interaction. Clones a small circular "flyer" from the
 * source element to the cart target using the Web Animations API. Framework-
 * agnostic, cleans up after itself, and honors prefers-reduced-motion.
 */
export function flyToCart(opts: {
  sourceRect: DOMRect;
  target: HTMLElement;
  imageUrl?: string | null;
  onComplete?: () => void;
}): void {
  if (typeof window === "undefined") return;
  const { sourceRect, target, imageUrl, onComplete } = opts;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const targetRect = target.getBoundingClientRect();
  // Use the larger image side so non-square photos aren't clipped.
  const size = Math.max(sourceRect.width, sourceRect.height);

  const flyer = document.createElement("div");
  flyer.setAttribute("aria-hidden", "true");
  flyer.style.position = "fixed";
  flyer.style.left = `${sourceRect.left + sourceRect.width / 2 - size / 2}px`;
  flyer.style.top = `${sourceRect.top + sourceRect.height / 2 - size / 2}px`;
  flyer.style.width = `${size}px`;
  flyer.style.height = `${size}px`;
  flyer.style.zIndex = "1050";
  flyer.style.pointerEvents = "none";
  flyer.style.borderRadius = "9999px";
  flyer.style.overflow = "hidden";
  flyer.style.boxShadow = "0 10px 25px -5px rgb(79 70 229 / 0.5)";
  flyer.style.border = "2px solid var(--color-primary)";
  flyer.style.background = "var(--color-primary-soft)";
  flyer.style.display = "flex";
  flyer.style.alignItems = "center";
  flyer.style.justifyContent = "center";

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    flyer.appendChild(img);
  } else {
    flyer.style.color = "var(--color-primary)";
    flyer.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
  }

  document.body.appendChild(flyer);

  const dx =
    targetRect.left +
    targetRect.width / 2 -
    (sourceRect.left + sourceRect.width / 2);
  const dy =
    targetRect.top +
    targetRect.height / 2 -
    (sourceRect.top + sourceRect.height / 2);

  // Arc upwards in the middle third for a pleasant toss, then shrink as it
  // "drops" into the cart.
  const keyframes: Keyframe[] = [
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    {
      transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 52}px) scale(0.85)`,
      opacity: 1,
      offset: 0.4,
    },
    { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0.1 },
  ];

  const anim = flyer.animate(keyframes, {
    duration: reduce ? 0 : 600,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  });
  anim.onfinish = () => {
    flyer.remove();
    onComplete?.();
  };
}

/**
 * Pick the currently visible cart icon (desktop header vs. mobile sticky bar)
 * so the flyer always lands on the one the user can see.
 */
export function findCartTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll<HTMLElement>(
    "[data-cart-fly-target]",
  );
  let fallback: HTMLElement | null = null;
  for (const node of Array.from(nodes)) {
    if (!fallback) fallback = node;
    // offsetParent is null for display:none elements; a visible target has width.
    if (node.offsetWidth > 0 && node.getBoundingClientRect().width > 0) {
      return node;
    }
  }
  return fallback;
}
