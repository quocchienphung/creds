import type { ReactNode } from "react";
import "./artwork-notes.css";

const notes = {
  left: {
    before: "Vincent van Gogh painted The Starry Night in ",
    draft: "1888",
    revised: "June 1889",
    after: ", in Saint-Rémy, France. The view from his window became a world shaped by memory and imagination.",
    detail: "A cypress reaches toward the stars. Below, a quiet village sleeps beneath the moving sky.",
  },
  right: {
    before: "Above the village, ",
    draft: "a still blue sky",
    revised: "a sky alive with motion",
    after: ". Cobalt and ultramarine turn around small suns of yellow. Every brushstroke carries the night forward.",
    detail: "Oil on canvas. 73.7 × 92.1 cm. Now in the collection of the Museum of Modern Art, New York.",
  },
};

function type(text: string, time: number, start: number, end: number) {
  return text.slice(0, Math.floor(text.length * Math.max(0, Math.min(1, (time - start) / (end - start)))));
}

/** Key only changes when a rendered character, edit, caret or visibility changes. */
export function notesLayoutKey(side: "left" | "right", elapsed: number) {
  const t = elapsed / 1.55, copy = notes[side];
  const start = side === "left" ? 500 : 800, edit = side === "left" ? 3400 : 4400;
  const body = t < edit ? type(copy.before + copy.draft + copy.after, t, start, edit - 100).length : t > edit + 1700 ? "settled" : type(copy.revised, t, edit + 160, edit + 1100).length;
  return `${side}:${t >= start}:${t > start && t < 8200}:${body}:${t >= edit}:${t > edit + 1700}:${type(copy.detail, t, edit + 1280, 8200).length}`;
}

/** Real document text: the remote pointer is measured from this flowing caret. */
export function ArtworkNotes({ side, elapsed, complete }: {
  side: "left" | "right";
  elapsed: number;
  complete: boolean;
}) {
  const copy = notes[side];
  const t = complete ? 10000 : elapsed / 1.55;
  const start = side === "left" ? 500 : 800;
  const edit = side === "left" ? 3400 : 4400;
  const insertEnd = edit + 1100;
  const settled = t > edit + 1700;
  const anchor = <span className="artwork-note__caret" data-writing-anchor={side} data-active={t > start && t < 8200}>{"\u200b"}</span>;
  let content: ReactNode;

  if (t < edit) {
    content = <>{type(copy.before + copy.draft + copy.after, t, start, edit - 100)}{anchor}</>;
  } else if (!settled) {
    content = <>{copy.before}<del>{copy.draft}</del>{" "}<ins>{type(copy.revised, t, edit + 160, insertEnd)}</ins>{anchor}{copy.after}</>;
  } else {
    content = <>{copy.before}{copy.revised}{copy.after}</>;
  }

  return <section className={`artwork-note artwork-note--${side}`} data-visible={t >= start} aria-label={side === "left" ? "About the painting" : "About the brushwork"}>
    <div aria-hidden="true">
      <p className="artwork-note__body" data-comment-anchor={side === "left" ? "history" : "brushwork"}>{content}</p>
      <div className="artwork-note__comment-space" data-comment-space={side} />
      <p className="artwork-note__detail">{type(copy.detail, t, insertEnd + 180, 8200)}{settled && anchor}</p>
    </div>
    <p className="guide-intro__sr">{copy.before}{copy.revised}{copy.after} {copy.detail}</p>
  </section>;
}
