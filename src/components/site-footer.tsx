"use client"

import Link from "next/link"
import { SiteFooterContent } from "./site-footer-content"

export function SiteFooter() {
  return <SiteFooterContent LinkComponent={Link} brandHref="/status" />
}
