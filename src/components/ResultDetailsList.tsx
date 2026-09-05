import type { DetailRow } from 'face-recognition-cordova';

type Props = {
  rows: DetailRow[];
};

/** Match React Native / Flutter result detail list (section + title + value). */
export default function ResultDetailsList({ rows }: Props) {
  if (!rows.length) {
    return (
      <p className="result-empty muted">
        No attribute details were returned for this face.
      </p>
    );
  }

  return (
    <div className="result-details">
      {rows.map((row, i) =>
        row.kind === 'section' ? (
          <div key={`s-${row.title}-${i}`} className="result-section">
            {row.title}
          </div>
        ) : (
          <div key={`f-${row.title}-${i}`} className="result-field">
            <div className="result-field-title">{row.title}</div>
            <div className="result-field-value">{row.value}</div>
          </div>
        )
      )}
    </div>
  );
}
