import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";
import noEmojiInJsx from "./tooling/lint-rules/no-emoji-in-jsx.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Artefacts de build natif (Task 32) : native-bridge.js et consorts
    // copiés par Gradle dans android/*/build — jamais à linter.
    ignores: ["android/**/build/**", "android/.gradle/**"],
  },
  {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react-hooks/set-state-in-effect": "off",
    // MODE-988 : synchro refs pendant le rendu VOLONTAIRE (refs des callbacks
    // STT rafraîchies au rendu + injection dans AuthFlowContext) — pattern
    // préexistant documenté, même famille que purity/set-state-in-effect.
    "react-hooks/refs": "off",
    // MODE-989 : deps verbatim du HEAD dans use-ident-capture (runCniOcr :
    // [dossier?.cniRecto, dossier?.cniVerso, toast]) — le compilateur infère
    // setDossier en plus et refuse de « préserver » la mémoïsation manuelle.
    // React Compiler déjà désactivé (aucune compilation réelle) et les deps
    // sont gérées manuellement dans ce dépôt (exhaustive-deps off).
    "react-hooks/preserve-manual-memoization": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",

    // Product design rules (.agents/skills/product-design)
    "julaba/no-emoji-in-jsx": "warn",
  },
  plugins: {
    julaba: { rules: { "no-emoji-in-jsx": noEmojiInJsx } },
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "tooling/**", "public/**", ".kilo/**"]
}];

export default eslintConfig;
