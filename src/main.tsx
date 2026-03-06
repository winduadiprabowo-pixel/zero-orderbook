import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Hide splash after first paint
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as Record<string, () => void>).__splashDone?.();
  });
});
