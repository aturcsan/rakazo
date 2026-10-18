// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  download: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("../lib/artifact-open", () => ({
  fetchArtifactBytes: mocks.fetch,
  downloadArtifact: mocks.download,
  downloadArtifactBytes: vi.fn(),
}));
vi.mock("@lingui/react/macro", () => {
  const t = (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("./PdfViewer", () => ({ PdfViewer: () => null }));
vi.mock("@rakazo/chat-ui/web", () => ({ ChatMarkdown: () => null }));

import { ArtifactFileCard } from "./ArtifactFileCard";

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = mocks.create;
      static override revokeObjectURL = mocks.revoke;
    },
  );
  mocks.create.mockReset().mockReturnValue("blob:audio-preview");
  mocks.revoke.mockReset();
  mocks.fetch.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.download.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it.each(["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"])(
  "renders %s controls, keeps download, and revokes playback URL",
  async (mimeType) => {
    await act(async () =>
      root?.render(
        <ArtifactFileCard
          target={{ botId: "bot-1" }}
          artifactId="audio-1"
          name="clip"
          mimeType={mimeType}
          size={3}
        />,
      ),
    );
    const audio = container.querySelector("audio");
    expect(audio?.hasAttribute("controls")).toBe(true);
    expect(audio?.getAttribute("preload")).toBe("metadata");
    expect(audio?.getAttribute("aria-label")).toBe("clip");
    expect(audio?.getAttribute("src")).toBe("blob:audio-preview");
    expect(mocks.fetch).toHaveBeenCalledWith({ botId: "bot-1" }, "audio-1");
    const download = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Download clip"]',
    );
    expect(download).not.toBeNull();
    await act(async () => download?.click());
    expect(mocks.download).toHaveBeenCalledWith({ botId: "bot-1" }, "audio-1", "clip", mimeType);
    await act(async () => root?.unmount());
    root = undefined;
    expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith("blob:audio-preview");
  },
);
it("retains the download control when playback bytes fail to load", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("unavailable"));
  await act(async () =>
    root?.render(
      <ArtifactFileCard
        target={{ groupId: "group-1" }}
        artifactId="audio-1"
        name="clip"
        mimeType="audio/mpeg"
        size={3}
      />,
    ),
  );
  expect(container.querySelector("audio")).toBeNull();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Download clip"]')).not.toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});
