# CodePath — Design System

The reference for how CodePath looks and sounds. Every token lives in
`src/app/globals.css`; this document explains what they mean and when to reach for
each one.

**If you are adding UI, read "The seven rules" and skip the rest until you need it.**

---

## The seven rules

1. **Corners are square.** No radius, anywhere, ever.
2. **Structure is drawn with hairlines, not shadows.** A 1px border separates things; a
   shadow only appears on something that floats above the page.
3. **One accent.** Emerald means *live*, *progress*, or *primary action*. Nothing else
   is emerald.
4. **Four text tones, four surfaces, three line weights.** If you need a fifth, you are
   solving the problem wrong.
5. **Space Grotesk for people, JetBrains Mono for machines.** Prose is sans; anything
   the runtime produced or the learner will execute is mono.
6. **Everything is on a 4px grid.**
7. **No hard-coded values in components.** Hex codes, `rgba()`, `text-[13px]`,
   `p-[7px]` — all of these are bugs. Add a token.

---

## 1. Theme & personality

CodePath is a **terminal that teaches**. The visual language borrows from developer
tools rather than from courseware: black canvas, hairline frames, dense information,
monospace output, one signal colour. It should feel precise and slightly severe — the
opposite of a rounded, pastel, illustration-heavy learning app.

The animated background is the single expressive element. Everything layered on top of
it is restrained so the background never competes with content.

| Quality | We are | We are not |
|---|---|---|
| Shape | Square, orthogonal, gridded | Rounded, blobby, organic |
| Depth | Flat planes divided by hairlines | Soft drop shadows, neumorphism |
| Colour | Monochrome + one accent | Multi-hue, gradient-heavy |
| Density | Compact, information-rich | Airy, oversized, marketing-page |
| Motion | Short, functional, opacity/colour | Bouncy, springy, decorative |

---

## 2. Corners

**Radius is zero on every element.** This is enforced in three layers so it cannot
regress:

1. All `--radius-*` tokens are `0px`, which flattens `rounded`, `rounded-sm`,
   `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`.
2. A universal `border-radius: 0 !important` rule catches `rounded-full` (Tailwind
   computes it rather than reading a token) plus any radius baked into vendored CSS —
   Radix, Monaco, highlight.js.
3. Source files carry no `rounded-*` classes, so nothing suggests otherwise to the next
   person reading the code.

Do not add `rounded-*` classes. They will not render, and they mislead.

**Shapes that used to rely on radius:**

| Was | Now |
|---|---|
| `rounded-full` status dot | 6px square (`h-1.5 w-1.5`) — reads as a pixel/LED |
| `rounded-full` progress bar | Square-ended bar, flush in its track |
| `rounded-full` pill / chip | Square chip with a hairline border |
| `rounded-full` avatar | Square avatar |

---

## 3. Colour

### Surfaces

Panels are translucent white lifts over the animated background, never opaque greys.

| Token | Value | Use |
|---|---|---|
| `bg-surface-0` | `#000000` | Page canvas, editor gutter, console |
| `bg-surface-1` | `white 4%` | Default panel / card fill |
| `bg-surface-2` | `white 8%` | Hover, raised row, input |
| `bg-surface-3` | `white 14%` | Pressed / selected |
| `bg-scrim` | `black 85%` | Modal and confirm overlays |

### Lines

Hairlines carry all structure. Three weights, and they are not interchangeable.

| Token | Value | Use |
|---|---|---|
| `border-line` | `white 12%` | Dividers *inside* a panel — toolbar rules, list separators |
| `border-line-strong` | `white 50%` | The **panel frame**. This is the app's signature; it is what makes a region read as a distinct pane |
| `border-line-active` | `white 85%` | Focus ring, active tab, selected node |

### Text

Four tones. The previous code used eleven opacity steps between 30% and 90%, which is
noise, not hierarchy.

| Token | Value | Use |
|---|---|---|
| `text-ink` | `#ffffff` | Headings, primary content, active labels |
| `text-ink-muted` | `white 70%` | Body copy, descriptions, secondary labels |
| `text-ink-dim` | `white 45%` | Metadata, timestamps, counters, footnotes |
| `text-ink-faint` | `white 30%` | Placeholder, disabled, empty-state |

Never go below 30% — it fails contrast on black.

### Accent

| Token | Value | Use |
|---|---|---|
| `accent` | `#34d399` | Progress fill, "runs live" indicator, primary action, completed state |
| `accent-bright` | `#6ee7b7` | Hover on an accent element |
| `accent-wash` | `emerald 14%` | Selected chip background |
| `accent-line` | `emerald 35%` | Border of an accented card |

The accent is a **signal**, not decoration. If an element is not communicating progress,
liveness, or the primary action, it is not emerald.

### Status

| Token | Use |
|---|---|
| `danger` | Destructive actions, failed checks, runtime errors |
| `info` | Links, documentation cross-references |
| `warn` | Slow-path notices — model downloads, heavy runtimes |

### Module brand colours

Language and technology icons keep their official brand hex (`#3776AB` Python,
`#F7DF1E` JavaScript, …). These are **identity, not theme** — they appear only on the
icon glyph itself, never as a background, border, or text colour.

---

## 4. Typography

### Typefaces

**Space Grotesk** — the interface. Geometric, technical, distinctive at small sizes.

**JetBrains Mono** — machine surfaces only: the editor, console output, code spans,
inline `code` in chat, and tabular numbers. Ligatures are disabled so operators read
literally, which matters when teaching syntax.

> The distinction was previously theoretical: `--font-mono` pointed at Space Grotesk, so
> `font-mono` was a no-op and console output was not actually monospaced. It is real now.
> Reach for `font-mono` **only** on machine surfaces — running prose in monospace is
> harder to read and dilutes the signal.

### Scale

Seven steps. Sizes outside this list do not exist.

| Class | Size | Use |
|---|---|---|
| `text-micro` | 10px | Counters, corner badges, tiny numeric labels |
| `text-meta` | 11px | Timestamps, captions, chips, footnotes |
| `text-xs` | 12px | Secondary UI, toolbar labels, card descriptions |
| `text-sm` | 14px | **Default.** Body copy, chat, buttons, most labels |
| `text-base` | 16px | Lead paragraph, panel title |
| `text-xl` | 20px | Nav wordmark |
| `text-3xl` / `text-4xl` | 30 / 36px | Landing hero only |

Replace any `text-[10px]` with `text-micro` and any `text-[11px]` with `text-meta`.

### Weight

| Weight | Use |
|---|---|
| `font-normal` (400) | Body, the overwhelming default |
| `font-medium` (500) | Chips, subtle emphasis |
| `font-semibold` (600) | Section headings, button labels |
| `font-bold` (700) | Card titles, the wordmark |

`font-thin` and `font-extrabold` are retired: 100 is illegible at 11px on black, and 800
is indistinguishable from 700 in Space Grotesk.

### Section headings

The recurring pattern for a group label:

```
text-xs font-semibold uppercase tracking-wider text-ink-dim
```

### Line height

Body is `1.5`. Dense UI rows use `leading-snug` (1.375); the console uses
`leading-normal`. Set leading explicitly on multi-line text.

---

## 5. Spacing

A **4px grid**. Use Tailwind's numeric steps, which map directly:

`1`=4 · `2`=8 · `3`=12 · `4`=16 · `6`=24 · `8`=32 · `10`=40 · `12`=48

Half-steps (`0.5`=2px, `1.5`=6px, `2.5`=10px) are permitted **only** for padding around
icons and inside chips, where a full step is too coarse. Everything else rounds to a
whole step. Values like `py-4.5` are off-grid — remove them.

### Standard measurements

| Context | Value |
|---|---|
| Panel padding | `p-4` |
| Card padding | `p-4` |
| Card grid gap | `gap-3` |
| Section bottom margin | `mb-10` |
| Gap between heading and its content | `mb-3` |
| Toolbar row padding | `px-2 py-1` |
| Button padding (default) | `px-3 py-1.5` |
| Button padding (compact) | `px-2 py-1` |
| Inline icon-to-label gap | `gap-2` |
| Page max width | `max-w-5xl` |

---

## 6. Elevation

**Borders, not shadows.** A hairline is how a region announces itself. Shadow is
reserved for things that genuinely float and need separating from what they cover:

| Layer | Treatment |
|---|---|
| Panel, card, toolbar | `border border-line-strong` — no shadow |
| Divider inside a panel | `border-line` |
| Dropdown, popover | `border-line-strong` + `shadow-lg` + `bg-surface-0` |
| Modal, confirm overlay | `bg-scrim` + `backdrop-blur-sm` |

`backdrop-blur-md` on translucent panels is correct and should stay — it keeps text
legible over the animated background. Do not stack `shadow-lg shadow-black/40` on
static cards; that was the glassmorphism pattern this system replaces.

---

## 7. Motion

Two durations: `duration-fast` (120ms) for colour and opacity, `duration-base` (200ms)
for anything positional. Nothing is slower.

**Hover on a card** raises the border and the fill — it does **not** translate:

```
transition-colors duration-fast
hover:border-line-active hover:bg-surface-2
```

The `hover:-translate-y-1` lift is retired. It belongs to soft, rounded, shadowed cards;
against a square hairline frame, a moving panel reads as unstable.

**Focus** is always visible: `outline-2 outline-line-active` with `outline-offset-1`.
Never remove a focus ring without replacing it.

**Cursor** is handled globally — do not add `cursor-pointer` to anything. Tailwind's
preflight sets buttons to `cursor: default`, so `globals.css` restores the pointer for
every `button`, `[role="button"]`, `[role="tab"]`, `[role="menuitem"]`, `summary`,
`label[for]` and `a[href]`, and applies `not-allowed` to anything `:disabled` or
`aria-disabled`. A new control gets the right cursor for free; a stray
`cursor-pointer` class is redundant and will drift.

Animation respects `prefers-reduced-motion`, which is handled globally in
`globals.css` — you do not need to guard individual transitions.

---

## 8. Component patterns

### Panel

The core container. A framed region of the workspace.

```
border border-line-strong bg-surface-1 backdrop-blur-md
```

Panels are flush against each other and share edges. They do not have outer margins.

### Card

Clickable panel. Adds hover feedback and a focus ring.

```
group relative flex flex-col items-start gap-3 p-4 text-left
border border-line-strong bg-surface-1 backdrop-blur-md
transition-colors duration-fast
hover:border-line-active hover:bg-surface-2
focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-active
```

### Buttons

| Variant | Style |
|---|---|
| **Primary** | `bg-ink text-surface-0 px-3 py-1.5 text-xs font-semibold hover:bg-ink-muted` |
| **Secondary** | `border border-line-strong px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink` |
| **Destructive** | `bg-danger px-3 py-1.5 text-xs font-semibold text-ink hover:bg-danger/80` |
| **Ghost / icon** | `p-1 text-ink-dim hover:bg-surface-2 hover:text-ink` |

Disabled is always `disabled:opacity-40 disabled:cursor-not-allowed`.

Primary is white-on-black rather than emerald: the accent is reserved for state, and a
white button is the strongest possible contrast on this canvas.

### Chip

Small square token — a count, a tag, a sort filter.

```
border border-line px-1.5 py-0.5 text-micro font-medium text-ink-dim
```

Selected: `bg-accent-wash text-accent border-accent-line`.

### Progress bar

Square-ended, flush in its track.

```
<div class="h-1 w-full overflow-hidden bg-surface-2">
  <div class="h-full bg-accent transition-all duration-base" style="width: 62%" />
</div>
```

Track heights: `h-1` (4px) nested in a tree row, `h-1.5` (6px) on a card.

### Status dot

A 6px emerald square, not a circle. Reads as an LED or a live pixel.

```
<span class="h-1.5 w-1.5 bg-accent" />
```

### Toolbar

```
flex items-center gap-2 border-t border-line px-2 py-1 text-meta
```

### Code editor

Monaco runs the `codepath` theme from `src/lib/monacoTheme.ts`, not `vs-dark` —
stock vs-dark brings a `#1e1e1e` background, VS Code's blue/orange palette and its own
mono face, all of which read as a foreign object here.

The same rule as everywhere else applies: the canvas is monochrome and colour carries
meaning.

| Element | Tone |
|---|---|
| Background, gutter | `surface-0` (true black) |
| Identifiers, code body | `ink` |
| Keywords, tags | white **bold** — structure is weight, not hue |
| Strings, regex, attribute values | `accent` — literal values the learner types and sees echoed in the console |
| Numbers, types, constants | `info` |
| Comments | `ink-faint`, italic |
| Brackets, operators, delimiters | `ink-muted` |
| Cursor, bracket match, find match | `accent` |
| Unmatched bracket, invalid | `danger` |

Two defaults are deliberately suppressed: **bracket-pair rainbow colouring** (every
level pinned to `ink-muted` in the theme, since the editor option alone is not honoured)
and **ligatures** — learners must see `!=` and `=>` as the characters they typed.

Widgets (suggest, hover) take the panel treatment: black fill, `line-strong` hairline.

### Empty state

`text-ink-faint` at `text-sm`, one sentence, no illustration, no exclamation mark.

---

## 9. Tone of voice

The interface speaks like a competent colleague sitting next to the learner: direct,
concrete, unsentimental. It never congratulates excessively and never scolds.

**Rules**

- **Second person, active voice.** "Run your code" — not "The code can now be run".
- **Sentence case everywhere.** Not Title Case On Buttons.
- **No exclamation marks.** Ever. Not in success states, not in errors.
- **No emoji in interface chrome.** Icons carry meaning; emoji carry noise. (Content
  the tutor writes in chat is a different surface and may use them sparingly.)
- **State what happened, then what to do.** "Couldn't reach the model. Send any message
  to retry." — not "Something went wrong!"
- **Name the thing.** "Delete PostgreSQL course?" beats "Delete this item?"
- **Say what is real.** Never imply a check passed, a model loaded, or a lesson
  completed unless it did.
- **Be brief.** A label is one to three words. A helper line is one sentence.

**Vocabulary** — pick one word and keep it:

| Use | Not |
|---|---|
| course | class, track, program |
| module | technology, subject |
| lesson | exercise, task, unit |
| objective | goal, requirement, check (in UI) |
| Run | Execute, Play, Compile |
| console | output, terminal, log |
| roadmap | curriculum, syllabus, path |

**Errors** name the cause and the next step in one line, in `text-danger`, with no
apology and no stack trace in the UI.

---

## 10. Accessibility

- Focus is always visible. The global `:focus-visible` outline is the floor, not a
  suggestion.
- Text stays at or above `ink-faint` (30% white) — below that it fails contrast on
  black.
- Every icon-only control has an `aria-label`.
- Anything clickable is a `<button>`, or carries `role="button"`, `tabIndex={0}` and an
  Enter/Space handler.
- Colour is never the only signal: the accent always accompanies a number, a label, or
  a position change.
- `prefers-reduced-motion` is honoured globally.
- The animated background is decorative and sits behind a `-z-10` layer; when the GPU
  check fails, a static gradient stands in so contrast never depends on it.

---

## 11. Adding to the system

Before adding a token, check that an existing one does not already fit — the value of
this system is its smallness.

When you do add one:

1. Define it in the `@theme` block in `src/app/globals.css`.
2. Give it a semantic name (`--color-warn`), never a literal one (`--color-yellow`).
3. Document it in the relevant table here.
4. If it replaces an ad-hoc value, sweep the existing usages in the same commit.

### Checklist for new UI

- [ ] No `rounded-*` classes
- [ ] No hex, `rgba()`, or arbitrary `[…]` sizes
- [ ] Text uses one of the four ink tones
- [ ] Spacing lands on the 4px grid
- [ ] Border, not shadow, unless it floats
- [ ] Accent only for progress / live / primary action
- [ ] Mono only on machine output
- [ ] Focus ring present
- [ ] Icon-only controls have `aria-label`
- [ ] Copy is sentence case, second person, no exclamation mark
