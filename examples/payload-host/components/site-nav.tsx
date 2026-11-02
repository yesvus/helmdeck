import Link from "next/link";
import { readPublicNavigationMenu } from "@/lib/payload/menu";
import { navigationItemsToLinks } from "@/lib/navigation-render";

export async function SiteNav() {
  const links = await readPublicNavigationMenu()
    .then((items) => navigationItemsToLinks(items))
    .catch(() => [] as ReturnType<typeof navigationItemsToLinks>);
  if (links.length === 0) return null;
  return (
    <nav className="flex flex-wrap items-center gap-4">
      {links.map((link, index) => (
        <Link key={`${link.href}-${index}`} href={link.href} className="text-sm font-medium text-zinc-700 hover:text-amber-700" target={link.external ? "_blank" : undefined} rel={link.external ? "noreferrer" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
