// Wrangler generates bootstrap bindings. Provider secrets are checked before connecting or booking.
export type RuntimeEnv = Env & {
  EMAIL_REPLY_TO?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
};
