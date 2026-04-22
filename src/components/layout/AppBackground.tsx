'use client';

import { ShapeGrid } from '@/components/ui/ShapeGrid';

export function AppBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-60 [mask-image:radial-gradient(ellipse_72%_58%_at_50%_38%,black_32%,transparent_88%)]"
    >
      <ShapeGrid
        shape="hexagon"
        direction="diagonal"
        speed={0.12}
        squareSize={22}
        borderColor="hsl(240 8% 14% / 0.6)"
        hoverFillColor="hsl(35 92% 52% / 0.06)"
        hoverTrailAmount={0}
      />
    </div>
  );
}
