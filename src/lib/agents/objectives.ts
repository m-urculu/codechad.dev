// An objective graded on printed text must SAY that text.
//
// Grading is deterministic: a stdout check passes only when its exact text is in the
// output. That is fair when the objective states the text ("print `Total: 42`"), and
// a trap when it does not. A C++ lesson on the compiler and linker asked the learner
// to "print a message explaining that the compiler translates source code into
// object files", while its check wanted one exact sentence. A correct explanation in
// the learner's own words failed, and the tutor could not reveal the sentence,
// because it is the exercise's answer.
//
// Shared by lesson generation (which regenerates a lesson that breaks this) and the
// chat (which repairs lessons saved before the rule existed).

import type { Objective } from "./lesson";
import { isSkeletonTodo } from "@/lib/scaffold";

/** The exact text a stdout check needs, when the objective's wording does not state it. */
export function unstatedOutput(o: Objective): string | null {
  const c = o.check;
  if (!c || (c.type !== "stdout_equals" && c.type !== "stdout_includes")) return null;
  const want = c.value.trim();
  if (!want) return null;
  const desc = o.description.replace(/[`"“”'‘’]/g, "");
  // Every line the check needs must appear in the description as written.
  const lines = want.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.every((l) => desc.includes(l.replace(/[`"“”'‘’]/g, ""))) ? null : want;
}

/** Objectives whose printed text is unstated, with the text appended, so they can be met. */
export function stateRequiredOutput(objectives: Objective[]): Objective[] {
  return objectives.map((o) => {
    const want = unstatedOutput(o);
    if (!want) return o;
    const shown = want.includes("\n") ? want.split("\n").map((l) => `\`${l}\``).join(", then ") : `\`${want}\``;
    return { ...o, description: `${o.description.replace(/\.\s*$/, "")} — print exactly: ${shown}` };
  });
}

// The starter's TODO comments say what the objectives say.
//
// The objectives above the chat are the definition of done; the TODOs are what a
// learner reads while writing. They were the model's own wording, and drifted: a TODO
// said "print the value of total" while its objective wanted `50` followed by a
// newline, so a learner working from the code never saw what would be checked. When
// the starter has one TODO per objective, in order, each becomes that objective's
// description, word for word. Otherwise the starter is left as it is — a TODO cannot
// be matched to an objective by guessing.
const TODO_LINE = /^(\s*)(\/\/|#|--)\s*TODO\b:?\s*(.*)$/;
const COMMENT_LINE = /^\s*(\/\/|#|--)(?!\s*TODO\b)/;

export function syncTodos(starter: string, objectives: Objective[]): string {
  const exercise = objectives.filter((o) => !o.id.startsWith("skeleton-"));
  const lines = starter.split("\n");
  const todos: number[] = [];
  lines.forEach((l, i) => {
    const m = TODO_LINE.exec(l);
    if (m && !isSkeletonTodo(m[3])) todos.push(i);
  });
  if (!exercise.length || todos.length !== exercise.length) return starter;
  const out: string[] = [];
  let k = 0;
  for (let i = 0; i < lines.length; i++) {
    if (todos.includes(i)) {
      const m = TODO_LINE.exec(lines[i])!;
      out.push(`${m[1]}${m[2]} TODO: ${exercise[k++].description.replace(/\s+/g, " ").trim()}`);
      // The old TODO's continuation lines go with it.
      while (i + 1 < lines.length && COMMENT_LINE.test(lines[i + 1]) && !todos.includes(i + 1)) i++;
    } else out.push(lines[i]);
  }
  return out.join("\n");
}

// A structural rule that requires a NAME must say it, for the same reason.
//
// A generated chapter review checked `declares subtotal` for an objective that said
// "store it in a variable": a learner who called it `total` would fail a correct
// answer. Each name a rule requires that is neither in the description nor already
// in the starter is added to the description.
const word = (n: string) => new RegExp(`(^|[^\\w$])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w]|$)`);

export function stateRequiredNames(objectives: Objective[], starter: string): Objective[] {
  return objectives.map((o) => {
    const names = (o.check?.rules ?? []).flatMap((r) => (r.rule === "declares" || r.rule === "defines" ? [r.name] : []));
    const desc = o.description.replace(/[`"“”'‘’]/g, " ");
    const missing = [...new Set(names)].filter((n) => !word(n).test(desc) && !word(n).test(starter));
    if (!missing.length) return o;
    return { ...o, description: `${o.description.replace(/\.\s*$/, "")} — name it ${missing.map((n) => `\`${n}\``).join(" and ")}` };
  });
}
