import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = localFont({ src: "./fonts/inter.ttf", variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "AlbaTextus Status · 服务状态",
  description: "AlbaTextus 服务健康检测与公告。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
