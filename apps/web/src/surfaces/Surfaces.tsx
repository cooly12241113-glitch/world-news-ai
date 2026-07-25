import type { RenderableScene, RenderSurfaceKind } from "../renderer/presentation-adapter";
import { demoEvidence } from "../fixtures/build-demo-script";

export function ChartSurface({ scene }: { scene: RenderableScene }) {
  const data = demoEvidence.dataPoint;
  if (!scene.contentBindings.some(({ dataPointIds }) => dataPointIds.includes(data.id))) {
    return <TextSurface scene={scene} notice="Quantitative evidence is unavailable." />;
  }
  return (
    <section className="data-surface" aria-label="Evidence chart">
      <p className="eyebrow">Evidence-bound indicator</p>
      <h2>{data.label}</h2>
      <div className="bar-track" aria-hidden="true"><span style={{ width: `${data.value}%` }} /></div>
      <p className="metric">{data.value}<small>{data.unit}</small></p>
      <table><caption>Accessible chart data</caption><tbody>
        <tr><th scope="row">{data.label}</th><td>{data.value}{data.unit}</td></tr>
      </tbody></table>
    </section>
  );
}

export function DocumentSurface({ scene }: { scene: RenderableScene }) {
  const document = demoEvidence.document;
  return (
    <article className="data-surface document-surface">
      <p className="eyebrow">Primary source · revision {document.revision}</p>
      <h2>{document.title}</h2>
      <p>{document.publisher} · {document.type} · {document.publishedAt}</p>
      <blockquote>{document.excerpt}</blockquote>
      <small>Excerpt reference: {scene.contentBindings[0]?.excerptIds[0] ?? "unavailable"}</small>
    </article>
  );
}

export function EvidenceBoardSurface({ scene }: { scene: RenderableScene }) {
  return (
    <section className="data-surface evidence-board" aria-label="Evidence board">
      <EvidenceColumn title="Supporting evidence" roleLabel="Supports" items={demoEvidence.supporting} />
      <EvidenceColumn title="Contradicting and limiting evidence" roleLabel="Limits" items={demoEvidence.contradicting} />
      {scene.uncertainties.length > 0 && <EvidenceColumn title="Unknowns" roleLabel="Uncertain"
        items={["Implementation timing and adaptation remain uncertain."]} />}
    </section>
  );
}

function EvidenceColumn({ title, roleLabel, items }: { title: string; roleLabel: string; items: string[] }) {
  return <div><h2>{title}</h2>{items.map((item) =>
    <article className="evidence-card" key={item}><span>{roleLabel}</span><p>{item}</p></article>)}</div>;
}

export function TextSurface({ scene, notice }: { scene: RenderableScene; notice?: string }) {
  return (
    <section className="data-surface text-surface">
      <p className="eyebrow">{scene.kind.replaceAll("-", " ")}</p>
      <h2>{scene.objective}</h2>
      <p>{notice ?? "This scene uses the accessible static presentation surface."}</p>
    </section>
  );
}

export function UnsupportedSurface({ scene }: { scene: RenderableScene }) {
  return <TextSurface scene={scene} notice="This visual mode is not supported by the prototype." />;
}

export function surfaceFor(kind: RenderSurfaceKind, scene: RenderableScene) {
  if (kind === "chart") return <ChartSurface scene={scene} />;
  if (kind === "document") return <DocumentSurface scene={scene} />;
  if (kind === "evidence-board") return <EvidenceBoardSurface scene={scene} />;
  if (kind === "text" || kind === "timeline" || kind === "comparison") return <TextSurface scene={scene} />;
  return <UnsupportedSurface scene={scene} />;
}
