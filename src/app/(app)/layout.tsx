import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getUserContext } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const context = await getUserContext();
  if (!context) redirect("/login");
  return <div className="min-h-screen lg:pl-64"><AppNav context={context} /><main className="mx-auto max-w-7xl px-5 py-8 pb-28 sm:px-8 lg:px-10 lg:py-10">{children}</main></div>;
}
