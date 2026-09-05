import { useMemo } from 'react';

type Point = { x: number; y: number };

type Props = {
  uri: string | null | undefined;
  landmarks: Point[];
  imageSize?: { w: number; h: number };
  width: number;
  height: number;
};

/** Cap-compatible overlay: landmarks in imageSize space, img object-fit contain. */
export default function LandmarkImage({
  uri,
  landmarks,
  imageSize = { w: 200, h: 200 },
  width,
  height,
}: Props) {
  const mapped = useMemo(() => {
    if (!landmarks.length || imageSize.w <= 0 || imageSize.h <= 0) return [];
    const scale = Math.min(width / imageSize.w, height / imageSize.h);
    const dx = (width - imageSize.w * scale) / 2;
    const dy = (height - imageSize.h * scale) / 2;
    return landmarks.map((p) => ({
      x: p.x * scale + dx,
      y: p.y * scale + dy,
    }));
  }, [landmarks, imageSize, width, height]);

  return (
    <div className="landmark-image" style={{ width, height }}>
      {uri ? <img alt="" src={uri} /> : null}
      {mapped.map((pt, i) => (
        <div key={i} className="landmark-dot" style={{ left: pt.x - 4, top: pt.y - 4 }}>
          <span>{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
