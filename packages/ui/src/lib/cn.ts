import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * clsx for conditionals, tailwind-merge to resolve conflicts so a caller's
 * `className` always beats the component's defaults instead of depending on
 * stylesheet order.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
