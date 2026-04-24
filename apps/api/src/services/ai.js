import { config } from "../config.js";

export async function processPhotoWithAi({ photoId, imageUrl }) {
  const response = await fetch(`${config.aiServiceUrl}/process-photo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ photoId, imageUrl }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "AI processing failed");
  }

  return payload;
}
