import { IndexerIcon } from "@/components/search/indexer-icon";
import type { SearchResultDto } from "@/lib/contracts";
import { formatAge, formatCount, formatDate, formatRelative } from "@/lib/format";
import { categoryLabel, CODEC_LABELS, QUALITY_LABELS } from "@/lib/search/params";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_SOURCES = 3;

export function SeedersValue({ value }: { value: number | null }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        value === null || value === 0
          ? "text-muted-foreground"
          : value >= 10
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-amber-700 dark:text-amber-400",
      )}
    >
      {formatCount(value)}
    </span>
  );
}

export function PublishedDate({ value, compact = false }: { value: string | null; compact?: boolean }) {
  return <time title={formatDate(value)}>{compact ? formatAge(value) : formatRelative(value)}</time>;
}

export function ResultSources({ result }: { result: SearchResultDto }) {
  const visible = result.sources.slice(0, MAX_VISIBLE_SOURCES);
  const hidden = result.sources.length - visible.length;

  const details = result.sources
    .map((source) => `${source.indexerName} (${formatCount(source.seeders)})`)
    .join(", ");

  return (
    <span className="inline-flex items-center" title={result.sources.length > 1 ? details : undefined}>
      {visible.map((source, index) => (
        <IndexerIcon
          key={source.indexerId}
          id={source.indexerId}
          name={source.indexerName}
          className={cn(index > 0 && "-ml-1.5 ring-2 ring-background")}
        />
      ))}
      {hidden > 0 && <span className="ml-1 text-xs text-muted-foreground">+{hidden}</span>}
    </span>
  );
}

export function ResultTags({ result, compact = false }: { result: SearchResultDto; compact?: boolean }) {
  const tags = [
    result.quality && QUALITY_LABELS[result.quality],
    !compact && result.codec && CODEC_LABELS[result.codec],
  ].filter(Boolean);

  if (tags.length === 0) return null;

  return <span className="text-xs whitespace-nowrap text-muted-foreground">{tags.join(" · ")}</span>;
}

export function ResultTitle({ result, className }: { result: SearchResultDto; className?: string }) {
  if (!result.torrentActionToken) return <span className={className}>{result.title}</span>;

  return (
    <a
      href={`/resultado/${result.torrentActionToken}`}
      target="_blank"
      rel="noopener"
      className={cn(
        "rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {result.title}
    </a>
  );
}

export function ResultCategory({ result }: { result: SearchResultDto }) {
  const [category] = result.categories;

  if (!category) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <span className="inline-flex h-5 max-w-full items-center truncate rounded bg-muted px-1.5 align-middle text-xs text-foreground/80">
      {categoryLabel(category.id, category.name)}
    </span>
  );
}
