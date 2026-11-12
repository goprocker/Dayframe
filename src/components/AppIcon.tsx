import { appColor } from "../lib/colors";

export function AppIcon({
  appId,
  name,
  icon,
  size = 20,
}: {
  appId: number;
  name: string;
  icon?: string;
  size?: number;
}) {
  if (icon) {
    return (
      <img
        src={`data:image/png;base64,${icon}`}
        width={size}
        height={size}
        alt=""
        className="shrink-0"
        draggable={false}
      />
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-md text-[10px] font-semibold text-white"
      style={{ width: size, height: size, background: appColor(appId) }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
