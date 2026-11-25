const crypto = require("crypto");

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function createOneTimeToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function hashOneTimeToken(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) return null;
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { createOneTimeToken, hashOneTimeToken, normalizeEmail };
