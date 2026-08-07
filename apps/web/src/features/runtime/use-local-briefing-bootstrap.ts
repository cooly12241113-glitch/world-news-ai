import { useEffect, useMemo, useState } from "react";
import { BootstrapRunController, completedBootstrapState, type BootstrapState } from "./bootstrap-controller";
import { createLocalBriefingRuntime } from "./local-briefing-runtime";

export function useLocalBriefingBootstrap(resetKey: string): BootstrapState {
  const runtime = useMemo(() => createLocalBriefingRuntime(), []);
  const controller = useMemo(() => new BootstrapRunController(), []);
  const [state, setState] = useState<BootstrapState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    const mode = resetKey === "fact-check" ? "document-led"
      : resetKey === "static" ? "static"
        : resetKey === "reduced" ? "reduced-motion" : "auto";
    const handle = runtime.start(mode, resetKey === "personalized-impact");
    controller.replace(handle);
    void handle.result.then((result) => {
      if (controller.accepts(result)) setState(completedBootstrapState(result));
    });
    return () => controller.cancel();
  }, [controller, resetKey, runtime]);

  return state;
}
