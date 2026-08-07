// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../tests/test-setup";
import { App } from "./App";

describe("App manual briefing flow", () => {
  it("starts from the full Composer and keeps Opening until explicit navigation", async () => {
    render(<App />);
    const start = await screen.findByRole("button", { name: "Start demo briefing" });
    expect(screen.getByPlaceholderText(/Ask about/)).not.toBeNull();
    fireEvent.click(start);
    expect(await screen.findByRole("button", { name: "Ask a question" })).not.toBeNull();
    expect(screen.getByLabelText("Scene 1 of 7")).not.toBeNull();
    vi.useFakeTimers();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(screen.getByLabelText("Scene 1 of 7")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Scene 1 of 7")).not.toBeNull();
    vi.useRealTimers();
  });
});
