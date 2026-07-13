import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "공사현황관리",
  description: "혜송산업개발 · 신진조경 공사현황관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
