/** Plugin data key holding the token a variable or style was created from. */
export const TOKEN_KEY = "token"

/**
 * Plugin data key holding a signature of the values last written. When the
 * current values no longer match it, someone edited the item by hand.
 */
export const APPLIED_KEY = "applied"

type Removable = {
  id: string
  name: string
  getPluginData(key: string): string
  remove(): void
}

/**
 * Handles the items this plugin created that the spec no longer mentions.
 * Those in unchecked groups stay in the file; the rest have left the theme
 * and are deleted.
 */
export function sweep(
  items: Removable[],
  kept: ReadonlySet<string>,
  retained: ReadonlySet<string>,
  write: boolean,
  summary: { orphans: string[]; deleted: string[] }
) {
  for (const item of items) {
    const key = item.getPluginData(TOKEN_KEY)
    if (!key || kept.has(item.id)) {
      continue
    }

    if (retained.has(key)) {
      summary.orphans.push(item.name)
    } else {
      summary.deleted.push(item.name)
      if (write) {
        item.remove()
      }
    }
  }
}
