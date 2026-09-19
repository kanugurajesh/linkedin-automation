import { api, getAuth } from "./client";

/**
 * LinkedIn parses post text as "little text format": these characters are reserved and an
 * unescaped ( ) [ ] { } can silently truncate the post. `#` is left alone so hashtags work.
 */
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@\[\]()<>*_~]/g, (c) => `\\${c}`);
}

export type MediaRef = { kind: "image" | "video" | "document"; urn: string; title?: string };

export async function publishPost(text: string, media?: MediaRef): Promise<string> {
  const { personUrn } = await getAuth();
  const res = await api("/rest/posts", {
    method: "POST",
    json: {
      author: personUrn,
      commentary: escapeCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(media ? { content: { media: { id: media.urn, ...(media.title ? { title: media.title } : {}) } } } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    },
  });
  const urn = res.headers.get("x-restli-id");
  if (!urn) throw new Error("LinkedIn accepted the post but returned no id (x-restli-id header missing)");
  return urn;
}

/** First comment, used for source links so the post body stays link-free. */
export async function addComment(postUrn: string, text: string): Promise<void> {
  const { personUrn } = await getAuth();
  await api(`/rest/socialActions/${encodeURIComponent(postUrn)}/comments`, {
    method: "POST",
    json: { actor: personUrn, object: postUrn, message: { text } },
  });
}

export async function deletePost(postUrn: string): Promise<void> {
  await api(`/rest/posts/${encodeURIComponent(postUrn)}`, { method: "DELETE", headers: { "X-RestLi-Method": "DELETE" } });
}
