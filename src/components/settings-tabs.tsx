import Link from "next/link";
const tabs = [
  { id: "meta", name: "Kết nối Meta", href: "/settings?tab=meta" },
  { id: "shopee", name: "Shopee", href: "/settings?tab=shopee" },
  { id: "telegram", name: "Telegram", href: "/settings?tab=telegram" },
  { id: "team", name: "Nhân viên", href: "/settings/team" },
  { id: "automation", name: "Automation", href: "/settings?tab=automation" },
  { id: "system", name: "System Health", href: "/settings?tab=system" },
  { id: "advanced", name: "Advanced Settings", href: "/settings?tab=advanced" },
];
export function SettingsTabs({ active }: { active: string }) {
  return (
    <nav className="tabs" aria-label="Cài đặt">
      {tabs.map((tab) => (
        <Link
          href={tab.href}
          key={tab.id}
          aria-current={active === tab.id ? "page" : undefined}
          className={active === tab.id ? "selected" : ""}
        >
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}
