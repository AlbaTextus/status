"use client"

import type { ElementType } from "react"
import { BrandCard } from "./brand-card"
import { Separator } from "./ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"


export type SiteFooterContentProps = {
  brandHref?: string
  /** Opt in to the legal links above the brand card. */
  wikiOrigin?: string
  LinkComponent?: ElementType
}

export function SiteFooterContent({ brandHref = "/", wikiOrigin, LinkComponent = "a" }: SiteFooterContentProps = {}) {
  const wikiUrl = (path: string) => (wikiOrigin ?? "").replace(/\/+$/, "") + path
  return <footer className="home-footer" id="community">
    <div className="home-container">
      <div className="home-footer-grid">
        <div className="home-footer-brand">
          <LinkComponent href={brandHref} className="home-footer-wordmark" aria-label="ALBATEXTUS 首页">ALBATEXTUS</LinkComponent>
          <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<a className="home-footer-github" href="https://github.com/AlbaTextus" target="_blank" rel="noopener noreferrer" aria-label="GitHub 组织" />}>
                  {/* GitHub icon from lucide-react v0.468.0 (ISC), matching Docs. */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                    <path d="M9 18c-4.51 2-5-2-7-2" />
                  </svg>
                </TooltipTrigger>
                <TooltipContent className="font-sans">GitHub 组织</TooltipContent>
              </Tooltip>
          </TooltipProvider>
        </div>
        <p className="home-footer-license">© ALBATEXTUS</p>
      </div>
      {wikiOrigin !== undefined && <>
        <Separator />
        <div className="home-footer-bottom"><nav className="home-footer-legal" aria-label="法律信息"><a href={wikiUrl("/privacy")}>隐私政策</a><a href={wikiUrl("/terms")}>服务条款</a></nav></div>
      </>}
      <BrandCard />
    </div>
  </footer>
}
