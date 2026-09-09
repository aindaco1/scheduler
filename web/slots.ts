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
    this.generation++;
  }
  private render() {
    this.root.innerHTML = `<label class="field">${t("Your time zone", "Tu zona horaria")}<select data-zone>${timezoneOptions(this.timezone)}</select></label><div class="week-nav"><button class="button" type="button" data-prev aria-label="${t("Previous seven days", "Siete días anteriores")}" ${this.offset === 0 ? "disabled" : ""}>←</button><span class="week-label" data-week></span><button class="button" type="button" data-next aria-label="${t("Next seven days", "Siguientes siete días")}" ${this.offset + 7 >= this.options.horizon ? "disabled" : ""}>→</button></div><div data-slot-status role="status" aria-live="polite"></div><div class="slot-days" data-slots></div>`;
    $<HTMLSelectElement>("[data-zone]", this.root).addEventListener(
      "change",
      (e) => {
        this.timezone = (e.target as HTMLSelectElement).value;
        this.renderSlots();
        this.updateWeek();
      },
    );
    $("[data-prev]", this.root).addEventListener("click", () => {
      this.offset = Math.max(0, this.offset - 7);
      this.render();
      void this.load();
    });
    $("[data-next]", this.root).addEventListener("click", () => {
      this.offset += 7;
      this.render();
      void this.load();
    });
    this.updateWeek();
  }
  private updateWeek() {
    const a = this.start + this.offset * 86400000,
      b =
        this.start + Math.min(this.offset + 7, this.options.horizon) * 86400000;
    $("[data-week]", this.root).textContent =
      `${dateLabel(a, this.timezone, { month: "short", day: "numeric" })} – ${dateLabel(b - 1, this.timezone, { month: "short", day: "numeric" })}`;
  }
  private async load() {
    const generation = ++this.generation;
    const status = $("[data-slot-status]", this.root);
    status.innerHTML = `<p class="help-text">${t("Checking your calendars…", "Consultando los calendarios…")}</p>`;
    const query = new URLSearchParams({
      type: this.options.type,
      from: new Date(this.start + this.offset * 86400000).toISOString(),
      to: new Date(
        this.start + Math.min(this.offset + 7, this.options.horizon) * 86400000,
      ).toISOString(),
    });
    if (this.options.location) query.set("location", this.options.location);
    if (this.options.booking) query.set("booking", this.options.booking);
    const headers = this.options.token
      ? { Authorization: `Bearer ${this.options.token}` }
      : undefined;
    try {
      const result = (await api.request(`/availability?${query}`, {
        headers,
      })) as { slots: string[] };
      if (this.destroyed || generation !== this.generation) return;
      this.slots = result.slots;
      status.textContent = "";
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
      target.innerHTML = `<div class="empty-state"><h3>${t("No openings in these seven days", "No hay horarios en estos siete días")}</h3><p>${t("Try the next dates, or choose another meeting type.", "Consulta las siguientes fechas o elige otro tipo de reunión.")}</p></div>`;
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
