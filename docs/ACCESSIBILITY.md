# Keyboard, contrast, motion and zoom audit

The audit for roadmap item 5.5 ([#19](https://github.com/rathkit/rte/issues/19)): every interactive surface of the editor and its styled
interface, checked against WCAG 2.2 AA for the keyboard, focus, contrast, color, motion, zoom and target size. Each item has a result:

- **pass**: an automated check shows it holds;
- **fixed**: the audit found a fault, it is fixed, and a check fails without the fix and passes with it;
- **limit**: it does not fully hold, for the reason given;
- **not checked**: nothing in this audit can tell, for the reason given.

How it was checked: `tools/browser-checks/accessibility.mjs`, part of the browser checks (`tools/browser-checks/run.sh`), drives the styled
interface demo (`packages/rte-ui/demo`) and the custom element demo in Chromium, Firefox and WebKit, headless on Linux, with the keyboard
only. The emulations it uses (forced colors, reduced motion, a 320 by 256 window) are the engines' own; they are not Windows High Contrast,
an operating system setting or a real zoomed screen. Contrast is computed as WCAG 2.2 defines it from the colors the browser computes, with
the colors under an element mixed down to the first solid one. The theme tokens are also checked pair by pair in `rte-themes`
(`packages/rte-themes/src/themes.test.ts`). Screen readers are item 5.4 ([#18](https://github.com/rathkit/rte/issues/18)) and are not part
of this audit.

Run on 2026-11-12 with Playwright 1.64.1: the 203 audit checks, in a browser-check run of 2,266 checks that all passed. Totals: 22 pass, 7 fixed, 3 limit, 7 not checked.

## Keyboard: every function (2.1.1)

| # | Surface | Result | How |
| --- | --- | --- | --- |
| K1 | Toolbar | pass | Tab from the top of the page reaches it; one tab stop for the whole toolbar; the arrow keys reach all 41 controls; Home and End; Enter and Space press a button; Shift+Tab from the writing area comes back. |
| K2 | Block-type list | pass | A native `<select>` in the roving order. Its open list is the browser's own. |
| K3 | Menus (text color, highlight, table, cell style, table style, special characters, list style) | pass | Each opens with Enter with the focus on its first entry, every entry is reached with the arrow keys, Escape returns to the button. |
| K4 | Dialogs and their fields | pass | The link, image and keyboard shortcuts dialogs: opened with Enter; every field, checkbox and button reached with Tab; the focus stays inside; Escape closes and returns to the opener. The column width and image properties dialogs are opened and filled in by keyboard in K13 and K14. |
| K5 | Find bar | pass | Mod-F opens it with the focus in the search box; Tab goes through every control in reading order and then to the writing area; Escape closes it and returns to the text. |
| K6 | Selection toolbar | fixed | Alt+F10 moves into it, the arrow keys move, Escape returns to the text. **Found**: in WebKit the page's selection is dropped when the focus enters the bar, the bar hid itself, and the focus fell to the page. The bar now stays while it has the focus. |
| K7 | Context menu | pass in Chromium; not checked in Firefox and WebKit | Shift+F10 opens it with the focus on its first entry; Escape returns to the text. The check runs where the browser sends a context menu event for the key, which only Chromium does in this setup; the other two are in the hand-testing script. |
| K8 | Tooltips | pass | Shown at once on keyboard focus; Escape hides one and leaves the focus where it was (1.4.13). |
| K9 | HTML source view | pass | Opened from its button; the focus goes into the text box; Tab leaves it (Tab is not taken for indenting); Escape closes it. |
| K10 | Footnotes | pass | Mod-Alt-F puts one in and Mod-Alt-Shift-F jumps between a reference and its note. |
| K11 | Task checkboxes | pass | Mod-Enter ticks the task the caret is in. The checkbox is not a tab stop of its own, by design ([LISTS.md](LISTS.md#tasks)). |
| K12 | Links in the text | pass | Made, changed and removed from the keyboard with the Link and Remove link controls. Inside the editor a link is text to edit; following it is the page's business, not the editor's. |
| K13 | Table grips (move a row or column; on a touch screen, set a width or height) | pass | The pointer-only grips have keyboard equivalents: Move row up and down and Move column left and right in the Table menu, Column width in the Table menu and Row height in the Cell style menu. The check moves a row and sets a width by keyboard. |
| K14 | Image resize handle | pass | An image is picked with Shift+Arrow and sized in the Image properties dialog, all by keyboard. |
| K15 | `<rte-editor>` in a form | pass | Tab goes from the field before it through its toolbar and each editor to the reset button. |

## Focus

| # | Item | Result | How |
| --- | --- | --- | --- |
| F1 | No keyboard trap (2.1.2) | fixed | **Found**: in a list Tab indents and in a table Tab moves to the next cell or adds a row, so when a document ended in a list or a table the only way out was Shift+Tab, which outdents the list item. Now Escape, then Tab (or Shift+Tab) leaves the writing area and changes nothing; any other key in between gives Tab back to the list or table. The keyboard shortcuts dialog says so ("Leave the writing area: Escape, then Tab"). Checked at the end of a paragraph, a nested list, a table and a code block; `engine.test.ts` checks the key handling. A host that wants Tab always to move the focus can turn off `indentOnTab` in the lists plugin. Dialogs keep the focus inside on purpose (they are modal) and Escape leaves them. |
| F2 | Focus order (2.4.3) | pass | Tab goes down the page: toolbar, find bar (when open), writing area, then the next editor; the find bar's controls go in reading order. |
| F3 | Focus visible (2.4.7) and the ring's contrast (1.4.11) | fixed | Every keyboard stop of K1 to K14 (toolbar controls, menu entries, dialog fields and buttons, find bar controls, the selection toolbar, the context menu, the source view and the writing area) shows a ring at least 2px wide with 3:1 against what it is drawn on. That walk runs in the light theme; in each of the other themes the check measures the ring of a toolbar control, the writing area, a find field and a menu entry, and `rte-themes` checks the focus color against every surface it can be drawn on. **Found**: the ring for the writing area and the source view was drawn outside the editor, on the page's own background, which the editor does not control: on the demo page the dark theme's ring was 1.6:1 and the high-contrast theme's 1.2:1. It is now drawn just inside the editor's border, on the editor's own colors, which every theme keeps at 3:1 against the ring. |
| F4 | Focus not obscured (2.4.11) | pass | At every keyboard stop, and at 320 by 256 for every toolbar control and the selection toolbar, some of the focused element is not under anything else (a tooltip, a menu, the selection toolbar). |

## Contrast and color

| # | Item | Result | How |
| --- | --- | --- | --- |
| C1 | Text (1.4.3) | fixed | Every piece of text on every surface (toolbar, writing area with headings, links, code, quotes, tasks, tables and selected cells, the status line, the placeholder, the find bar with its count, a menu with key hints, a tooltip, a dialog with an error, the selection toolbar, the context menu) keeps 4.5:1, or 3:1 for large text, in light, dark, auto (system light, system dark, dark chosen) and high-contrast. Disabled controls are exempt and skipped. **Found**: a link in a selected table cell kept the accent color on the selection tint, 3.3:1 in the dark theme; it now takes the text color, like selected text, and keeps its underline. |
| C2 | Controls and states (1.4.11) | pass | Toolbar icons, the edges of the block-type list, the find fields and dialog fields, the pressed button's edge, the task checkbox, the table grips and the image handle keep 3:1 against what is next to them in every theme. `rte-themes` checks the token pairs too, now including the muted text on raised surfaces and borders on raised surfaces. |
| C3 | Native controls | limit | The checkbox in the link dialog and the arrow of the block-type list are drawn by the browser (the checkbox in the accent color). Their contrast is the browser's and is not measured. |
| C4 | Drag guides | fixed | The guides shown while the image handle, a table grip or a column's edge is dragged stand out 3:1 from the writing area in every theme. **Found**: they were one fixed blue, 1.9:1 on the dark theme and 2.1:1 on the high-contrast theme; they now have a white edge, as the grips and the handle do. |
| C5 | Use of color (1.4.1): pressed buttons, checked menu entries, links, invalid fields, selected cells | pass | A pressed button has a thicker bottom edge; a checked entry a check mark; links an underline; an invalid field a message and a thicker edge; selected cells an outline. |
| C6 | Use of color (1.4.1): the current find match | fixed | **Found**: the match being looked at differed from the others only by hue (orange and yellow, 1.7:1 apart), and with the focus in the find bar it is not drawn as a selection. It is now 3:1 darker than the other matches, with the text at 4.5:1 or more on both; the count also says which match it is ("2 of 5"). |
| C7 | Find matches against plain text | limit | The other matches are a light tint behind dark text, as a browser's own find draws them, so on a light theme they stand out from plain text by hue more than by lightness. One pair of colors serves every theme, light and dark, and the text on it must stay dark to keep 4.5:1 on both tints; a tint 3:1 darker than a white page would need light text. Each match can be visited with Enter in the find bar, and the one visited is marked by lightness as well as hue (C6), with its number in the count. |

## Themes, forced colors, motion

| # | Item | Result | How |
| --- | --- | --- | --- |
| T1 | High-contrast theme | pass | All of C1, C2 and F3 hold in it (black and white with a yellow accent and focus ring, 2px borders, a 3px ring, no shadows, no motion). |
| T2 | Forced colors | pass | Under the engines' forced-colors emulation a toolbar button, the writing area, a menu entry and a dialog field show a ring, a pressed button keeps a real 4px edge (checked with the other styled-interface checks), and a table grip keeps an edge of another color than its fill. |
| T3 | `prefers-contrast: more` | limit | Nothing changes on its own: the high-contrast theme is chosen by the host (`theme: "high-contrast"`), not switched on by the setting. No AA criterion asks for it; forced colors (T2) is followed. |
| T4 | Reduced motion (2.3.3) | pass | With reduced motion, no element of the interface has a transition, an animation or smooth scrolling, with the tooltip, a menu, the selection toolbar, a dialog, the table grips and the image handle showing in turn. Otherwise the only motion is the 120 ms color change on buttons, which reduced motion turns off. |

## Zoom, reflow and target size

| # | Item | Result | How |
| --- | --- | --- | --- |
| Z1 | 400% zoom and reflow at 320 CSS px (1.4.10) | fixed | In a 320 by 256 window (a 1280 by 1024 screen at 400%) the page does not scroll sideways and nothing is cut off, with each surface open in turn: the toolbar, four menus, the find bar, the tooltip with the longest words, the link, image and shortcuts dialogs (taller than the window, they scroll), the source view, the selection toolbar, the context menu and a paragraph with a long address. **Found**: the find bar's search and replace boxes would not shrink and pushed the page 40 to 60 px sideways in all three engines; they now shrink to fit. |
| Z2 | Target size (2.5.8) | pass | With the toolbar, the find bar, three menus, the link dialog, the selection toolbar, the context menu, the table grips and the image handle showing in turn, no control is under 24 by 24 px without room round it: a 24 px circle round each smaller one touches no other control. The smaller ones are the table grips (22 px with a mouse, 30 px on a touch screen; they also have the Table menu, K13) and the link dialog's checkbox; toolbar controls are 32 px by default and at least 28 px in the compact density, and the image handle is 28 px. Task checkboxes, footnote numbers and links sit in a line of text (the inline exception). |

## Not checked by this audit

| # | Item | Why |
| --- | --- | --- |
| N1 | Screen readers | Item 5.4 ([#18](https://github.com/rathkit/rte/issues/18)), by hand. |
| N2 | Real browser zoom, minimum font size and text-only zoom | A 320 px window is the same layout as 400% zoom in CSS pixels, but the browsers' own zoom and font settings are not driven; the steps are in [HAND-TESTING.md](HAND-TESTING.md#zoom-and-text-size). |
| N3 | Windows High Contrast and other real system color settings | Only the engines' forced-colors emulation is run. |
| N4 | Text spacing (1.4.12) | Not part of this item. |
| N5 | Shift+F10 in Firefox and WebKit | The automated browsers send no context menu event for the key (K7). |
| N6 | macOS, Windows, and Safari, Chrome and Edge themselves | The checks run the three engines on Linux ([SUPPORT.md](SUPPORT.md#browsers)). |
| N7 | Hosts' own styles | A host that sets its own tokens or CSS can lower any of the contrasts above; the checks cover the shipped themes. |
