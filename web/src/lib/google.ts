"use client";

// Google-Konto in der Mac-App (desktop/lib/google.js). Im Browser gibt es das nicht: getGoogle() liefert null.

import { getDesktop } from "./desktop";
import type { GoogleEvent, MailMessage } from "./mail-data";

export type GoogleFail = { ok: false; code: string; message: string };

export interface GoogleStatus {
  available: boolean; // Zugangsdatei (google-client.json) gefunden
  connected: boolean;
  expired: boolean; // Anmeldung abgelaufen (im Testmodus nach 7 Tagen): neu verbinden
  email: string;
  scope: string;
}

/** Mail aus Gmail: wie MailMessage plus die Kennungen, die man zum Antworten braucht. */
export type GoogleMail = MailMessage & { threadId?: string; messageIdHeader?: string };

export interface GoogleApi {
  status(): Promise<GoogleStatus>;
  connect(): Promise<{ ok: true; email: string; scope: string } | GoogleFail>;
  disconnect(): Promise<{ ok: true }>;
  events(days?: number): Promise<{ ok: true; events: GoogleEvent[] } | GoogleFail>;
  mails(): Promise<{ ok: true; mails: GoogleMail[] } | GoogleFail>;
  modify(id: string, change: { unread?: boolean; archive?: boolean }): Promise<{ ok: true } | GoogleFail>;
  send(mail: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }): Promise<{ ok: true; id: string } | GoogleFail>;
}

declare module "./desktop" {
  interface StudiDesktop {
    /** fehlt in älteren Fassungen der App */
    google?: GoogleApi;
  }
}

export function getGoogle(): GoogleApi | null {
  return getDesktop()?.google ?? null;
}
