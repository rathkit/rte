# Languages and right-to-left

Every word the editor says has a stable id and an English default. A **message pack** gives the words for another language, with plural
forms where a word depends on a number, and says which way the language runs. A pack is plain data in a module of its own, so a page
loads only the language it uses, when it uses it. A word a pack lacks is said in English.

Rathkit ships the English words only. The two packs in the repository are test fixtures (see [The test packs](#the-test-packs)), not
translations.

## A pack

```js
// de.js
export default {
  locale: "de",          // a BCP 47 tag: picks the plural rules and the way numbers are written
  dir: "ltr",            // "rtl" mirrors the interface; leave it out to follow the page
  messages: {
    "item.bold": "Fett",
    "item.block=1": "Überschrift 1",
    "item.link.href": "Adresse",
    "field.required": "{label} ist erforderlich.",
    "status.words": { one: "{count} Wort", other: "{count} Wörter" },
    "content.footnote": "Fußnote {n}",
    // ...
  },
};
```

The type is `MessagePack` from `@rathkit/rte-ui`. `{name}` in a message is a value put in when it is said (`{label}`, `{count}`,
`{total}`). A plural message has one form for each plural category of the language, as `Intl.PluralRules` gives them (`zero`, `one`,
`two`, `few`, `many`, `other`): English and German use `one` and `other`, Arabic all six. The form is picked by the number given as
`count`, with the platform's own rules, so no rules ship with the editor. A missing form falls back to `other`.

## Putting a pack in place

A pack is part of a style ([UI.md](UI.md#the-style-provider)), so it is given with the rest of the look, at the start or later:

```js
import { createEditor } from "@rathkit/rte-core/standard";
import { createStandardUi } from "@rathkit/rte-ui/standard";

const { default: pack } = await import(`./packs/${language}.js`);   // only the language in use is loaded
const editor = createEditor({ element, html, messages: pack.messages });
const ui = createStandardUi(editor, { root, style: { theme: "light", ...pack } });

// Later, another language: nothing is rebuilt.
const { default: next } = await import("./packs/ar.js");
ui.setStyle({ theme: "light", ...next });
```

`setStyle` writes every word again: the toolbar, menus, tooltips, the find bar, the status line, the keyboard shortcuts list and dialogs,
an open one included. `locale` and `dir` go on the interface as `lang` and `dir`. They do not go on the writing area, whose language and
direction are the author's: a page in Arabic can hold an English document. Set `lang` and `dir` on the editor's element, or let the page
set them, for the document's own default.

The editor's `messages` option gives the three words the writing area says to assistive technology (`content.*`, below). It reads only
those keys, so a pack's `messages` can be given as they are. It is read when the editor is made.

## The keys

| Key | What it names |
| --- | --- |
| `toolbar.label`, `floating.label`, `context.label` | the main toolbar, the selection toolbar and the context menu |
| `dialog.ok`, `dialog.cancel`, `field.required`, `field.url` | dialog buttons, and a field's problem (`{label}` is the field's name) |
| `toggle.on`, `toggle.off` | what is announced when a toggle is pressed (`{label}`) |
| `status.words`, `status.characters`, `status.selection` | the status line (plural: `{count}`; the selection has `{selected}` and `{total}`) |
| `source.label`, `shortcuts.*`, `find.*` | the HTML source view, the keyboard shortcuts list and the find bar (`find.total` is plural) |
| `item.<id>` | an interface item: `item.bold`, `item.table-merge`, `item.text-color-red` |
| `item.<id>=<value>` | a choice in a select: `item.block=1` |
| `item.<id>.<field>` | a field of a dialog: `item.link.href` |
| `item.<id>.<field>=<value>` | a choice of a dialog's field: `item.image-properties.align=left` |
| `command.<name>` | a command, as the keyboard shortcuts list names it: `command.format.bold` |
| `content.notes`, `content.done`, `content.footnote` | the list of footnotes, a task's checkbox, a footnote reference (`{n}`); `CONTENT_MESSAGES` in `@rathkit/rte-core/dom` |

`messageCatalog(editor)` from `@rathkit/rte-ui` returns every key the interface can say for that editor, with its English words: a
starting point for a pack. It covers the items of every plugin the editor has when it is called, so call it on an editor with all the
plugins in use; your own plugins' items are in it too.

Key names on the keys themselves (`Ctrl+B`) come from the key map and are not translated yet.

## Right to left

With `dir: "rtl"`, or on a page whose direction is right to left, the interface is mirrored:

- the toolbar runs from the right, and ArrowLeft moves to the next control (the headless toolbar reads the direction it is drawn in);
- tooltips line up with their control's right edge, and menus open from their button's right edge;
- the context menu opens to the left of the pointer;
- a menu entry keeps the room for its check mark on the right;
- the undo, redo, indent and outdent icons are flipped.

The CSS uses logical properties (`inset-inline-start`, `padding-inline`), so a theme that does the same mirrors with it. The HTML source
view stays left to right, since HTML reads that way.

## Checking a pack

```sh
pnpm build
pnpm check:messages                                   # the test packs
node tools/check-messages.mjs path/to/de.js           # your own
node tools/check-messages.mjs --allow-missing de.js   # report missing keys without failing
```

It makes the English catalog from the built standard editor (all the standard plugins and Markdown) and reports, for each pack:

- **missing**: a key the pack lacks (it is said in English), or a plural form its language has and the pack does not (`status.words:few`);
- **unused**: a key nothing says (a typo, or a word that has gone), or a plural form its language does not have;
- **wrong**: plural forms where English has words, or words where English has plural forms; a `{name}` the English does not have (it
  would be said as nothing); a locale the platform does not know; a `dir` that is neither `ltr` nor `rtl`.

It fails on any of these. CI runs it on the test packs after the build, so a word added to the editor without an id the packs know, or
a key that is renamed, fails the build until the packs follow.

## The test packs

`packages/rte-ui/demo/test-packs/de.js` (German: left to right, two plural forms) and `ar.js` (Arabic: right to left, six plural forms)
are test fixtures. They exist so the completeness check and the browser checks have real languages to work on. Nobody has reviewed them
as translations, they are not in any published package, and they are not a promise of translations.

The browser checks (`tools/browser-checks/run.mjs`, "languages") load them on `packages/rte-ui/demo/languages.html` in Chromium, Firefox
and WebKit and check that a pack loaded after the interface was built renames everything, that each of Arabic's six plural forms is
picked for its count, with the number written as the language writes it, that German numbers are written the German way, that the writing area's own words follow the
editor's `messages`, that an Arabic interface and an English one on a right-to-left page are both mirrored (toolbar order, arrow keys,
tooltips, menus, the context menu), and that taking a pack away says English again.
