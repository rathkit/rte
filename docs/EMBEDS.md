# Embeds: scope

Status: **scoped and decided, not started** (decisions of 2026-11-03 are at the end; work begins when the owner says). This is about putting a web page or a video inside a document: an `iframe` from an approved provider, and later a plain `video` or `audio` file.

## Where things stand

Checked in the code on 2026-11-03:

- Import drops `iframe`, `embed`, `object`, `video`, `audio` and `canvas` outright (`DROP` in `import.ts`). Pasted or loaded HTML that has them loses them silently. That is on purpose and stays the default.
- The document model has no embed or media block. `Block` is a closed union (paragraph, heading, list, definition list, table, quote, code, rule); inline content is text, line break, image and note.
- A plugin cannot add a block type. `HEADLESS.md` sketches `blockType(def)` for "tables, embeds", but `PluginHost` has no such method, and `ImportRecognizer` can only return list items. Tables and images are in the core model; their plugins own the editing.
- There is a link mark, a URL policy (`safeUrl`, `linkSchemes`) and an image policy (`loadRemoteImages`, an upload hook, SVG cleaning). An embed policy would sit beside them.

## What to build

### Phase 1: embedded pages and videos from approved providers

**Model.** One new block, in the core model like `Table` and `Image`, so that a document with embeds loads, shows and saves with no plugin, and a plugin owns the editing:

```ts
interface Embed {
  readonly type: "embed";
  readonly src: string;          // https only
  readonly title: string;        // required: the iframe's accessible name
  readonly ratio?: "16:9" | "4:3" | "1:1";   // default 16:9
  readonly caption?: string;
}
```

It is a block of its own, not an inline: like a figure, it sits between paragraphs and the caret can be placed before and after it.

**Plugin `@rathkit/rte-core/embeds`.**

- `embeds({ providers })`. A provider is `{ name, hosts, fromUrl(url) }`: it says which hosts it covers and turns a page address a person pastes (for example a watch link) into the address of the embeddable player. **The default list is empty, and an empty list means no embeds.** Presets for the two largest video hosts and a map host are exported by name (`embeds/providers`) for a host to import and pass in; none is on unless it is passed.
- Command `embed.insert` (`{ url, title }`): checks the address against the providers, refuses anything else, and inserts the block. A toolbar item opens a small dialog (address, title) using the existing dialog pattern in `rte-headless`/`rte-ui`.
- Paste: a pasted bare address that a provider recognizes becomes an embed, with one undo step back to a link. Everything else is pasted as before.
- Normalize hook (already exists): drops an embed whose address no longer passes the provider list, so a list changed later cannot leave an unapproved frame in a loaded document.
- Keyboard: the block is one focusable unit; Backspace and Delete next to it select it first, then remove it. Escape leaves a focused frame.

**Import and export.**

- Export writes `<figure class="rte-embed"><iframe src title loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="" allowfullscreen></iframe><figcaption>…</figcaption></figure>`, from the validated fields only. Never stored markup, never any other attribute.
- Import reads that exact shape back, and only when the plugin's provider list is passed in (`embedHosts` in `ImportOptions`). Without the list every `iframe` is dropped as today. A foreign `iframe` that matches a provider (the usual copy-the-embed-code case) is read into the same block; one that does not is dropped.
- Markdown (opt-in plugin): an embed writes as its address on a line of its own, and reads back through the same provider check.

**Editing view.**

- The editor shows a **placeholder card** (title, host name, a "Load" button), not the live frame, by default. No request goes to a third party until a person asks. A `live: true` option shows the frame while editing for hosts who want it. Read-only and exported output are the host page's business; the exported iframe uses `loading="lazy"`.
- The card is a real element with a name and role, so screen readers announce "Embedded content from <host>: <title>".

### Phase 2: your own video and audio files

A second block, `media` (`kind: "video" | "audio"`, `src`, `title`, optional `poster` and `captions`), written as `<video controls preload="none">` with no autoplay and no muting tricks. The address is `https` or a relative path (the host's own storage). Upload goes through a hook like images do, and nothing is stored in the document but the address. Captions (`<track>`) are part of the block from the start, because media without them is an accessibility failure. Separate from phase 1 because it has its own policy (file types and sizes, captions, an upload hook) and no third-party frame.

### Not in scope

Arbitrary `iframe` markup; scripts; social-post widgets that run their own script; oEmbed lookups (they need a network request from the editor or a server, and `rte-server` does not exist); resizing handles; embeds inside table cells, list items or quotes (blocks only at the top level at first, like a figure).

## Rules this must keep

1. **Closed by default.** No provider list, no embed, on every path (insert, paste, import, load).
2. **Stored data is a validated address, never markup.** The only attributes in the output are the fixed ones above.
3. **`sandbox` is always written.** The default tokens are the least a player needs; a provider can ask for fewer.
4. **No request without a person asking** in the editor (placeholder card), and `loading="lazy"` plus a strict referrer policy in output.
5. **CSP is the real guard, and the docs say so.** Hosts with a `frame-src` policy must list the providers; the docs give the line to add. A provider list in the editor does not replace it.
6. **Zero runtime dependencies**, American English, no comparison or speed claims, like the rest.

## Size and files

- Core: the `Embed` type, a render case, export and import of the one shape. Estimated at about 1 KB gzipped, unmeasured. Core plus view is at 54.1 of 60 KB, so this fits but uses most of what is left; render could move into a `view` extension if it does not.
- Plugin: `src/embeds/{index,plugin,providers,embeds.test}.ts`, budget 15 KB (expected well under 5 KB). Entry `./embeds`; added to the standard editor or kept opt-in (open question 2).
- Icons: an "embed" and a "video" icon in `rte-icons`.
- Docs: `docs/EMBEDS.md` becomes the reference; an entry in `PLUGINS.md`, `HAND-TESTING.md` (screen reader and keyboard steps) and the site features page.

## Tests

- Unit: provider matching (accepts the listed hosts, rejects lookalikes such as `youtube.com.evil.test`, userinfo tricks, `http`, `javascript:`, `data:`, ports, mixed case, trailing dots); export shape exactly; import of foreign embed code; round trips in HTML and Markdown; normalize drops an unapproved embed.
- Browser (3 engines): insert by command and by paste; Backspace/Delete selection behavior; placeholder card has no network request (checked by the harness, which already blocks everything outside loopback); `Load` swaps in the frame (a loopback test page stands in for a provider); undo and redo; copy and paste of an embed inside the editor.
- Security: a corpus of hostile `iframe` markup that must import as nothing, and a document with an unapproved embed that must load without it.
- Frameworks: unchanged wrappers; one check that the element exposes the option.

## Order of work

1. Decide the questions below.
2. Model + export/import + normalize + unit tests (no UI).
3. Plugin: command, provider list, paste, placeholder card, dialog.
4. Browser checks, keyboard and screen-reader steps, docs.
5. Phase 2 (`media`) as its own change.

## Decisions (owner, 2026-11-03)

1. **Providers:** none by default. The presets for the two largest video hosts and a map host are written and tested (address matching, lookalike hosts, rewriting a watch link to the player address; no network in unit tests, a loopback stand-in in the browser checks), but a host has to pass them in. The docs show the CSP `frame-src` line each one needs.
2. **Opt-in.** Not in `standard`. The docs show the one line that turns it on.
3. **Placeholder card while editing** by default; `live: true` shows the frame.
4. **Phase 2 (`media`, with upload) is a paid-tier offering.** Phase 1 stays free. The line follows the rule in `PASTE.md`: the free editor handles what the standard format can say; the paid tier adds what needs storage and more policy.
5. **Top level only** in the first version.
