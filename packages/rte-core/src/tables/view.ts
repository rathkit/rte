// What the browser view adds for tables: the cells a selection runs across are marked, handles for rows and columns sit at the table's
// edges, and a column or row edge can be dragged to resize it. Comes with the tables plugin; the engine never calls it.
import type { ViewExtension } from "../plugin.ts";
import { CellMarks, installColumnResize } from "./cells.ts";
import { TableGrips } from "./grips.ts";

export const tablesView: ViewExtension = (host) => {
  const marks = new CellMarks(host);
  const grips = new TableGrips(host);
  installColumnResize(host);
  const stop = host.onChange((change) => {
    if (change.docChanged || change.selectionChanged) marks.update();
    // The handles belong to the editor having the focus, so they follow it as well as the caret.
    grips.update();
  });
  marks.update();
  grips.update();
  return () => { stop(); grips.destroy(); };
};
