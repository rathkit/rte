# Hand testing

The automated checks cover three browser engines, but they cannot judge what a
screen reader says, how an input method composes text, or how a real finger
behaves. This is the script for those checks. Run it before a release that
changes editing behavior, and record the result at the bottom.

Open the editor demo (any page that mounts `<rte-editor>` with the standard
plugins, including tables, lists and images) and work through each section.
Mark a step as failed only if the behavior differs from the "Expect" line.

## Screen readers

Pairings to cover: VoiceOver with Safari (macOS and iOS), NVDA with Firefox and
Chrome (Windows), TalkBack with Chrome (Android). JAWS if available.

1. Tab to the editor. Expect: it is announced as a multi-line text box with an
   accessible name.
2. Type a sentence. Expect: characters are echoed; no duplicate speech.
3. Press Mod-B, type, press Mod-B. Expect: bold on and off are announced or
   the state is available on the toolbar button (pressed state).
4. Move into a heading, a list item and a quote. Expect: the role and level are
   announced (heading level 2, list item, quote).
5. Move through a table with Tab. Expect: row and column are announced; header
   cells are identified as headers.
6. Select an image and read its alt text. Expect: alt text is read; the
   caption is read once, not twice.
7. Open the Link dialog from the toolbar. Expect: focus moves into the dialog,
   fields have labels, Escape closes it and focus returns to the editor.
8. Open a menu button with the keyboard (Enter or Space, arrows, Escape).
   Expect: items are announced with their shortcut; focus returns on close.
9. Trigger Find (Mod-F). Expect: the match count is announced when it changes.
10. With the selection toolbar on, select a word and press Alt+F10. Expect: the
    toolbar is announced by name, the arrow keys move between controls and each
    is announced with its pressed state; Escape returns to the text.
11. With the context menu on, open it with the right button and with the menu
    key. Expect: it is announced as a menu, entries are read with their keys,
    and Escape returns to the text.

## Input methods

Use a Japanese or Chinese pinyin input method on macOS and Windows, and a
Korean one if available.

1. Compose text mid-paragraph. Expect: the composition underline shows, the
   document does not change until commit, and the commit lands at the caret.
2. Compose inside a table cell, a list item and a quote. Expect: same.
3. Start a composition, then press Escape. Expect: composition is cancelled and
   nothing is left behind.
4. Compose while a remote or programmatic change happens (use the demo's
   "insert text" command from the console). Expect: no lost or doubled text.
5. Type `**word**` and `# ` with an input method active. Expect: shortcuts do
   not fire while composing; they fire after commit only if a plain character
   triggers them.

## Phone and tablet

iOS Safari, Android Chrome; one tablet with a keyboard attached.

0. Select text by long-press. Expect: the browser's own handles and menu show,
   with no extra toolbar or menu on top of them, even with both turned on.
1. Tap into the editor. Expect: the keyboard opens and the caret is visible
   above it (the page scrolls if needed).
2. Long-press a word to select it. Expect: native selection handles work and
   the toolbar reflects the selection.
3. Use the autocorrect suggestion bar to replace a word. Expect: one undo step
   restores the original.
4. Tap a table cell, then a width grip, and drag. Expect: the column resizes
   and the page does not scroll while dragging.
5. Tap an image, drag its resize handle. Expect: it resizes.
6. Rotate the device. Expect: layout reflows; the selection is kept.
7. Paste from another app. Expect: formatting is kept as documented in
   `PASTE.md`; no raw markup shows.

## Pasting from other tools

With the Markdown plugin on (`markdown()` from `@rathkit/rte-core/markdown`):

1. Copy a few lines of Markdown from a plain-text editor and paste. Expect: headings, lists and links are made.
2. Copy the same text from a code editor with syntax coloring and paste. Expect: it pastes as colored HTML, not read as Markdown (code editors put HTML on the clipboard, and HTML always wins; see `MARKDOWN.md`).
3. Copy a shell command with a `#` comment line from a terminal and paste. Expect: it stays as typed.
4. Copy a page section that has footnotes (a GitHub README, say) and paste. Expect: numbered references and a notes list at the end, with the arrow links back removed.

## Footnotes

With the footnotes plugin on (`footnotes()` from `@rathkit/rte-core/footnotes`):

1. Put the caret in a sentence and press Ctrl+Alt+F (Cmd+Option+F on a Mac; some keyboard layouts type a symbol with Option and the key will not reach the editor, so also try the toolbar button). Expect: a small number appears in the text, and the caret is in a new note at the end.
2. Press Ctrl+Alt+Shift+F. Expect: the caret goes back beside the number; press it again and it returns to the note.
3. Tap the number on a phone and move the caret with the arrow keys over it. Expect: it counts as one character; Backspace removes it and its note, and undo brings both back.
4. With a screen reader on, move onto a reference and into the list. Expect: the reference is read as a footnote reference ("Footnote 1") and the list as notes. This has not been tried on a real screen reader.
5. Copy a paragraph that has a reference and paste it somewhere else in the document. Expect: a second reference with its own copy of the note.

## Spell checking and speech

1. Misspell a word. Expect: the browser underlines it; the context menu offers
   suggestions; choosing one replaces the word as a single undo step.
2. Dictate a sentence (macOS dictation, Windows voice typing, Android voice
   input). Expect: text appears at the caret and is undoable.

## Zoom and text size

1. Set browser zoom to 200% and 400%. Expect: no horizontal page scroll in the
   toolbar; the toolbar wraps or scrolls and every button stays reachable.
2. Set the browser's minimum font size to large. Expect: the editor text
   follows; handles still line up with their cells.
3. Enable Windows high contrast or forced colors. Expect: the caret,
   selection, toolbar focus ring and table borders are all visible.

## Recording a run

Copy this block to the release notes or the pull request.

```
Date:
Build (version or commit):
Platform / browser / assistive technology:
Sections run:
Steps failed (section.step, what happened):
```
