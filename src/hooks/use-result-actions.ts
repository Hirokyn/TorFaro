"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ClientApiError, getJson } from "@/lib/client/api";
import { copyText } from "@/lib/client/clipboard";
import type { MagnetResponse, SearchResultDto } from "@/lib/contracts";

const COPIED_FEEDBACK_MS = 2_000;

async function loadMagnet(result: SearchResultDto) {
  if (result.magnetUrl) return result.magnetUrl;

  const { magnetUrl } = await getJson<MagnetResponse>(`/api/results/${result.torrentActionToken}/magnet`);
  return magnetUrl;
}

export function useResultActions(result: SearchResultDto) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Link comum: é o clique nele que autoriza o navegador a abrir o cliente de torrent do sistema.
  const openHref =
    result.magnetUrl ?? (result.torrentActionToken ? `/api/results/${result.torrentActionToken}/torrent` : null);

  async function copyMagnet() {
    setCopying(true);
    try {
      await copyText(await loadMagnet(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      toast.success("Magnet copiado");
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : "O navegador não permitiu copiar. Use o botão do ímã.",
      );
    } finally {
      setCopying(false);
    }
  }

  return { openHref, copying, copied, copyMagnet };
}
