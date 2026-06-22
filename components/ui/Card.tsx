import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover elevation + pointer affordance for clickable cards. */
  interactive?: boolean;
};

/**
 * Surface container with border-first elevation. Compose with CardHeader /
 * CardBody / CardFooter, or drop children directly.
 *
 * <Card><CardBody>…</CardBody></Card>
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-border rounded-lg shadow-sm",
        interactive &&
          "transition-shadow hover:shadow-md cursor-pointer focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
      {...rest}
    />
  );
});

export function CardHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-cell py-row border-b border-border flex items-center justify-between gap-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardBody({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-cell", className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-cell py-row border-t border-border flex items-center justify-end gap-2",
        className,
      )}
      {...rest}
    />
  );
}

export default Card;
