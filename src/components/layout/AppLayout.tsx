import { ReactNode } from "react";

type AppLayoutProps = {
  className?: string;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

export function AppLayout({ className = "", left, center, right }: AppLayoutProps) {
  return (
    <main className={["app-layout", className].filter(Boolean).join(" ")}>
      <aside className="left-panel">{left}</aside>
      <section className="center-panel">{center}</section>
      <aside className="right-panel">{right}</aside>
    </main>
  );
}
