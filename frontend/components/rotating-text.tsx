"use client";

import { useState, useEffect } from "react";

const words = [
  "OTC Trading",
  "P2P Trading",
  "Token Swaps",
  "Direct Sales",
  "Escrow Deals",
];

export function RotatingText() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % words.length);
        setIsAnimating(false);
      }, 600);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="inline-block min-w-[280px] md:min-w-[420px] text-center perspective-1000"
      style={{ perspective: '1000px' }}
    >
      <span
        className={`inline-block transition-all duration-500 ease-out ${
          isAnimating
            ? "opacity-0 rotate-x-90 scale-95"
            : "opacity-100 rotate-x-0 scale-100"
        }`}
        style={{
          transformStyle: 'preserve-3d',
          transform: isAnimating ? 'rotateX(90deg)' : 'rotateX(0deg)',
        }}
      >
        {words[currentIndex]}
      </span>
    </span>
  );
}
