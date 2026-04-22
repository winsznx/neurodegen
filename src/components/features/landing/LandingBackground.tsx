'use client';

import { ShapeGrid } from '@/components/ui/ShapeGrid';

export function LandingBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 [mask-image:radial-gradient(ellipse_80%_65%_at_50%_35%,black_40%,transparent_90%)]"
    >
      <ShapeGrid
        shape="hexagon"
        direction="diagonal"
        speed={0.35}
        squareSize={26}
        borderColor="hsl(240 8% 13%)"
        hoverFillColor="hsl(35 92% 52% / 0.18)"
        hoverTrailAmount={6}
      />
    </div>
  );
}
