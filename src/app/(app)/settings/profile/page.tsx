import { Card, PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/forms/profile-form";
import { requireUserContext } from "@/lib/auth/server";
import { getProfile } from "@/server/profile";

export default async function ProfileSettingsPage() {
  const context = await requireUserContext();
  const profile = await getProfile(context);
  return <div className="grid max-w-2xl gap-6"><PageHeader eyebrow="Account" title="Profile settings" description="This display name is shared across the PODs you join." /><Card className="p-5 sm:p-7"><ProfileForm profile={profile} /></Card></div>;
}
