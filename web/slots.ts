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
import { availableDatesPage } from "./booking-week";

export interface SlotPickerOptions {
  type: string;
  location?: string;
  horizon: number;
  noticeHours: number;
  timezone?: string;
  booking?: string;
  token?: string;
  onSelect: (iso: string, timezone: string) => void;
}
export class SlotPicker {
  private offset = 0;
  private pageStarts: (string | undefined)[] = [undefined];
  private nextDate?: string;
  private generation = 0;
  private slots: string[] = [];
  private start = Date.now();
  private timezone: string;
  private destroyed = false;
  private request?: AbortController;
  private retryTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private root: HTMLElement,
    private options: SlotPickerOptions,
  ) {
    this.timezone = options.timezone || currentZone();
    this.render();
    void this.load();
  }
  setLocation(location: string) {
    this.options.location = location;
    void this.load();
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.retryTimer);
    this.request?.abort();
    this.generation++;
  }
  private render() {
    this.root.innerHTML = `<label class="field">${t("Your time zone", "Tu zona horaria")}<select data-zone>${timezoneOptions(this.timezone)}</select></label><div class="week-nav"><button class="button" type="button" data-prev aria-label="${t("Previous 7 available dates", "7 fechas disponibles anteriores")}" ${this.offset === 0 ? "disabled" : ""}>←</button><span class="week-label" data-week></span><button class="button" type="button" data-next aria-label="${t("Next 7 available dates", "7 fechas disponibles siguientes")}" ${this.nextDate ? "" : "disabled"}>→</button></div><div data-slot-status role="status" aria-live="polite"></div><div class="slot-days" data-slots></div>`;
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
      void this.load(0, "prev");
    });
    $("[data-next]", this.root).addEventListener("click", () => {
      if (!this.nextDate) return;
      this.pageStarts[this.offset + 1] = this.nextDate;
      this.offset += 1;
      this.render();
      this.focusNavigation("next");
      void this.load(0, "next");
    });
    this.updateNavigation();
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
  private updateNavigation() {
    $<HTMLButtonElement>("[data-prev]", this.root).disabled = this.offset === 0;
    $<HTMLButtonElement>("[data-next]", this.root).disabled = !this.nextDate;
  }
  private async load(attempt = 0, direction?: "prev" | "next") {
    clearTimeout(this.retryTimer);
    this.request?.abort();
    const controller = (this.request = new AbortController());
    const generation = ++this.generation;
    const focused = document.activeElement;
    const navigationFocus =
      direction ??
      (focused === $("[data-next]", this.root)
        ? "next"
        : focused === $("[data-prev]", this.root)
          ? "prev"
          : undefined);
    const status = $("[data-slot-status]", this.root);
    this.slots = [];
    this.nextDate = undefined;
    this.pageStarts.length = this.offset + 1;
    this.updateNavigation();
    $("[data-week]", this.root).textContent = "";
    $("[data-slots]", this.root).replaceChildren();
    status.innerHTML = `<p class="help-text">${t("Checking available times…", "Consultando los horarios disponibles…")}</p>`;
    const query = new URLSearchParams({
      type: this.options.type,
    });
    if (this.options.location) query.set("location", this.options.location);
    if (this.options.booking) query.set("booking", this.options.booking);
    const headers = this.options.token
      ? { Authorization: `Bearer ${this.options.token}` }
      : undefined;
    try {
      const result = await availableDatesPage(
        {
          now: this.start,
          timezone: this.timezone,
          horizonDays: this.options.horizon,
          noticeHours: this.options.noticeHours,
          startDate: this.pageStarts[this.offset],
        },
        async (from, to) => {
          if (this.destroyed || generation !== this.generation)
            throw new DOMException("Aborted", "AbortError");
          query.set("from", new Date(from).toISOString());
          query.set("to", new Date(to).toISOString());
          const response = (await api.request(`/availability?${query}`, {
            headers,
            signal: controller.signal,
          })) as { slots: string[] };
          return response.slots;
        },
      );
      if (this.destroyed || generation !== this.generation) return;
      this.slots = result.slots;
      this.nextDate = result.nextDate;
      this.updateNavigation();
      if (
        navigationFocus &&
        (document.activeElement === focused ||
          document.activeElement === document.body)
      )
        this.focusNavigation(navigationFocus);
      $("[data-week]", this.root).textContent = this.slots.length
        ? `${dateLabel(this.slots[0], this.timezone, { month: "short", day: "numeric" })} – ${dateLabel(this.slots.at(-1)!, this.timezone, { month: "short", day: "numeric" })}`
        : t("No dates available", "No hay fechas disponibles");
      status.innerHTML = `<span class="sr-only">${this.slots.length ? t(`${this.slots.length} available times. Choose a time below.`, `${this.slots.length} horarios disponibles. Elige uno a continuación.`) : t("No openings in this date range.", "No hay horarios en estas fechas.")}</span>`;
      this.renderSlots();
    } catch (e) {
      if (this.destroyed || generation !== this.generation) return;
      const failure = e as { status?: number; code?: string };
      const temporary =
        e instanceof TypeError ||
        [502, 504].includes(failure.status || 0) ||
        (failure.status === 503 &&
          [
            "google_unavailable",
            "icloud_unavailable",
            "service_unavailable",
          ].includes(failure.code || ""));
      if (attempt === 0 && temporary) {
        status.innerHTML = `<p class="help-text">${t("Calendar check interrupted. Trying again…", "Se interrumpió la consulta del calendario. Volviendo a intentar…")}</p>`;
        this.retryTimer = setTimeout(() => {
          if (!this.destroyed && generation === this.generation)
            void this.load(1, navigationFocus);
        }, 500);
        return;
      }
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
      target.innerHTML = `<div class="empty-state"><h3>${t("No openings in this date range", "No hay horarios en estas fechas")}</h3><p>${this.offset > 0 ? t("Try earlier dates or choose another meeting type.", "Consulta fechas anteriores o elige otro tipo de reunión.") : t("Try another meeting type or check back later.", "Elige otro tipo de reunión o vuelve más tarde.")}</p></div>`;
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
