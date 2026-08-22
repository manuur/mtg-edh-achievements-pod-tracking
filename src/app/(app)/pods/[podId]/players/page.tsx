import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { MemberActions, MemberForm } from "@/components/forms/member-form";
import { requireUserContext } from "@/lib/auth/server";
import { getPod, listMembers } from "@/server/pods";

export default async function PlayersPage({ params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const context = await requireUserContext();
  const [pod, members] = await Promise.all([getPod(context, podId), listMembers(context, podId)]);
  return <div className="grid gap-6">
    <PageHeader title="Players" description="Membership roles apply only inside this POD. Unclaimed players can still appear in games as Guests." />
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden"><div className="hidden grid-cols-[1fr_120px_100px_220px] gap-3 border-b border-white/8 px-5 py-3 text-[10px] font-bold tracking-[.16em] text-stone-500 uppercase sm:grid"><span>Player</span><span>Account</span><span>Status</span><span>Access</span></div><div className="divide-y divide-white/7">{members.map((member) => <div key={member.playerId} className="grid gap-3 p-5 sm:grid-cols-[1fr_120px_100px_220px] sm:items-start"><div><Link href={`/players/${member.playerId}?podId=${podId}`} className="font-semibold hover:text-amber-200">{member.displayName}</Link><p className="mt-1 text-xs text-stone-500 sm:hidden">{member.role}</p></div><span className="pt-2 text-xs text-stone-400">{member.claimed ? "Claimed" : "Unclaimed"}</span><Badge tone={member.status === "ACTIVE" ? "green" : "neutral"} className="mt-1 w-fit">{member.status}</Badge>{pod.role === "ADMIN" ? <MemberActions podId={podId} playerId={member.playerId} role={member.role} status={member.status} claimed={member.claimed} version={member.version} /> : <Badge tone={member.role === "ADMIN" ? "amber" : member.role === "EDITOR" ? "violet" : "neutral"}>{member.role}</Badge>}</div>)}</div></Card>
      {pod.role === "ADMIN" && <Card className="h-fit p-5"><h2 className="font-display mb-1 text-xl">Add player</h2><p className="mb-5 text-xs leading-5 text-stone-500">An exact Google email lets this profile be claimed later. No email is sent.</p><MemberForm podId={podId} /></Card>}
    </div>
  </div>;
}
