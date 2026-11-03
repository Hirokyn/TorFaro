import type { TorrentDetails } from "@/lib/contracts";
import { formatBytes, formatCount } from "@/lib/format";

export function FileList({ details, knownCount }: { details: TorrentDetails; knownCount: number | null }) {
  const count = details.fileCount ?? knownCount;

  return (
    <section aria-label="Arquivos" className="flex flex-col gap-1.5">
      <h2 className="text-sm font-medium">
        Arquivos{count !== null && <span className="text-muted-foreground"> ({formatCount(count)})</span>}
      </h2>

      {details.files.length > 0 ? (
        <ul className="max-h-96 overflow-y-auto rounded-lg border">
          {details.files.map((file) => (
            <li
              key={file.path}
              className="flex items-baseline justify-between gap-3 border-b px-3 py-1.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 break-all">{file.path}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Os nomes dos arquivos só aparecem nas fontes que entregam arquivo .torrent. Nesta fonte, eles ficam visíveis no
          cliente de torrent ou na página original.
        </p>
      )}
    </section>
  );
}

export function TrackerList({ trackers }: { trackers: string[] }) {
  if (trackers.length === 0) return null;

  return (
    <section aria-label="Trackers" className="flex flex-col gap-1.5">
      <h2 className="text-sm font-medium">
        Trackers <span className="text-muted-foreground">({formatCount(trackers.length)})</span>
      </h2>
      <ul className="max-h-56 overflow-y-auto rounded-lg border">
        {trackers.map((tracker) => (
          <li key={tracker} className="border-b px-3 py-1.5 font-mono text-xs break-all last:border-b-0">
            {tracker}
          </li>
        ))}
      </ul>
    </section>
  );
}
