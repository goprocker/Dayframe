import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";

// One bundle, two windows: the label decides which root renders.
const isWidget = getCurrentWindow().label === "widget";
if (isWidget) document.documentElement.classList.add("widget");

const Root = lazy(() =>
  isWidget
    ? import("./components/Widget").then((m) => ({ default: m.Widget }))
    : import("./App"),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);
