import {
  api,
  t,
  esc,
  $,
  dateLabel,
  timeLabel,
  timezoneOptions,
  zoneLabel,
  errorText,
  currentZone,
} from "./common";
import { bookingWeek } from "./booking-week";

export interface SlotPickerOptions {
  type: string;
  location?: string;
  horizon: number;
  timezone?: string;
  booking?: string;
  token?: string;
  onSelect: (iso: string, timezone: string) => void;
}
export class SlotPicker {
  private offset = 0;
  private generation = 0;
  private slots: string[] = [];
  private start = Date.now();
  private timezone: string;
  private destroyed = false;
  private request?: AbortController;
  constructor(
    private root: HTMLElement,
    private options: SlotPickerOptions,
  ) {
    this.timezone = options.timezone || currentZone();
    this.render();
    void this.load();
  }
  destroy() {
    this.destroyed = true;
    this.request?.abort();
    this.generation++;
  }
  private render() {
    const week = this.week();
    this.offset = week.offset;
    this.root.innerHTML = `<label class="field">${t("Your time zone", "Tu zona horaria")}<select data-zone>${timezoneOptions(this.timezone)}</select></label><div class="week-nav"><button class="button" type="button" data-prev aria-label="${t("Previous week", "Semana anterior")}" ${this.offset === 0 ? "disabled" : ""}>←</button><span class="week-label" data-week></span><button class="button" type="button" data-next aria-label="${t("Next week", "Semana siguiente")}" ${week.hasNext ? "" : "disabled"}>→</button></div><div data-slot-status role="status" aria-live="polite"></div><div class="slot-days" data-slots></div>`;
    $<HTMLSelectElement>("[data-zone]", this.root).addEventListener(
      "change",
      (e) => {
        this.timezone = (e.target as HTMLSelectElement).value;
        this.render();
        $<HTMLSelectElement>("[data-zone]", this.root).focus();
        void this.load();
      },
    );
    $("[data-prev]", this.root).addEventListener("click", () => {
      this.offset = Math.max(0, this.offset - 1);
      this.render();
      this.focusNavigation("prev");
      void this.load();
    });
    $("[data-next]", this.root).addEventListener("click", () => {
      this.offset += 1;
      this.render();
      this.focusNavigation("next");
      void this.load();
    });
    this.updateWeek();
  }
  private focusNavigation(direction: "prev" | "next") {
    const preferred = $<HTMLButtonElement>(`[data-${direction}]`, this.root);
    (preferred.disabled
      ? $<HTMLButtonElement>(
          `[data-${direction === "prev" ? "next" : "prev"}]`,
          this.root,
        )
      : preferred
    ).focus();
  }
  private week() {
    return bookingWeek(
      this.start,
      this.timezone,
      this.offset,
      this.options.horizon,
    );
  }
  private updateWeek() {
    const { from, next } = this.week();
    $("[data-week]", this.root).textContent =
      `${dateLabel(from, this.timezone, { month: "short", day: "numeric" })} – ${dateLabel(next, this.timezone, { month: "short", day: "numeric" })}`;
  }
  private async load() {
    this.request?.abort();
    const controller = (this.request = new AbortController());
    const generation = ++this.generation;
    const status = $("[data-slot-status]", this.root);
    this.slots = [];
    $("[data-slots]", this.root).replaceChildren();
    status.innerHTML = `<p class="help-text">${t("Checking available times…", "Consultando los horarios disponibles…")}</p>`;
    const { from, to } = this.week();
    const query = new URLSearchParams({
      type: this.options.type,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    if (this.options.location) query.set("location", this.options.location);
    if (this.options.booking) query.set("booking", this.options.booking);
    const headers = this.options.token
      ? { Authorization: `Bearer ${this.options.token}` }
      : undefined;
    try {
      const result = (await api.request(`/availability?${query}`, {
        headers,
        signal: controller.signal,
      })) as { slots: string[] };
      if (this.destroyed || generation !== this.generation) return;
      this.slots = result.slots;
      status.innerHTML = `<span class="sr-only">${this.slots.length ? t(`${this.slots.length} available times. Choose a time below.`, `${this.slots.length} horarios disponibles. Elige uno a continuación.`) : t("No openings this week.", "No hay horarios esta semana.")}</span>`;
      this.renderSlots();
    } catch (e) {
      if (this.destroyed || generation !== this.generation) return;
      status.innerHTML = `<div class="notice error">${esc(errorText(e))}</div><button class="button" type="button" data-retry>${t("Try again", "Reintentar")}</button>`;
      $("[data-retry]", status).addEventListener(
        "click",
        () => void this.load(),
      );
    }
  }
  private renderSlots() {
    const target = $("[data-slots]", this.root);
    const groups = new Map<string, string[]>();
    for (const slot of this.slots) {
      const label = dateLabel(slot, this.timezone, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const group = groups.get(label) || [];
      group.push(slot);
      groups.set(label, group);
    }
    if (!groups.size) {
      target.innerHTML = `<div class="empty-state"><h3>${t("No openings this week", "No hay horarios esta semana")}</h3><p>${t("Try the next dates, or choose another meeting type.", "Consulta las siguientes fechas o elige otro tipo de reunión.")}</p></div>`;
      return;
    }
    target.innerHTML = Array.from(
      groups,
      ([day, slots]) =>
        `<section class="slot-day"><h3>${esc(day)}</h3><div class="slot-grid">${slots.map((slot) => `<button class="button" type="button" data-slot="${esc(slot)}" aria-label="${esc(dateLabel(slot, this.timezone))}, ${esc(zoneLabel(this.timezone))}">${esc(timeLabel(slot, this.timezone))}</button>`).join("")}</div></section>`,
    ).join("");
    target
      .querySelectorAll<HTMLButtonElement>("[data-slot]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.options.onSelect(button.dataset.slot!, this.timezone),
        ),
      );
  }
}
