import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../services";
import { SESSION_COOKIE } from "../http/security";

export async function currentUser() {
  return auth.readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
