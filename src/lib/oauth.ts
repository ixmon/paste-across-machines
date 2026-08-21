export const PUBLIC_CLIENT_ID = "paste";

export function oauthMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: ["paste"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["paste"],
  };
}

export function wwwAuthenticate(origin: string): string {
  return `Bearer realm="paste-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

export type AuthorizeParams = {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource: string;
};

export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
    return true;
  }
  return u.protocol === "https:";
}

export function parseAuthorizeParams(url: URL): AuthorizeParams {
  const q = url.searchParams;
  return {
    client_id: (q.get("client_id") || PUBLIC_CLIENT_ID).slice(0, 200),
    redirect_uri: q.get("redirect_uri") || "",
    state: q.get("state") || "",
    code_challenge: q.get("code_challenge") || "",
    code_challenge_method: (q.get("code_challenge_method") || "S256").toUpperCase(),
    scope: q.get("scope") || "paste",
    resource: q.get("resource") || "",
  };
}

export function authorizeQueryError(params: AuthorizeParams): string | null {
  if (!params.redirect_uri) return "Missing redirect_uri.";
  if (!isAllowedRedirect(params.redirect_uri)) return "redirect_uri must be https (or localhost).";
  if (!params.code_challenge) return "PKCE code_challenge required.";
  if (params.code_challenge_method !== "S256") return "code_challenge_method must be S256.";
  return null;
}
