exports.authCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "lax" : "strict",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
