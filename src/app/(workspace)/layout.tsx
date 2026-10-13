import { requireUser } from "@/server/auth/current";
import { settings } from "@/server/services";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const workspace = await settings.read(user);
  return (
    <AppShell user={user} workspaceName={workspace.name}>
      {children}
    </AppShell>
  );
}
