import type { Metadata } from "next";

import { ResultPage } from "@/components/result/result-page";

export const metadata: Metadata = {
  title: "Detalhes · TorFaro",
};

export default async function ResultRoute({ params }: PageProps<"/resultado/[token]">) {
  const { token } = await params;

  return <ResultPage token={token} />;
}
