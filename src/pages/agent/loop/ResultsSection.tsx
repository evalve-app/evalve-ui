import type { ComponentProps } from "react";
import { LapPanel } from "./LapViews";

// The Results section of the loop page (MVP view): what occurred in each lap.
// For now it holds the lap grid.
export function ResultsSection(props: ComponentProps<typeof LapPanel>) {
  return <LapPanel {...props} />;
}
