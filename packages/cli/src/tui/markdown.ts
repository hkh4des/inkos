import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const marked = new Marked();
marked.use(markedTerminal({
  width: Math.min(process.stdout.columns ?? 80, 100) - 8,
  reflowText: true,
  showSectionPrefix: false,
  tab: 2,
  // Preserve inline formatting through reflow: keep ** markers as plain text
  // so reflowText won't split ANSI codes across lines. Post-process converts them.
  listitem: (text: string) => text,
  strong: (text: string) => `**${text}**`,
  // cli-table3 defaults table headers to red; disable to inherit parent color
  tableOptions: { style: { head: [] } },
}) as never);

const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";

/**
 * Post-process marked-terminal output:
 * 1. Replace `* ` bullets with `· `
 * 2. Convert `**text**` markers to ANSI bold (applied after reflow to avoid code splitting)
 */
function postProcess(text: string): string {
  return text
    // Strip \x1b[0m (full reset) — it overrides the color set by Ink's <Text color>.
    // Table/block-level ANSI (e.g. [90m for borders, [39m for fg reset) is preserved.
    .replace(/\x1b\[0m/g, "")
    .replace(/^(\s*)\* /gm, "$1· ")
    .replace(/\*\*(.+?)\*\*/g, `${BOLD_ON}$1${BOLD_OFF}`);
}

export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text);
    if (typeof rendered !== "string") {
      return text;
    }
    return postProcess(rendered.replace(/\n+$/, ""));
  } catch {
    return text;
  }
}
