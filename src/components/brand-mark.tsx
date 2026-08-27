import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return <Image
    src="/brand/mark-color.svg"
    width={1024}
    height={1024}
    alt=""
    aria-hidden="true"
    loading="eager"
    unoptimized
    className={cn("shrink-0 object-contain", className)}
  />;
}
