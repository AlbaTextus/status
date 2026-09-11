import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const repository = "https://github.com/AlbaTextus/connect";

export function SiteFooter() {
  return (
    <footer className="home-footer" id="community">
      <div className="home-container">
        <div className="home-footer-grid">
          <div className="home-footer-brand">
            <Link href="/" className="home-footer-wordmark" aria-label="ALBATEXTUS 首页">
              ALBATEXTUS
            </Link>
          </div>
          <nav aria-label="社区项目" className="home-footer-column home-footer-projects">
            <h2>社区项目</h2>
            {["credit", "forum", "imgbed", "ouath", "staus", "wiki"].map(project => (
              <a
                key={project}
                href={`https://github.com/AlbaTextus/${project}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {project}
              </a>
            ))}
          </nav>
          <nav aria-label="项目与社区" className="home-footer-column">
            <h2>项目与社区</h2>
            <a href={repository} target="_blank" rel="noopener noreferrer">
              GitHub 源代码
            </a>
            <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer">
              问题反馈
            </a>
            <a href={`${repository}/commits/main`} target="_blank" rel="noopener noreferrer">
              更新记录
            </a>
          </nav>
        </div>
        <Separator />
        <div className="home-footer-bottom">
          <p>© 2026 ALBATEXTUS</p>
          <nav className="home-footer-legal" aria-label="法律信息">
            <Link href="/wiki/privacy">隐私政策</Link>
            <Link href="/wiki/terms">服务条款</Link>
          </nav>
        </div>
        <div className="home-footer-watermark" aria-hidden="true">
          ALBATEXTUS
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter as StatusFooter };
