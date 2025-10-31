import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

interface BentoCardProps {
  children: ReactNode;
  className?: string;
}

export function BentoCard({ children, className = "" }: BentoCardProps) {
  return (
    <Card className={`hover:bg-white/5 transition-all duration-300 hover:border-white/20 h-full overflow-hidden ${className}`}>
      {children}
    </Card>
  );
}
