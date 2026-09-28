import facePluginLogo from '../assets/fp_logo.png';

type Props = {
  size?: number;
  className?: string;
};

/** Company wordmark. The favicon mark is only the app icon. */
export default function FacePluginLogo({ size = 120, className }: Props) {
  return (
    <div className={`logo-wrap ${className ?? ''}`.trim()}>
      <a href="https://faceplugin.com" target="_blank" rel="noreferrer">
        <img
          alt="FacePlugin"
          src={facePluginLogo}
          style={{ width: size * 2.2, height: size * 0.44 }}
        />
      </a>
    </div>
  );
}
