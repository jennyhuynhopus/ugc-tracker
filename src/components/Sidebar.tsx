"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDoc, IconGrid, IconSettings, IconUsers, IconVideo } from "./icons";

const SECTIONS = [
  {
    label: "Analytics",
    links: [
      { href: "/", label: "Overview", icon: IconGrid },
      { href: "/videos", label: "Videos", icon: IconVideo },
      { href: "/creators", label: "Creators", icon: IconUsers },
    ],
  },
  {
    label: "Reports",
    links: [{ href: "/digests", label: "Digests", icon: IconDoc }],
  },
  {
    label: "Workspace",
    links: [{ href: "/settings", label: "Settings", icon: IconSettings }],
  },
];

export function Sidebar() {
  const path = usePathname();
  if (path === "/login") return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <aside className="sidebar">
      <nav className="sidebar-panel">
        <Link href="/" className="workspace">
          {/* biome-ignore lint/performance/noImgElement: static svg */}
          <img src="/favicon.svg" alt="" />
          <div>
            <div className="workspace-name">UGC Tracker</div>
            <div className="workspace-sub">Creator analytics</div>
          </div>
        </Link>
        {SECTIONS.map((section) => (
          <div key={section.label} style={{ display: "contents" }}>
            <div className="nav-section">{section.label}</div>
            {section.links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="nav-item" aria-current={isActive(href) ? "page" : undefined}>
                <Icon />
                {label}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">Stats refresh automatically once a video is posted.</div>
      </nav>
    </aside>
  );
}
