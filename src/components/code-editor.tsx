import { useEffect, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  foldGutter,
  indentOnInput,
  bracketMatching,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";
import type { ResolvedTheme } from "@/lib/theme";

export type EditorMode = "normal" | "vim";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  appearance?: ResolvedTheme;
  className?: string;
  placeholder?: string;
};

function shellTheme(): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "var(--color-bg)",
      color: "var(--color-fg)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.55",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--color-primary)",
      padding: "12px 0",
      minHeight: "100%",
      color: "var(--color-fg)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-surface)",
      color: "var(--color-fg-subtle)",
      borderRight: "1px solid var(--color-border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--color-surface-2)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklab, var(--color-primary) 6%, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in oklab, var(--color-primary) 22%, transparent) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-primary)",
    },
    ".cm-placeholder": {
      color: "var(--color-fg-subtle)",
      fontStyle: "italic",
    },
  });
}

function appearanceExtensions(appearance: ResolvedTheme): Extension[] {
  if (appearance === "dark") {
    return [oneDark, shellTheme()];
  }
  // Light: token-driven shell + default highlight style (already in base)
  return [shellTheme()];
}

export function CodeEditor({
  value,
  onChange,
  mode,
  appearance = "dark",
  className,
  placeholder,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const modeComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const externalValue = useRef(value);

  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = update.state.doc.toString();
        externalValue.current = next;
        onChangeRef.current(next);
      }
    });

    const placeholderExt = placeholder
      ? EditorView.contentAttributes.of({ "aria-label": placeholder })
      : [];

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown(),
        themeComp.current.of(appearanceExtensions(appearance)),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        modeComp.current.of(mode === "vim" ? vim() : []),
        updateListener,
        EditorView.lineWrapping,
        placeholderExt,
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; mode/theme/value synced below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: modeComp.current.reconfigure(mode === "vim" ? vim() : []),
    });
  }, [mode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeComp.current.reconfigure(appearanceExtensions(appearance)),
    });
  }, [appearance]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value !== externalValue.current) {
      externalValue.current = value;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-editor-mode={mode}
      data-appearance={appearance}
      style={{ minHeight: 0, height: "100%" }}
    />
  );
}
