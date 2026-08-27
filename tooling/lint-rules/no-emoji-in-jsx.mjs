/**
 * @fileoverview Lint rule: no-emoji-in-ui (rule/no-emoji-in-ui)
 * 
 * Prevents emoji characters in JSX text content. Jùlaba uses Lucide React
 * icons exclusively — emojis render inconsistently, are inaccessible, and
 * break visual consistency.
 *
 * Source: .agents/skills/product-design/references/rules.md > rule/no-emoji-in-ui
 * 
 * Exceptions:
 * - String literals in non-JSX contexts (e.g., voice intent vocabulary)
 * - Test fixtures
 * - Comments
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow emoji characters in JSX text content. Use Lucide React icons instead.',
      category: 'Product Design',
      recommended: true,
    },
    schema: [],
    messages: {
      noEmojiInJsx:
        'Emoji found in JSX text content: "{{ emoji }}". Use a Lucide React icon component instead. See .agents/skills/product-design/references/rules.md > rule/no-emoji-in-ui',
    },
  },
  create(context) {
    // Emoji ranges: Common emojis (U+1F300–U+1F9FF), Symbols (U+2600–U+27BF),
    // Dingbats (U+2700–U+27BF), Supplemental (U+1FA00–U+1FAFF),
    // Pictographs (U+1F900–U+1F9FF), Misc Symbols (U+200D, U+20E3, U+FE0F)
    const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

    return {
      JSXText(node) {
        const matches = node.value.match(EMOJI_REGEX);
        if (!matches) return;

        // Filter out whitespace-only and invisible content
        const text = node.value.trim();
        if (!text) return;

        // Report the first emoji found
        context.report({
          node,
          messageId: 'noEmojiInJsx',
          data: { emoji: matches[0] },
        });
      },
    };
  },
};
