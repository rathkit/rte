// Find and replace as a plugin. The search lives in the editor's state (so an interface reads it from the snapshot): the command
// `find.set` reports it, with every match and which one is selected. It uses only what any plugin gets from the host.
import type { CommandDef } from "../commands.ts";
import type { EditorSnapshot } from "../engine.ts";
import type { Plugin } from "../plugin.ts";
import { currentMatch, findMatches, replaceMatches, replaceOne, selectMatch, stepMatch, type Match } from "./find.ts";

export const FIND_ID = "rathkit.find";

interface FindState {
  readonly query: string;
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
  readonly open: boolean;
  /** How many times it has been asked to open, so an interface can move the focus into it again when it is asked while already open. */
  readonly opens: number;
}
const initial: FindState = { query: "", matchCase: false, wholeWord: false, open: false, opens: 0 };

/** What `find.set` reports: the search, every match in order, and the index of the match that is selected (-1 for none). */
export interface FindInfo extends FindState {
  readonly matches: readonly Match[];
  readonly index: number;
}

const stateOf = (snap: EditorSnapshot): FindState => (snap.plugins[FIND_ID] as FindState | undefined) ?? initial;

export function find(): Plugin {
  return {
    id: FIND_ID,
    api: "1",
    setup(host) {
      // Matches are worked out once for a document and a search, however many times the state is read.
      let memo: { doc: unknown; query: string; matchCase: boolean; wholeWord: boolean; matches: readonly Match[] } | undefined;
      const matchesOf = (snap: EditorSnapshot): readonly Match[] => {
        const s = stateOf(snap);
        if (memo && memo.doc === snap.doc && memo.query === s.query && memo.matchCase === s.matchCase && memo.wholeWord === s.wholeWord) return memo.matches;
        memo = { doc: snap.doc, query: s.query, matchCase: s.matchCase, wholeWord: s.wholeWord, matches: findMatches(snap.doc, s) };
        return memo.matches;
      };
      let info: { snap: { doc: unknown; plugin: unknown; sel: unknown }; value: FindInfo } | undefined;
      const infoOf = (snap: EditorSnapshot): FindInfo => {
        const key = { doc: snap.doc, plugin: snap.plugins[FIND_ID], sel: snap.selection };
        if (info && info.snap.doc === key.doc && info.snap.plugin === key.plugin && info.snap.sel === key.sel) return info.value;
        const s = stateOf(snap);
        const matches = matchesOf(snap);
        info = { snap: key, value: { ...s, matches, index: currentMatch(matches, snap.selection) } };
        return info.value;
      };

      const def = <A, V>(d: CommandDef<A, V>): void => host.command(d);
      def<void, never>({
        name: "find.open", label: "Find and replace", mutates: false,
        run: (ctx) => { const now = stateOf(ctx.snapshot); ctx.setPluginState(FIND_ID, { ...now, open: true, opens: now.opens + 1 }); return true; },
        state: (snap) => ({ active: stateOf(snap).open }),
      });
      // The toolbar button: opens it, or closes it when it is open.
      def<void, never>({
        name: "find.toggle", label: "Find and replace", mutates: false,
        run: (ctx) => {
          const now = stateOf(ctx.snapshot);
          if (now.open) { ctx.setPluginState(FIND_ID, { ...now, open: false }); ctx.focus(); } else ctx.setPluginState(FIND_ID, { ...now, open: true, opens: now.opens + 1 });
          return true;
        },
        state: (snap) => ({ active: stateOf(snap).open }),
      });
      def<void, never>({
        name: "find.close", label: "Close find", mutates: false,
        run: (ctx) => {
          if (!stateOf(ctx.snapshot).open) return false;
          ctx.setPluginState(FIND_ID, { ...stateOf(ctx.snapshot), open: false });
          ctx.focus();
          return true;
        },
      });
      def<Partial<Pick<FindState, "query" | "matchCase" | "wholeWord">> | undefined, FindInfo>({
        name: "find.set", label: "Search", mutates: false,
        run: (ctx, arg) => {
          const now = stateOf(ctx.snapshot);
          const next: FindState = {
            ...now,
            ...(typeof arg?.query === "string" ? { query: arg.query } : {}),
            ...(typeof arg?.matchCase === "boolean" ? { matchCase: arg.matchCase } : {}),
            ...(typeof arg?.wholeWord === "boolean" ? { wholeWord: arg.wholeWord } : {}),
          };
          ctx.setPluginState(FIND_ID, next);
          return true;
        },
        state: (snap) => ({ value: infoOf(snap) }),
      });
      const step = (direction: "next" | "previous"): CommandDef<void, never> => ({
        name: direction === "next" ? "find.next" : "find.previous", label: direction === "next" ? "Find next" : "Find previous", mutates: false,
        run: (ctx) => {
          const matches = matchesOf(ctx.snapshot);
          if (matches.length === 0) return false;
          const index = stepMatch(ctx.snapshot.doc, matches, ctx.snapshot.selection, direction);
          return ctx.apply("find", (doc, sel) => selectMatch(doc, matches, index, sel)) || true;
        },
        state: (snap) => ({ enabled: matchesOf(snap).length > 0 }),
      });
      def(step("next"));
      def(step("previous"));
      def<{ readonly with?: string } | undefined, never>({
        name: "find.replace", label: "Replace",
        run: (ctx, arg) => {
          const text = typeof arg?.with === "string" ? arg.with : "";
          const matches = matchesOf(ctx.snapshot);
          const at = currentMatch(matches, ctx.snapshot.selection);
          if (at === -1) {
            // Nothing selected yet: the first press finds the next one, the second replaces it.
            if (matches.length === 0) return false;
            const index = stepMatch(ctx.snapshot.doc, matches, ctx.snapshot.selection, "next");
            return ctx.apply("find", (doc, sel) => selectMatch(doc, matches, index, sel)) || true;
          }
          return ctx.apply("replace", (doc) => replaceOne(doc, matches[at] as Match, text));
        },
        state: (snap) => ({ enabled: matchesOf(snap).length > 0 }),
      });
      def<{ readonly with?: string } | undefined, never>({
        name: "find.replaceAll", label: "Replace all",
        run: (ctx, arg) => {
          const matches = matchesOf(ctx.snapshot);
          if (matches.length === 0) return false;
          const text = typeof arg?.with === "string" ? arg.with : "";
          return ctx.apply("replace", (doc, sel) => ({ doc: replaceMatches(doc, matches, text), selection: sel }));
        },
        state: (snap) => ({ enabled: matchesOf(snap).length > 0 }),
      });
      host.keybinding({ key: "Mod-f", command: "find.open" });
      host.ui("toolbar.main", { kind: "toggle", id: "find", command: "find.toggle", icon: "search", group: "insert", order: 5 });
    },
  };
}
