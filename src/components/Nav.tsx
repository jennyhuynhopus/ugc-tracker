"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Videos" },
  { href: "/creators", label: "Creators" },
  { href: "/digests", label: "Digests" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <img src="/favicon.svg" alt="" width={22} height={22} />
        UGC Tracker
      </Link>
      <div className="nav-links">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" || path.startsWith("/videos") : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
