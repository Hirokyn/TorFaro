import { describe, expect, it } from "vitest";

import { formatAge, formatBytes, formatCount, formatRelative } from "@/lib/format";

describe("formatação", () => {
  it("formata tamanhos em unidades binárias", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_814_623_682)).toBe("1,7 GB");
    expect(formatBytes(150 * 1024 ** 2)).toBe("150 MB");
  });

  it("mostra traço para contagem ausente", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(1200)).toBe("1.200");
  });

  it("descreve datas relativas", () => {
    const now = Date.parse("2026-11-02T04:00:00Z");

    expect(formatRelative(null, now)).toBe("—");
    expect(formatRelative("2026-11-02T03:30:00Z", now)).toBe("agora");
    expect(formatRelative("2026-10-30T04:00:00Z", now)).toBe("há 3 dias");
    expect(formatRelative("2024-11-02T04:00:00Z", now)).toBe("há 2 anos");
    expect(formatRelative("2026-11-02T05:00:00Z", now)).toBe("agora");
  });

  it("resume a idade na lista compacta", () => {
    const now = Date.parse("2026-11-02T04:00:00Z");

    expect(formatAge(null, now)).toBe("—");
    expect(formatAge("2026-11-02T03:30:00Z", now)).toBe("agora");
    expect(formatAge("2026-11-01T23:00:00Z", now)).toBe("5h");
    expect(formatAge("2026-10-30T04:00:00Z", now)).toBe("3d");
    expect(formatAge("2026-08-02T04:00:00Z", now)).toBe("3m");
    expect(formatAge("2024-11-02T04:00:00Z", now)).toBe("2a");
  });
});
