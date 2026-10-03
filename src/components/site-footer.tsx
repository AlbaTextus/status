"use client"

import Link from "next/link"
import { SiteFooter as SharedSiteFooter } from "@albatextus/ui"
import { wikiUrl } from "@/lib/wiki"

export function SiteFooter() {
  return <SharedSiteFooter LinkComponent={Link} wikiOrigin={wikiUrl()} />
}
