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

## Privacy

Captures contain whatever you copied. Use sample content you wrote, never real documents. Review the scrubbed fixtures before committing them.
