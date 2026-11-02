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
