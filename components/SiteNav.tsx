"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Lokoja" },
  { href: "/river", label: "Any river" },
  { href: "/fund", label: "The fund" },
  { href: "/docs", label: "Docs" },
];

export default function SiteNav() {
  const path = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
