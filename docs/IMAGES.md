# Images: what is allowed in, and how

The SVG cleaner is the `svg` entry point and the policy below is the `images` entry point; `createEditor()` from the `standard` entry has both. Without the svg plugin SVG images are refused.

Decided 2026-10-22.

## What gets in

- **Raster images** (PNG, JPEG, GIF, WebP, BMP) as `data:` addresses or as files. The first bytes must match the type the
  file claims. A declared type is never trusted.
- **SVG**, after the sanitizer in `svg.ts` has rewritten it. It is read with a case-preserving parser, reduced to an allow-list of
  elements, attributes and style properties, checked value by value, and written out again. No script, no event handlers, no
  links, no animation, no HTML, no `style` element, no `image`, no reference outside the picture. `use` may point only to
  something in the same picture, and not to anything that contains another `use` (copies of copies grow without limit); there
  can be at most 64. Input that cannot be read as well-formed XML, that declares entities, or that is over 256 KB, 4,000 elements
  or 32 levels deep is refused, not repaired.
- **Remote images** (`http`, `https`) are kept as addresses in the document. The editor never fetches them while pasting, and
  does not draw them unless the host passes `loadRemoteImages: true`. `Editor.remoteImages()` lists them.

Everything else is dropped: `file:` addresses (which would leak folder names), `data:` addresses of other types, and anything
with an address the URL policy refuses.

## How big a document can get

Embedding an image as base64 makes it a third larger and puts it in every save. So:

- With **no upload function**, a raster image is embedded only up to `maxInlineImageBytes` (512 KB by default). A larger one is
  left out, and `onImageRejected` is called with the reason (`too-large`), so the host can tell the person.
- With **`uploadImage`**, pasted and dropped raster images, and images that arrive as data addresses inside pasted HTML, are
  handed to the host's function, which stores them on the host's own server and returns an address. Only the address goes in
  the document. Uploads of one paste run side by side. If the function fails or returns an address the policy refuses, that
  image is left out and `onImageRejected` is called (`upload-failed` or `unsupported`).
- SVG is always embedded (it is small and capped), never uploaded.
- `maxImageFileBytes` (20 MB by default) is the largest file the editor will read at all.

The editor ships no upload service. The function is the host's.

## Inserting by address

`image.insert` (`{ src, alt }`, and an Image button with a dialog in the styled interface) puts an image at the caret, replacing any selection.
The address goes through the same check as a pasted image: scripts, malformed data addresses and anything else the paste check refuses
are refused, and nothing changes. It is off in a code block. An address on another site is kept but not loaded unless the host passes
`loadRemoteImages: true`; the styled interface draws a dashed box in its place.

## Selecting, resizing and describing

A click on an image selects it, as does Shift+Right or Shift+Left over it (covered by the browser checks), and the styled interface outlines it. With the `images` plugin
installed, a handle appears on its bottom right corner; dragging it sets the width, shows a dashed guide while you drag, and changes the
document once, on release (one undo step). The handle is not part of the document and is absent in a read-only editor.

`image.update` (`{ alt, width, height }`) is the same change by command, and the Image properties button opens a dialog for it, which is the way to
set a size without a pointer. Sizes are whole numbers from 1 to 10000, as `300` or `"300px"`; other units are refused and nothing changes. Setting
a width alone drops the old height, so the picture keeps its proportions; an empty or `null` value clears that property. The description
(`alt`) is trimmed, and cleared when empty. The command is off unless exactly one image is selected, or the arguments name one with
`{ path, offset }`. The size is written as `width` and `height` attributes in HTML.

## Position and captions

`image.update` also takes `align` and `caption`; the Image properties dialog has a Position list and a Caption field.

- **Position** (`align`): `left` or `right` floats the picture to that side with text wrapping round it, `center` puts it on a line of its own
  in the middle, empty (or `null`) leaves it in the line. It is written as `style` on the `<img>` (`float: left; margin: 0 1em 0.5em 0;`,
  `float: right; margin: 0 0 0.5em 1em;`, `display: block; margin: 0 auto;`) and read back from the same, from `margin: auto` on a block, and
  from the old `align` attribute. Any other style on an image is dropped.
- **Caption** (`caption`): text, no formatting. A picture alone in its paragraph with a caption is written as
  `<figure><img …><figcaption>…</figcaption></figure>`; a `<figure>` with one picture and one caption is read the same way, with the
  figure's `text-align` as the paragraph's alignment. A captioned picture is placed by its paragraph (the alignment buttons), not by `align`.
  The caption is drawn under the picture and is not text of the document: the caret passes it, and it is changed in the dialog.
  With text beside the picture there is no place for a caption in HTML, so it is kept in a `data-caption` attribute on the `<img>`, read
  back from there, and shows again when the picture is alone in its paragraph.

## Moving and touch

An image can be dragged to another place in the text (all three engines). On a touch screen, tapping an image selects it and its corner
handle follows a finger (checked with touch events in Chromium). Dragging an image by touch is left to the browser.
