# Design Engineering

Invisible details compound into something that feels right.
Adapted from Emil Kowalski's design engineering philosophy for the Jùlaba project.

---

## Core Philosophy

### Taste is trained, not innate

Good taste is not personal preference. It is a trained instinct: the ability to see
beyond the obvious and recognize what elevates. When building UI for Jùlaba, don't
just make it work. Study why the best interfaces feel the way they do. Reverse
engineer animations. Inspect interactions. Be curious.

### Unseen details compound

Most details users never consciously notice. That is the point. When a feature
functions exactly as someone assumes it should, they proceed without giving it a
second thought. That is the goal.

> "All those unseen details combine to produce something that's just stunning, like
> a thousand barely audible voices all singing in tune." — Paul Graham

Every design engineering decision below exists because the aggregate of invisible
correctness creates interfaces people love without knowing why.

### Beauty is leverage

People select tools based on the overall experience, not just functionality. Good
defaults and good animations are real differentiators. In the Ivorian market,
Jùlaba's warmth, voice-first approach, and visual polish are competitive advantages.
Use beauty as leverage to stand out.

---

## The Animation Decision Framework

Before writing any animation code, answer these questions in order:

### 1. Should this animate at all?

See `animation-standards.md` > Frequency Table.

### 2. What is the purpose?

Every animation in Jùlaba must have a clear answer to "why does this animate?"

Valid purposes in Jùlaba's context:

- **Spatial consistency:** Screen transitions prevent jarring content replacement.
- **State indication:** OTP orbit = "verifying", green check = "success", spinner = "loading".
- **Feedback:** Button `scale(0.97)` confirms the interface heard the user (especially
  important for marchands who may have their eyes on the product, not the screen).
- **Preventing jarring change:** Elements appearing or disappearing without transition
  feel broken.
- **Brand moment:** Splash screen, onboarding, OTP verification — rare, first-time
  interactions where delight is justified.

If the purpose is just "it looks cool" and the user will see it often, **don't animate**.

### 3. What easing should it use?

See `animation-standards.md` > Easing Curves. The decision tree:

```
Is the element entering or exiting?
  Yes → ease-out (or --ease-out)
  No →
    Is it moving/morphing on screen?
      Yes → ease-in-out (or --ease-in-out)
    Is it a hover/color change?
      Yes → ease
    Is it constant motion (progress bar, voice wave)?
      Yes → linear
    Default → ease-out
```

### 4. How fast should it be?

See `animation-standards.md` > Duration Budgets.

**Rule: UI animations stay under 300ms.** Rare/first-time interactions can be slower.

---

## Component Building Principles

### Buttons must feel responsive

Add `active:scale-[0.97]` with `transition-transform duration-150 ease-out`. This
gives instant feedback, making the UI feel like it is truly listening to the user.
This applies to every pressable element — buttons, cards with `onClick`, tabs.

### Never animate from scale(0)

Start from `scale(0.95)` or higher, combined with `opacity: 0`. Even a barely-visible
initial scale makes the entrance feel more natural.

```tsx
{/* Bad */}
<div className="animate-[scaleIn_300ms]" style={{ transform: 'scale(0)' }} />

{/* Good */}
<div className="opacity-0 scale-95 transition-all duration-200 ease-out data-[mounted=true]:opacity-100 data-[mounted=true]:scale-100" />
```

### Make popovers origin-aware

Popovers scale from their trigger, not center. Modals stay centered.

### Use CSS transitions over keyframes for interruptible UI

Transitions can be interrupted and retargeted. Keyframes restart from zero.
For any interaction triggered rapidly (toasts, toggles, screen switches), use transitions.

### Animate enter states with @starting-style

The modern CSS way to animate element entry without JavaScript.
Fall back to `data-mounted` pattern for broader browser support.

### Use blur to mask imperfect transitions

When a crossfade feels off, add `filter: blur(2px)` during the transition.
Keep under 20px — heavy blur is expensive in Safari.

---

## Performance Rules

### Only animate transform and opacity

These skip layout and paint, running on the GPU.

### Framer Motion hardware acceleration caveat

Shorthand properties (`x`, `y`, `scale`) are NOT hardware-accelerated. Use the full
`transform` string for anything that runs while the page is busy.

### CSS animations beat JS under load

CSS runs off the main thread. Use CSS for predetermined motion; JS for dynamic,
interruptible motion.

### Don't update CSS variables on parents to drive child transforms

It recalculates styles for all children. Set `transform` directly on the element.

---

## The Sonner Principles (Applied to Jùlaba)

These principles come from building Sonner (13M+ weekly npm downloads) and apply
to every component we build:

1. **Developer experience is key.** The easiest component to adopt wins.
2. **Good defaults matter more than options.** Ship beautiful out of the box.
3. **Handle edge cases invisibly.** Users never notice these, and that is exactly right.
4. **Use transitions, not keyframes, for dynamic UI.** Toasts, toggles, state switches.
5. **Cohesion matters.** The easing, duration, and visual style must match the
   surface personality (warm for marchand, calm for identificateur, crisp for backoffice).
6. **The opacity + height combination** on entering/exiting lists is trial and error.
   There is no formula — adjust until it feels right.

---

## Jùlaba-Specific Craft Details

### Voice + Motion Coordination

On the marchand surface, voice feedback (`tataSpeak()`) already provides the primary
confirmation signal. Motion should complement, not compete:

- Voice says "Vente enregistrée" → button press feedback is sufficient.
- No need for additional celebratory animation on routine actions.
- Onboarding and first-time moments can combine voice and motion for impact.

### OTP Orbit (bo-auth-screen.tsx)

The orbit animation is a deliberate exception to the "under 300ms" rule:
- It is seen rarely (once per session, at most a few times per day).
- Its purpose is **state indication** ("the system is verifying your code").
- It uses `requestAnimationFrame` for the orbiting digits (appropriate — dynamic,
  predetermined path).
- The SVG dashed-stroke circle spinning is CSS keyframe-based (predetermined loop).
- The orbit radius (`r=52`) and box size (`51×51px`) were chosen to create a tight,
  precise visual that reinforces the security/precision message.

### Screen Transitions

The `screen-enter` class (fade-in-up, 250ms) is the standard screen entry animation.
It serves a functional purpose: preventing a jarring white flash between screens.
It is seen tens of times per day, so it stays under 300ms.

### Stagger for Dashboard Cards

Backoffice KPI cards and data lists should use 30–50ms stagger between items.
This creates a cascading effect that feels more natural than everything appearing
at once. Never block interaction while stagger plays.

---

## Review Format

When reviewing UI code with design engineering implications, use a markdown table:

| Before | After | Why |
| --- | --- | --- |
| `transition-all` | `transition-transform duration-150 ease-out` | Specify exact properties; `all` animates unintended properties off-GPU |
| `scale(0)` | `scale-95 opacity-0` | Nothing appears from nothing |