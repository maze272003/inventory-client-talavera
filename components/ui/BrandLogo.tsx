import Image from "next/image";
import { cn } from "./cn";

export type BrandLogoProps = {
  /** Pixel diameter of the circular badge. Default 40. */
  size?: number;
  className?: string;
  /**
   * Eagerly preload (skip lazy-loading). Use for above-the-fold marks like the
   * login screen and the sidebar. Default false.
   */
  priority?: boolean;
  /**
   * Image alt text. Defaults to the shop name; pass "" to mark the mark
   * decorative where adjacent text already names the brand.
   */
  alt?: string;
};

/**
 * The AZI MOTOR SHOP emblem (public/logoazi.png) rendered as a circular badge.
 * The source art is a 2000×2000 round logo on a transparent field, so clipping
 * to a circle drops the square corners and the mark reads as a coin. A small
 * zoom pushes the emblem's silver rim to the clip edge. Shared by the login
 * screen and the app nav so the brand mark stays identical everywhere.
 */
export function BrandLogo({
  size = 40,
  className,
  priority = false,
  alt = "AZI MOTOR SHOP",
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logoazi.png"
        alt={alt}
        fill
        priority={priority}
        sizes={`${size}px`}
        className="scale-[1.05] object-cover"
      />
    </span>
  );
}

export default BrandLogo;
