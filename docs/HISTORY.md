# Undo and redo

The rules, in the order the tests check them. `packages/rte-core/src/history.test.ts` has one test per rule (`rule N`), and
`tools/browser-checks` repeats the ones that depend on a real browser (the checks starting "history:").

How it works: every step keeps the whole document and the selection from before it. The document is immutable and shared between
steps, so a step costs little and undo puts back a document that existed, never one pieced together. That is rule 8, and it holds by
construction.

1. **Typing in a row is one step; so is deleting in a row.** Typing and then deleting are two steps.
2. **Moving the caret ends the step.** Clicking or arrowing elsewhere and typing again starts a new step. So does choosing a mark
   (bold, italic) for the next letter.
3. **A command is a step of its own**, and the typing after it is another. A paste, a Markdown paste, a shortcut converted by typing
   (`- ` becoming a list), find and replace, and "replace all" are each one step.
4. **Undo puts the caret back where it was before the step** (a selected range is selected again). **Redo puts it where the step left
   it**, whatever was clicked in between.
5. **A new edit empties redo.** Moving the caret, or an edit that changes nothing, does not.
6. **The last 200 steps are kept.** Older ones are dropped, and undo stops at the oldest without error. Typing in a row counts as one.
7. **A repair a plugin makes belongs to the step that needed it.** Deleting a footnote reference takes its note with it, in one step,
   and one undo brings both back; so does redo.
8. **Undo never leaves a state that no edit produced.**
9. **An edit that is refused makes no step**: past `maxLength`, or while read-only. While read-only, undo and redo do nothing and the
   history waits.
10. **Replacing the whole document** (`setHtml`, `value`, a form reset) **empties the history**, as loading a new file does. It is not an
    undo step.
11. **A finished input-method composition is a step of its own.** The text being composed is not touched while the composition runs
    (the browser owns it); when it ends the whole result is one step, separate from the typing before and after it.

Not rules, and so free to change: how long a pause ends a step (there is no timing: only the events above end one), and the number 200.
