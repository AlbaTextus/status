import Link from "next/link"
import { Activity, Images, Link as LinkIcon, type LucideIcon } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { wikiUrl } from "@/lib/wiki"

/** Community repositories shown as icons beside the organisation link. */
const projects: { id: string; name: string; description: string; Icon: LucideIcon }[] = [
  { id: "connect", name: "Connect", description: "统一登录与授权", Icon: LinkIcon },
  { id: "imgbed", name: "ImgBed", description: "图床", Icon: Images },
  { id: "status", name: "Status", description: "服务状态", Icon: Activity },
]

export function SiteFooter() {
  return <footer className="home-footer" id="community">
    <div className="home-container">
      <div className="home-footer-grid">
        <div className="home-footer-brand">
          <Link href="/" className="home-footer-wordmark" aria-label="ALBATEXTUS 首页">ALBATEXTUS</Link>
          <TooltipProvider>
            <nav className="home-footer-links" aria-label="GitHub 与社区项目">
              <Tooltip>
                <TooltipTrigger render={<a className="home-footer-github" href="https://github.com/AlbaTextus" target="_blank" rel="noopener noreferrer" aria-label="ALBATEXTUS GitHub（新窗口）" />}>
                  {/* GitHub icon from lucide-react v0.468.0 (ISC), matching Connect. */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                    <path d="M9 18c-4.51 2-5-2-7-2" />
                  </svg>
                </TooltipTrigger>
                <TooltipContent>GitHub 组织</TooltipContent>
              </Tooltip>
              <span className="home-footer-links-divider" aria-hidden="true" />
              {projects.map(({ id, name, description, Icon }) => <Tooltip key={id}>
                <TooltipTrigger render={<a className="home-footer-github" href={`https://github.com/AlbaTextus/${id}`} target="_blank" rel="noopener noreferrer" aria-label={`${name} · ${description}（新窗口）`} />}>
                  <Icon size={18} aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>{name} · {description}</TooltipContent>
              </Tooltip>)}
            </nav>
          </TooltipProvider>
        </div>
      </div>
      <Separator />
      <div className="home-footer-bottom"><p>© 2026 ALBATEXTUS</p><nav className="home-footer-legal" aria-label="法律信息"><a href={wikiUrl("/privacy")}>隐私政策</a><a href={wikiUrl("/terms")}>服务条款</a></nav></div>
      <div className="home-footer-watermark" aria-hidden="true">ALBATEXTUS</div>
    </div>
  </footer>
}

export { SiteFooter as StatusFooter };
