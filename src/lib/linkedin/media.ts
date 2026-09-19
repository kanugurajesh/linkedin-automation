import { readFile } from "node:fs/promises";
import { api, getAuth } from "./client";
import type { MediaRef } from "./posts";

async function putBinary(url: string, data: Uint8Array | Buffer, contentType = "application/octet-stream"): Promise<Response> {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(data) });
  if (!res.ok) throw new Error(`Media upload failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function uploadImage(path: string): Promise<MediaRef> {
  const { personUrn } = await getAuth();
  const init = await api("/rest/images?action=initializeUpload", {
    method: "POST",
    json: { initializeUploadRequest: { owner: personUrn } },
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  await putBinary(value.uploadUrl, await readFile(path));
  return { kind: "image", urn: value.image };
}

/** PDFs become swipeable carousels. */
export async function uploadDocument(path: string, title: string): Promise<MediaRef> {
  const { personUrn } = await getAuth();
  const init = await api("/rest/documents?action=initializeUpload", {
    method: "POST",
    json: { initializeUploadRequest: { owner: personUrn } },
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; document: string } };
  await putBinary(value.uploadUrl, await readFile(path));
  return { kind: "document", urn: value.document, title };
}

export async function uploadVideo(path: string): Promise<MediaRef> {
  const { personUrn } = await getAuth();
  const file = await readFile(path);
  const init = await api("/rest/videos?action=initializeUpload", {
    method: "POST",
    json: { initializeUploadRequest: { owner: personUrn, fileSizeBytes: file.length, uploadCaptions: false, uploadThumbnail: false } },
  });
  const { value } = (await init.json()) as {
    value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] };
  };

  const etags: string[] = [];
  for (const part of value.uploadInstructions) {
    const res = await putBinary(part.uploadUrl, file.subarray(part.firstByte, part.lastByte + 1));
    const etag = res.headers.get("etag");
    if (!etag) throw new Error("Video part upload returned no ETag");
    etags.push(etag.replaceAll('"', ""));
  }

  await api("/rest/videos?action=finalizeUpload", {
    method: "POST",
    json: { finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken ?? "", uploadedPartIds: etags } },
  });

  // Video is processed asynchronously; posting before AVAILABLE fails.
  for (let i = 0; i < 60; i++) {
    const res = await api(`/rest/videos/${encodeURIComponent(value.video)}`);
    const { status } = (await res.json()) as { status: string };
    if (status === "AVAILABLE") return { kind: "video", urn: value.video };
    if (status === "PROCESSING_FAILED") throw new Error("LinkedIn failed to process the video");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timed out waiting for LinkedIn to process the video");
}
