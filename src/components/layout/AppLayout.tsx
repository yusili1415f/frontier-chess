import { ReactNode } from "react";

type AppLayoutProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

export function AppLayout({ left, center, right }: AppLayoutProps) {
  return (
    <main className="app-layout">
      <aside className="left-panel">{left}</aside>
      <section className="center-panel">{center}</section>
      <aside className="right-panel">{right}</aside>
    </main>
  );
}
