import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  return req.protocol === "https" || req.secure === true;
}

export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // SameSite=None is rejected by browsers unless Secure is also set. Local
    // HTTP development therefore uses Lax while production HTTPS uses None.
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
