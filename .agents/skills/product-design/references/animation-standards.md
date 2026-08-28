# Animation Standards Reference

Precise values, curves, and rules for all motion in Jùlaba.
Distilled from Emil Kowalski's design engineering philosophy (animations.dev)
and adapted to the Jùlaba product surfaces.

---

## Easing Curves

### Decision Order

| Context | Easing | Why |
| --- | --- | --- |
| Entering or exiting | `ease-out` | Starts fast, feels responsive — the user watches the start most closely |
| Moving / morphing on screen | `ease-in-out` | Natural acceleration/deceleration |
| Hover / color change | `ease` | Smooth enough without drawing attention |
| Constant motion (progress, wave) | `linear` | No acceleration feels mechanical, which is correct for loops |
| Default (any UI) | `ease-out` | Safer default; never feels sluggish |

**Never `ease-in` on UI.** It starts slow, delaying the exact moment the user is
watching. `ease-out` at 200ms *feels* faster than `ease-in` at 200ms.

### Jùlaba Custom Curves

Define these in `globals.css` and use throughout:

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);        /* strong ease-out for UI interactions */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);    /* strong ease-in-out for on-screen movement */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer curve (from Ionic) */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* subtle bounce for delight moments */
}
```

Find additional curves at [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/).

### Per-Surface Personality

| Surface | Character | Preferred easing | Notes |
| --- | --- | --- | --- |
| Marchand | Warm, human, voice-first | `--ease-out`, `--ease-drawer` | Voice feedback already provides confirmation; motion should feel natural |
| Identificateur | Calm, professional | `--ease-out`, `--ease-in-out` | Less personality; field agents need speed and clarity |
| Backoffice | Crisp, fast, data-dense | `--ease-out` | Dashboard animations stay under 200ms; no bounce |
| Auth (BO) | Secure, precise | `--ease-out` | OTP orbit is the only decorative animation — it signals "processing" |

---

## Duration Budgets

| Element | Duration | Surface | Notes |
| --- | --- | --- | --- |
| Button press feedback | 100–160ms | All | `scale(0.97)` on `:active` |
| Tab / nav switch | 150–200ms | All | Crossfade or slide |
| Tooltips, small popovers | 125–200ms | Backoffice | Use `@starting-style` or mount pattern |
| Dropdowns, selects | 150–250ms | Backoffice | |
| Screen transitions | 200–250ms | All | `screen-enter` class |
| Wizard steps | 200–250ms | Marchand, Ident. | `stepIn` class |
| Modals / dialogs | 200–350ms | All | Backoffice can be faster (200ms) |
| Drawers / sheets | 200–400ms | All | Use `--ease-drawer` |
| OTP orbit verification | ~800ms | Auth | Decorative — explicitly allowed as rare/first-time |
| Success check mark | 400–600ms | Auth | Rare/first-time — allowed to be slower |
| Onboarding animations | 300–600ms | Marchand | Delight moment — can exceed 300ms |

**Rule: UI animations stay under 300ms** unless the element is rare/first-time.

A 180ms dropdown feels more responsive than a 400ms one.
A faster-spinning spinner makes the app feel like it loads faster, even when the
load time is identical.

---

## Frequency Table — Should It Animate?

| Frequency | Decision | Examples in Jùlaba |
| --- | --- | --- |
| 100+ times/day | **No animation. Ever.** | Bottom-bar tab switches (already instant), keyboard shortcuts |
| Tens of times/day | Remove or drastically reduce | Product list scrolls, form field focuses |
| Occasional | Standard animation | Modals, toasts, drawer open/close, screen transitions |
| Rare / first-time | Can add delight | OTP orbit, onboarding steps, success celebrations |

**Never animate keyboard-initiated actions.** They repeat hundreds of times daily;
animation makes them feel slow and disconnected.

Valid purposes for motion in Jùlaba:
- **Spatial consistency:** toast enters and exits from the same direction
- **State indication:** OTP orbit = "verifying", check mark = "success"
- **Feedback:** button `scale(0.97)` confirms the interface heard the user
- **Preventing jarring change:** screen-enter fade prevents a blank flash
- **Brand moment:** onboarding, splash screen

"It looks cool" on a frequently-seen element is **not** valid.

---

## Physicality

### Never scale(0)

Nothing in the real world appears from nothing. Elements animating from `scale(0)`
look like they come out of nowhere.

```css
/* Bad */
.entering { transform: scale(0); }

/* Good */
.entering { transform: scale(0.95); opacity: 0; }
```

### Origin-Aware Popovers

Popovers, dropdowns, and tooltips scale from their trigger, not center.
**Exception: modals.** Modals stay centered — they are not anchored to a trigger.

```css
.popover { transform-origin: var(--transform-origin); }
/* Modals keep: transform-origin: center; */
```

### Button Press Feedback

Every pressable element should feel responsive:

```css
.button {
  transition: transform 160ms ease-out;
}
.button:active {
  transform: scale(0.97);
}
```

In Tailwind: `active:scale-[0.97] transition-transform duration-150 ease-out`

### Touch Device Hover

Gate hover animations behind the media query to prevent false positives on tap:

```css
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); }
}
```

---

## Springs

Springs simulate real physics. They have no fixed duration — they settle based on
physical parameters. Use when:
- Drag interactions with momentum
- Elements that should feel "alive"
- Gestures that can be interrupted mid-animation
- Decorative mouse-tracking interactions (backoffice only — marchand is touch-only)

### Configuration

```js
// Apple-style (recommended — easier to reason about)
{ type: "spring", duration: 0.5, bounce: 0.2 }

// Traditional physics (more control)
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

Keep bounce subtle (0.1–0.3). Avoid bounce in most UI — reserve for drag-to-dismiss
and playful interactions. Marchand surface should generally avoid bounce; backoffice
can use it sparingly on drag interactions.

### Interruptibility Advantage

Springs maintain velocity when interrupted — CSS keyframes restart from zero.
This makes springs ideal for gestures users might reverse mid-motion.

---

## Interruptibility

CSS **transitions** can be interrupted and retargeted. **Keyframes** restart from
zero. For anything triggered rapidly (toasts, toggles, state switches), use
transitions.

```css
/* Interruptible — good for dynamic UI */
.toast { transition: transform 400ms ease; }

/* Not interruptible — avoid for dynamic UI */
@keyframes slideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
```

### @starting-style for Entry

Modern CSS entry animation without JavaScript:

```css
.toast {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

Legacy fallback for broader support:
```jsx
useEffect(() => { setMounted(true); }, []);
// <div data-mounted={mounted}>
```

---

## Asymmetric Timing

Slow where the user is deciding, fast where the system responds.

```css
.overlay { transition: clip-path 200ms ease-out; }            /* release: fast */
.button:active .overlay { transition: clip-path 2s linear; }  /* press: slow, deliberate */
```

---

## Performance

### Only Animate Transform and Opacity

These properties skip layout and paint, running on the GPU. Animating `padding`,
`margin`, `height`, `width`, `top`, or `left` triggers all three rendering steps.

### Don't Drive Child Transforms via CSS Variables

```js
// Bad: triggers recalc on all children
element.style.setProperty('--swipe-amount', `${distance}px`);

// Good: only affects this element
element.style.transform = `translateY(${distance}px)`;
```

### Framer Motion Shorthands Are NOT Hardware-Accelerated

`x`, `y`, `scale` props use `requestAnimationFrame` on the main thread and drop
frames under load. Use the full transform string:

```jsx
// NOT hardware accelerated (convenient but drops frames under load)
<motion.div animate={{ x: 100 }} />

// Hardware accelerated (stays smooth even when main thread is busy)
<motion.div animate={{ transform: "translateX(100px)" }} />
```

### CSS Animations Beat JS Under Load

CSS animations run off the main thread. When the browser is busy loading content or
running scripts, Framer Motion animations (rAF-based) drop frames. CSS animations
remain smooth.

**Prefer CSS for predetermined motion. Use JS/springs for dynamic, interruptible,
gesture-driven motion.**

### WAAPI for Programmatic CSS

The Web Animations API gives JavaScript control with CSS performance:

```js
element.animate(
  [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  { duration: 1000, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }
);
```

---

## Transforms & clip-path

- **`translate` percentages** are relative to the element's own size —
  `translateY(100%)` moves by the element's height. Prefer over hardcoded px.
- **`scale()` scales children too** (font, icons, content) — a feature for press feedback.
- **3D:** `rotateX/Y` + `transform-style: preserve-3d` for the OTP orbit and similar effects.
- **`clip-path: inset(t r b l)`** — each value clips from that side. Uses: reveal-on-scroll,
  hold-to-delete overlay, seamless tab transitions.

---

## Gestures & Drag

- **Momentum dismissal:** Don't require crossing a distance threshold. Compute velocity
  (`Math.abs(distance) / elapsedMs`). If `> ~0.11`, dismiss. A flick should be enough.
- **Damping at boundaries:** Dragging past a natural edge moves less the further you go.
- **Pointer capture** once dragging starts, so it continues when the pointer leaves bounds.
- **Multi-touch protection:** Ignore extra touch points after drag begins
  (`if (isDragging) return`).
- **Friction over hard stops** — allow over-drag with rising resistance.

---

## Blur to Mask Crossfades

When a crossfade shows two overlapping states despite tuning easing/duration, add
subtle `filter: blur(2px)` during the transition. Keep blur under 20px (heavy blur
is expensive, especially Safari).

---

## Stagger

Stagger group entrances; 30–80ms between items. Longer delays feel slow.
Stagger is decorative — never block interaction while it plays.

```css
.item { opacity: 0; transform: translateY(8px); animation: fadeIn 300ms ease-out forwards; }
.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 100ms; }
@keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
```

---

## Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  .element { animation: fade 0.2s ease; } /* keep opacity/color, drop transform-based motion */
}
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); } /* gate hover motion */
}
```

```jsx
const reduce = useReducedMotion();
const closedX = reduce ? 0 : '-100%';
```

Reduced motion means fewer and gentler animations, **not zero** — keep transitions
that aid comprehension (opacity, color). Remove movement and position changes.

---

## Cohesion

Match motion to the surface personality:

- **Marchand:** Warm, human. Slightly slower easing, no bounce. The voice system
  already provides feedback — motion should not compete.
- **Identificateur:** Calm, professional. Crisp, fast. Field agents work quickly.
- **Backoffice:** Data-dense, precise. Under 200ms for most interactions. No bounce.
- **Auth:** The OTP orbit is the only decorative animation. It signals "processing"
  and is seen rarely — justified.

When choosing animation values, consider the personality of the surface. A playful
component can be bouncier. A professional dashboard should be crisp and fast.
Match the motion to the mood.

---

## Debugging

- **Slow motion:** Bump duration 2–5× or use DevTools animation inspector. Check:
  colors crossfade cleanly, easing doesn't stop abruptly, `transform-origin` is
  right, coordinated properties stay in sync.
- **Frame-by-frame:** Chrome DevTools Animations panel reveals timing drift between
  coordinated properties.
- **Real devices:** For touch interactions (drawers, swipe), test on physical devices.
- **Fresh eyes:** Review animations the next day — imperfections invisible during
  development surface later.
