import ReactDOM from "react-dom/client";
import "./api/poshatAPI";
import "./app/global.css";
import PoshatLauncherPage from "./app/page.jsx";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { UIProvider } from "./components/ui/UIProvider.jsx";

window.addEventListener("error", (e) => {
  console.error("[poshat] window.error:", e.message, e.filename, e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[poshat] unhandled rejection:", e.reason);
});

try {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <AppErrorBoundary>
      <UIProvider>
        <PoshatLauncherPage />
      </UIProvider>
    </AppErrorBoundary>,
  );
} catch (err) {
  console.error("[poshat] FATAL:", err);
  document.getElementById("root")!.innerHTML =
    `<pre style="color:red;padding:20px;white-space:pre-wrap">${String(err)}</pre>`;
}
