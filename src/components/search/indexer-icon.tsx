"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

// Fundos com contraste AA para texto branco. O ID do indexador escolhe a cor, estável e distinta entre IDs próximos.
const ICON_COLORS = [
  "bg-rose-700",
  "bg-sky-700",
  "bg-emerald-700",
  "bg-violet-700",
  "bg-amber-700",
  "bg-teal-700",
  "bg-fuchsia-700",
  "bg-blue-700",
  "bg-orange-700",
  "bg-indigo-700",
];

// Arquivos opcionais em public/indexers, que não acompanham o projeto por serem marcas de terceiros.
// Sem o arquivo, ou fora desta lista, a fonte recebe a sigla colorida.
const INDEXER_LOGOS: Record<string, string> = {
  "1337x": "1337x.png",
  extratorrentst: "extratorrentst.png",
  eztv: "eztv.png",
  internetarchive: "internetarchive.png",
  kickasstorrentsto: "kickasstorrentsto.png",
  kickasstorrentsws: "kickasstorrentsto.png",
  knaben: "knaben.png",
  limetorrents: "limetorrents.png",
  magnetdownload: "magnetdownload.png",
  nyaasi: "nyaasi.png",
  rutor: "rutor.png",
  subsplease: "subsplease.jpg",
  thepiratebay: "thepiratebay.png",
  torrentdownload: "torrentdownload.png",
  torrentdownloads: "torrentdownloads.png",
  uindex: "uindex.png",
  yts: "yts.png",
};

// Estas só existem em 16 px: esticadas ficam borradas, então aparecem no tamanho original e com pixels nítidos.
const SMALL_LOGOS = new Set([
  "eztv.png",
  "extratorrentst.png",
  "kickasstorrentsto.png",
  "limetorrents.png",
  "rutor.png",
  "subsplease.jpg",
  "thepiratebay.png",
  "torrentdownload.png",
  "torrentdownloads.png",
]);

export function indexerMonogram(name: string) {
  // Separa também nomes colados como TorrentProject2, para que fontes parecidas não repitam a sigla.
  const words = name
    .replace(/^the\s+/i, "")
    .split(/\s+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function IndexerIcon({ id, name, className }: { id: number; name: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  const logo = missing ? undefined : INDEXER_LOGOS[name.toLowerCase().replace(/[^a-z0-9]/g, "")];
  const small = logo !== undefined && SMALL_LOGOS.has(logo);

  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[9px] leading-none font-bold tracking-tight text-white",
        logo ? "bg-muted" : ICON_COLORS[id % ICON_COLORS.length],
        className,
      )}
    >
      {logo ? (
        <Image
          src={`/indexers/${logo}`}
          alt=""
          width={small ? 16 : 24}
          height={small ? 16 : 24}
          unoptimized
          onError={() => setMissing(true)}
          className={small ? "size-4 rounded-[3px] [image-rendering:pixelated]" : "size-full object-contain"}
        />
      ) : (
        <span aria-hidden>{indexerMonogram(name)}</span>
      )}
    </span>
  );
}
