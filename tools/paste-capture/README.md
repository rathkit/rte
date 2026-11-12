# Paste capture

A small local tool that records what a copy from Word, Excel, Google Docs and similar apps actually puts on the clipboard, in a given browser. The captures become test fixtures for RTE's Office paste work.

Zero dependencies. Node 26, built-ins only. The server binds to 127.0.0.1 and refuses other host names. The page makes no network requests except to that server, and its Content-Security-Policy blocks everything else.

## Use

    node tools/paste-capture/serve.mjs
    open http://localhost:4455/

1. In the page, set the source app, sample name, browser and OS.
2. In the source app, copy a sample from `samples.md`.
3. Click the paste box and press Ctrl+V or Cmd+V.
4. Each paste is written to `tools/paste-capture/captures/` as one JSON file.
5. `node tools/paste-capture/summarize.mjs` lists everything captured.

If you run the browser on another machine (for example Safari on a Mac), start the server where the files are and use the Download button on the capture if the page cannot reach it. The server only accepts `localhost` and `127.0.0.1`, so use an SSH tunnel to reach it from another machine (`ssh -L 4455:127.0.0.1:4455 host`).

## What a capture holds

- `meta`: source app, sample, browser, OS, user agent, time, notes
- `types` and `payloads`: every clipboard format the browser exposed and its raw text (for example `text/html`, `text/plain`, `text/rtf`)
- `files`: pasted files such as images, as data URLs
- `browserInserted`: the HTML the browser itself produced in the paste box, for comparison

## From capture to fixture

Raw captures are never committed. The `captures/`, `mac-captures/` and `excluded/` folders here are ignored by git. Only scrubbed fixtures in `fixtures/paste/` are committed.

    node tools/paste-capture/scrub.mjs <captures-dir>... --out fixtures/paste

The scrubber keeps only `text/html` and `text/plain` (add `--keep text/rtf` where a test needs RTF) and writes one small file per capture with just the source, the list of formats and the payloads. It replaces account names in file paths, GUIDs, Office web app ids, email addresses and embedded image bytes with fixed stand-ins. It is deterministic, and running it twice changes nothing.

`pnpm check:fixtures` fails if a committed fixture still carries an account name in a path, an unscrubbed id, an email address, a user agent string, real image data or more than 400 KB. `pnpm test:tools` tests the scrubber and the check.

## Reconstructed fixtures

Some fixtures are not captures. They were written by hand to approximate what a class of source puts on the clipboard: a desktop
word processor (`desktop-writer`), a desktop mail client that uses the same markup (`desktop-mail`), online document editors
(`online-doc`, `online-doc-outline`), desktop and online spreadsheets (`desktop-sheet`, `online-sheet`), web mail (`webmail`) and
web pages (`web-page`), each in the wrapper the named browser adds. Such a fixture has `"provenance": { "kind": "reconstructed", "note": … }`.
Product names, fonts and ids in them are generic stand-ins, and all content is made up. They are useful for structure, not as proof
of what a particular product writes; a real capture is better whenever one can be made.

Pictures in them use addresses the paste must refuse (`file:`, `cid:`, relative paths), a stand-in for image bytes, or a remote
address on a reserved example domain, which the editor keeps but does not load. Nothing in a fixture may make the browser checks
reach outside the machine.

A fixture may carry `"expect": { "includes": [...], "excludes": [...] }`: pieces of HTML that free paste must produce and must not.
`packages/rte-core/src/paste-fixtures.test.ts` checks them without a browser, and the browser checks paste every fixture and check them
in Chromium, Firefox and WebKit. Both also fail on active content, local addresses or a source's own markup coming through for any
fixture. Write expectations from the source and `docs/PASTE.md`, not from what the editor does today, and expect nothing the paid tier
does (style-class fills and number formats, typed values, headings inferred from looks).

`pnpm check:fixtures` checks `provenance` and `expect` when a fixture has them.

## Making real captures

Real captures are what issue 24 asks for, and only someone with the applications can make them. The reconstructed fixtures stand in until then. A useful round, about an hour:

1. Start the capture server (`node tools/paste-capture/serve.mjs`) and open the page in the browser you copy in.
2. For each source in the list below, write the samples in `samples.md` (S1 to S5 for text sources, X1 to X3 for spreadsheets) once, with made-up content, then copy each one and paste it into the capture page. Fill in source app, sample, browser and OS before every paste.
3. Sources worth adding, by class: a desktop word processor, an online document editor, a desktop spreadsheet, an online spreadsheet, a desktop mail client (compose and a received message), web mail (compose and a received message), and two or three ordinary web pages.
4. Repeat in a second browser where you can (Chromium and Firefox on Windows, Safari on a Mac): each browser wraps the clipboard differently.
5. Scrub, check and look at the result before committing:

        node tools/paste-capture/scrub.mjs tools/paste-capture/captures --out fixtures/paste
        pnpm check:fixtures

   Read each scrubbed file once for anything real that slipped through. Raw captures stay out of git.
6. Run `pnpm check:fixtures` and the browser checks. A new real capture that fails a free-tier scenario is a finding: say so in the issue rather than adding an expectation to make it pass.

## Privacy

Captures contain whatever you copied. Use sample content you wrote, never real documents. Review the scrubbed fixtures before committing them.
