import facePluginLogo from '../assets/ic_faceplugin.png';

type Props = {
  size?: number;
  className?: string;
};

/** Company mark — same asset as FaceRecognition Android / RN (`ic_faceplugin.png`). */
export default function FacePluginLogo({ size = 120, className }: Props) {
  return (
    <div className={`logo-wrap ${className ?? ''}`.trim()}>
      <a href="https://faceplugin.com" target="_blank" rel="noreferrer">
        <img
          alt="FacePlugin"
          src={facePluginLogo}
          style={{ width: size, height: size }}
        />
      </a>
    </div>
  );
}
