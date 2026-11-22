export type StoreProgressLine =
  | { kind: "progress"; done: number; total: number; detail: string }
  | { kind: "result"; raw: string };

/** PowerShell 逐行输出：PGPROGRESS <done> <total> <detail> / PGRESULT <json> */
export function parseStoreProgressLine(line: string): StoreProgressLine | null {
  const text = line.trim();
  if (text.startsWith("PGPROGRESS ")) {
    const match = /^(\d+)\s+(\d+)\s+(.+)$/u.exec(text.slice("PGPROGRESS ".length).trim());
    if (!match) return null;
    return {
      kind: "progress",
      done: Number(match[1]),
      total: Number(match[2]),
      detail: match[3]!.trim(),
    };
  }
  if (text.startsWith("PGRESULT ")) {
    return { kind: "result", raw: text.slice("PGRESULT ".length) };
  }
  return null;
}
