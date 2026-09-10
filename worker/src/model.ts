import { z } from "zod";
import { DEFAULT_GAPS } from "./gap-policy";

export const localized = z
  .object({ en: z.string().max(2000), es: z.string().max(2000) })
  .strict();
const localizedName = localized.refine(
  (value) => !!(value.en.trim() || value.es.trim()),
  "A name is required in at least one language",
);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const weekly = z
  .object({
    day: z.number().int().min(0).max(6),
    start: clock,
    end: z.union([clock, z.literal("24:00")]),
  })
  .strict()
  .refine(
    (w) => w.start < w.end,
    "End must follow start; split overnight hours into two days",
  );
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
// Accept the former single reminder during upgrades; always return a schedule.
export const reminderSchedule = z
  .union([
    z.number().int().min(0).max(168),
    z
      .array(z.number().int().min(1).max(168))
      .max(3)
      .refine(
        (hours) => new Set(hours).size === hours.length,
        "Reminder times must be different",
      ),
  ])
  .transform((hours) =>
    (typeof hours === "number" ? (hours ? [hours] : []) : hours).sort(
      (a, b) => b - a,
    ),
  );
export const meetingType = z
  .object({
    id: identifier,
    name: localizedName,
    description: localized,
    duration: z.number().int().min(5).max(240),
    gap: z.number().int().min(0).max(240).nullable(),
    mode: z.enum(["meet", "zoom", "in-person"]),
    enabled: z.boolean(),
    locationIds: z.array(identifier).max(20),
  })
  .strict();
export const location = z
  .object({
    id: identifier,
    name: localizedName,
    address: localized,
    instructions: localized.optional(),
    hours: z.array(weekly).max(40),
    enabled: z.boolean(),
  })
  .strict();
export const settingsSchema = z
  .object({
    name: z.string().min(1).max(100),
    intro: localized,
    spanishEnabled: z.boolean().default(true),
    defaultGaps: z
      .object({
        video: z.number().int().min(0).max(240),
        inPerson: z.number().int().min(0).max(240),
      })
      .strict()
      .default(() => ({ ...DEFAULT_GAPS })),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    enabled: z.boolean(),
    noticeHours: z.number().int().min(0).max(720),
    horizonDays: z.number().int().min(1).max(180),
    cancelHours: z.number().int().min(0).max(720),
    dailyLimit: z.number().int().min(0).max(100),
    reminderHours: reminderSchedule,
    hours: z.array(weekly).max(40),
    recurringBlackouts: z.array(weekly).max(100),
    blockUsFederalHolidays: z.boolean().optional(),
    blackouts: z
      .array(
        z
          .object({
            id: identifier,
            start: z.iso.datetime({ offset: true }),
            end: z.iso.datetime({ offset: true }),
            label: z.string().max(100),
            scope: z.enum(["all", "in-person"]).optional(),
          })
          .strict()
          .refine((v) => Date.parse(v.end) > Date.parse(v.start)),
      )
      .max(200),
    types: z.array(meetingType).min(1).max(30),
    locations: z.array(location).max(20),
    googleCalendars: z.array(z.string().min(1).max(1000)).max(30),
    icloudCalendars: z.array(z.string().url().max(2000)).max(30),
    requireIcloud: z.boolean(),
    brand: z
      .object({
        name: z.string().trim().max(100).optional(),
        primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        logoUrl: z
          .union([z.literal(""), z.string().url().max(2000)])
          .refine((v) => !v || v.startsWith("https://")),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const key of ["types", "locations"] as const)
      if (new Set(v[key].map((x) => x.id)).size !== v[key].length)
        ctx.addIssue({
          code: "custom",
          message: "IDs must be unique",
          path: [key],
        });
    for (const t of v.types)
      for (const id of t.locationIds)
        if (!v.locations.some((l) => l.id === id))
          ctx.addIssue({
            code: "custom",
            message: "Unknown location",
            path: ["types"],
          });
  });

export type Settings = z.infer<typeof settingsSchema>;
export type MeetingType = z.infer<typeof meetingType>;
export type Weekly = z.infer<typeof weekly>;
export type Locale = "en" | "es";
export interface Busy {
  start: number;
  end: number;
  gap?: number;
  bookingId?: string;
}
export interface Booking {
  id: string;
  requestId: string;
  typeId: string;
  typeName: string;
  mode: MeetingType["mode"];
  locationId: string;
  location: string;
  locationInstructions?: string;
  start: number;
  end: number;
  gap: number;
  name: string;
  email: string;
  topic: string;
  locale: Locale;
  timezone: string;
  status:
    | "pending"
    | "confirmed"
    | "failed"
    | "cancelling"
    | "cancelled"
    | "rescheduling";
  created: number;
  updated: number;
  eventId?: string;
  zoomId?: string;
  joinUrl?: string;
  error?: string;
  managementHash: string;
  managementToken?: string;
  revision: number;
  targetStart?: number;
  targetEnd?: number;
  // Optional owner note for this booking revision only.
  changeMessage?: string;
}
export type PublicBooking = Pick<
  Booking,
  | "id"
  | "typeId"
  | "typeName"
  | "mode"
  | "locationId"
  | "location"
  | "locationInstructions"
  | "start"
  | "end"
  | "status"
  | "joinUrl"
  | "locale"
  | "timezone"
  | "email"
  | "name"
  | "topic"
  | "error"
> & { cancelUntil: number };
export const changeMessageInput = z.string().trim().max(2000).default("");
export const bookingInput = z
  .object({
    requestId: z.string().uuid(),
    typeId: identifier,
    locationId: z.string().max(60).default(""),
    start: z.iso.datetime({ offset: true }),
    name: z.string().trim().min(1).max(100),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    topic: z.string().max(2000).default(""),
    locale: z.enum(["en", "es"]),
    timezone: z.string().max(100),
    turnstile: z.string().max(2048),
  })
  .strict();
export type BookingInput = z.infer<typeof bookingInput>;
export interface CalendarChoice {
  id: string;
  name: string;
  provider: "google" | "icloud";
  writable: boolean;
}
export interface GoogleConnection {
  refreshToken: string;
  email: string;
  accountId: string;
}
export interface ZoomConnection {
  refreshToken: string;
  accessToken: string;
  expires: number;
  accountId: string;
}
export interface IcloudConnection {
  username: string;
  password: string;
}

export function defaultSettings(
  name = "Your name",
  timezone = "America/Denver",
  brandName = "Your brand",
): Settings {
  return {
    name,
    intro: {
      en: "Choose a meeting below and find a time that works for you.",
      es: "Elige una reunión y encuentra un horario que te convenga.",
    },
    timezone,
    enabled: false,
    spanishEnabled: true,
    defaultGaps: { ...DEFAULT_GAPS },
    noticeHours: 24,
    horizonDays: 30,
    cancelHours: 24,
    dailyLimit: 0,
    reminderHours: [24],
    hours: [1, 2, 3, 4, 5].map((day) => ({
      day,
      start: "09:00",
      end: "17:00",
    })),
    recurringBlackouts: [],
    blockUsFederalHolidays: false,
    blackouts: [],
    types: [
      {
        id: "conversation",
        name: { en: "A conversation", es: "Una conversación" },
        description: {
          en: "Ideas, projects, or a chance to catch up.",
          es: "Ideas, proyectos o una oportunidad para ponernos al día.",
        },
        duration: 30,
        gap: null,
        mode: "meet",
        enabled: true,
        locationIds: [],
      },
      {
        id: "zoom",
        name: { en: "Meet on Zoom", es: "Reunión por Zoom" },
        description: {
          en: "A video conversation on Zoom.",
          es: "Una conversación por videollamada en Zoom.",
        },
        duration: 30,
        gap: null,
        mode: "zoom",
        enabled: false,
        locationIds: [],
      },
      {
        id: "in-person",
        name: { en: "Meet in person", es: "Reunión presencial" },
        description: {
          en: "Make some space for a conversation in person.",
          es: "Reservemos un momento para conversar en persona.",
        },
        duration: 60,
        gap: null,
        mode: "in-person",
        enabled: false,
        locationIds: [],
      },
    ],
    locations: [],
    googleCalendars: ["primary"],
    icloudCalendars: [],
    requireIcloud: true,
    brand: { name: brandName, primary: "#101215", logoUrl: "" },
  };
}

export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public retryable = false,
  ) {
    super(code);
    this.name = "SchedulerError";
  }
}
