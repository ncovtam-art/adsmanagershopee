import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Film,
  LayoutDashboard,
  Layers3,
  Megaphone,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
  Database,
  LogOut,
  Search,
  Plus,
  Activity,
  Clock,
  Link2,
  AlertCircle,
} from "lucide-react";
import type { ReactNode } from "react";

const icons = {
  overview: LayoutDashboard,
  pages: Layers3,
  videos: Film,
  ads: Megaphone,
  revenue: Wallet,
  settings: Settings2,
  shield: ShieldCheck,
  users: Users,
  zap: Zap,
  database: Database,
  logout: LogOut,
  search: Search,
  plus: Plus,
  activity: Activity,
  clock: Clock,
  link: Link2,
  alert: AlertCircle,
  arrow: ArrowUpRight,
  chevron: ChevronRight,
  check: Check,
  help: CircleHelp,
  chart: BarChart3,
};
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = icons[name as keyof typeof icons] ?? CircleHelp;
  return (
    <Component
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
      className={className}
    />
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "warning" | "purple";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : "success"}`}
      role={error ? "alert" : "status"}
    >
      <Icon name={error ? "alert" : "check"} size={18} />
      {children}
    </div>
  );
}
