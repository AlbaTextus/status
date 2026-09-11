import Link from "next/link"
import { Separator } from "@/components/ui/separator"

export function SiteFooter() {
  return <footer className="home-footer" id="community">
    <div className="home-container">
      <div className="home-footer-grid">
        <div className="home-footer-brand">
          <Link href="/" className="home-footer-wordmark" aria-label="ALBATEXTUS 首页">ALBATEXTUS</Link>
          <a className="home-footer-github" href="https://github.com/AlbaTextus" target="_blank" rel="noopener noreferrer" aria-label="ALBATEXTUS GitHub（新窗口）">
            {/* GitHub icon from lucide-react v0.468.0 (ISC), matching Connect. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
          </a>
        </div>
        <nav aria-label="社区项目" className="home-footer-column home-footer-projects">
          <h2>社区项目</h2>
          {["connect", "imgbed", "staus"].map(project => <a key={project} href={`https://github.com/AlbaTextus/${project}`} target="_blank" rel="noopener noreferrer">{project}</a>)}
        </nav>
      </div>
      <Separator />
      <div className="home-footer-bottom"><p>© 2026 ALBATEXTUS</p><nav className="home-footer-legal" aria-label="法律信息"><Link href="/wiki/privacy">隐私政策</Link><Link href="/wiki/terms">服务条款</Link></nav></div>
      <div className="home-footer-watermark" aria-hidden="true">ALBATEXTUS</div>
    </div>
  </footer>
}

export { SiteFooter as StatusFooter };
