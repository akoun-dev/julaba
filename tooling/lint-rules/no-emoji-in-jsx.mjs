/**
 * Custom ESLint rule: disallow emoji characters in JSX output.
 * Jùlaba's product design guidelines (.agents/skills/product-design) require
 * Lucide React icons instead of emoji in shipped UI code.
 */

// Matches emoji pictographs, symbols, flags, and variation/ZWJ sequences.
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u

function findEmoji(text) {
  const match = EMOJI_PATTERN.exec(text)
  return match ? match[0] : null
}

// Only flag string/template literals that are actually part of a JSX subtree
// (an attribute value or an expression rendered into JSX) — not arbitrary
// strings elsewhere in the file, like server-side log messages.
function isWithinJsx(context, node) {
  const ancestors = context.sourceCode.getAncestors(node)
  return ancestors.some((a) => a.type === 'JSXAttribute' || a.type === 'JSXExpressionContainer')
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow emoji characters in JSX text and string attributes',
    },
    schema: [],
    messages: {
      noEmoji: 'Emoji "{{emoji}}" is not allowed in JSX. Use a Lucide React icon instead.',
    },
  },
  create(context) {
    return {
      JSXText(node) {
        const emoji = findEmoji(node.value)
        if (emoji) {
          context.report({ node, messageId: 'noEmoji', data: { emoji } })
        }
      },
      Literal(node) {
        if (typeof node.value !== 'string') return
        if (!isWithinJsx(context, node)) return
        const emoji = findEmoji(node.value)
        if (emoji) {
          context.report({ node, messageId: 'noEmoji', data: { emoji } })
        }
      },
      TemplateElement(node) {
        const raw = node.value?.raw
        if (!raw) return
        if (!isWithinJsx(context, node)) return
        const emoji = findEmoji(raw)
        if (emoji) {
          context.report({ node, messageId: 'noEmoji', data: { emoji } })
        }
      },
    }
  },
}

export default rule
