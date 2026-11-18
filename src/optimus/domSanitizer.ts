export interface SanitizedPage {
  text: string;
  /** What was removed, so the audit trail shows the page tried something. */
  removed: { scripts: number; comments: number; hiddenElements: number; zeroWidthChars: number; injectionPhrases: number };
}

/** Phrases that address the model instead of the reader. */
const INJECTION_PHRASES: RegExp[] = [
  /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|prompts?)/gi,
  /disregard (?:all |any )?(?:previous|prior|above)/gi,
  /you are now (?:in )?(?:developer|dan|jailbreak)/gi,
  /system prompt/gi,
  /reveal (?:your|the) (?:instructions|prompt|api key|secret)/gi,
];

const HIDDEN_STYLE =
  /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\s*(?:;|"|')|font-size\s*:\s*0|height\s*:\s*0|width\s*:\s*0|left\s*:\s*-\d{3,}|text-indent\s*:\s*-\d{3,}|color\s*:\s*(?:transparent|rgba\([^)]*,\s*0\)))/i;

/**
 * The boolean \`hidden\` attribute, matched as a real attribute: preceded by
 * whitespace and followed by whitespace, "=" or the end of the tag. A bare
 * word match would also hit class="hidden-gem" or style="visibility:hidden"
 * and mislabel ordinary content.
 */
const HIDDEN_ATTR = /(?:^|\s)hidden(?=\s|=|\/|$)/i;

/** Void elements never have a closing tag, so they cannot open a hidden region. */
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);

/**
 * Remove the places a page can hide instructions from a human reader but not
 * from a model: scripts, styles, comments, invisible elements, zero-width
 * characters, and phrases aimed at the model. Hidden regions are removed by
 * tracking tag depth, so nested content inside a hidden element goes too.
 */
export function sanitizeDom(html: string): SanitizedPage {
  const removed = { scripts: 0, comments: 0, hiddenElements: 0, zeroWidthChars: 0, injectionPhrases: 0 };
  let s = html;

  s = s.replace(/<!--[\s\S]*?-->/g, () => ((removed.comments += 1), " "));
  s = s.replace(/<(script|style|noscript|template|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, () => ((removed.scripts += 1), " "));

  // Walk the tags, dropping everything inside an element whose own style or attributes hide it.
  const tag = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let out = "";
  let last = 0;
  let hiddenDepth = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(s))) {
    const [full, name, attrs] = m;
    const closing = full.startsWith("</");
    const selfClosing = /\/\s*>$/.test(full) || VOID.has(name.toLowerCase());
    if (hiddenDepth === 0) out += s.slice(last, m.index);
    last = m.index + full.length;

    if (closing) {
      if (hiddenDepth > 0) hiddenDepth -= 1;
    } else {
      const bare = attrs.replace(/"[^"]*"|'[^']*'/g, '""');
      const hides = HIDDEN_STYLE.test(attrs) || HIDDEN_ATTR.test(bare) || /aria-hidden\s*=\s*["']?true/i.test(attrs);
      if (hiddenDepth > 0) {
        if (!selfClosing) hiddenDepth += 1;
      } else if (hides) {
        removed.hiddenElements += 1;
        if (!selfClosing) hiddenDepth = 1;
      }
    }
    if (hiddenDepth === 0 && !closing) out += " ";
  }
  if (hiddenDepth === 0) out += s.slice(last);

  let text = out.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  text = text.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, () => ((removed.zeroWidthChars += 1), ""));
  for (const p of INJECTION_PHRASES) text = text.replace(p, () => ((removed.injectionPhrases += 1), "[REMOVED]"));
  return { text: text.replace(/\s+/g, " ").trim(), removed };
}
