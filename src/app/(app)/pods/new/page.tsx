import { Card, PageHeader } from "@/components/ui";
import { PodForm } from "@/components/forms/pod-form";

export default function NewPodPage() { return <div className="mx-auto grid max-w-2xl gap-8"><PageHeader eyebrow="New playgroup" title="Set a table." description="You become the first Administrator and can invite players after creation." /><Card className="p-6 sm:p-8"><PodForm /></Card></div>; }
