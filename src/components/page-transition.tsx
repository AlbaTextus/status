"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

export function PageTransition({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user"><div className="page-transition">{children}</div></MotionConfig>;
}
