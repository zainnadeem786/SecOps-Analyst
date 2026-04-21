import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  label: string;
  description?: string;
}

export function LoadingState({ label, description }: LoadingStateProps) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-[#0f1828] px-5 py-10 text-center">
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      <p className="mt-4 text-sm font-medium text-white">{label}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p> : null}
    </div>
  );
}
