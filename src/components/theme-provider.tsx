"use client"

import type { ReactNode } from "react"
import { ThemeProvider as NextThemeProvider } from "next-themes"

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <NextThemeProvider attribute="class" storageKey="albatextus-color-mode" defaultTheme="light" enableSystem={false}>
    {children}
  </NextThemeProvider>
}
