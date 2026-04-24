import { getFirebaseAdmin } from "./firebase-admin.js";

function extractBearerToken(headerValue) {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export async function verifyFirebaseRequest(req) {
  const firebaseIdToken =
    req.body?.firebaseIdToken ||
    req.query?.firebaseIdToken ||
    extractBearerToken(req.headers.authorization);

  if (!firebaseIdToken) {
    const error = new Error("firebaseIdToken is required");
    error.statusCode = 400;
    throw error;
  }

  const decoded = await getFirebaseAdmin().auth().verifyIdToken(firebaseIdToken);
  return { firebaseIdToken, decoded };
}
