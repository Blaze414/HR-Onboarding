import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

/** Drawn locally — no remote image URLs anywhere in the app. */
export function SnoopyMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="31" fill="#16150f" />
      <Ellipse cx="32" cy="30" rx="17" ry="15" fill="#fffefb" />
      <Ellipse cx="32" cy="42" rx="10" ry="9" fill="#fffefb" />
      <Ellipse cx="16" cy="30" rx="7" ry="11" fill="#16150f" />
      <Circle cx="27" cy="28" r="2.4" fill="#16150f" />
      <Ellipse cx="32" cy="39" rx="4" ry="3.2" fill="#16150f" />
      <Path d="M32 42 v4" stroke="#16150f" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}
