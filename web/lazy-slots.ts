import { esc, t } from "./common";
import type { SlotPicker, SlotPickerOptions } from "./slots";

/** Load timezone arithmetic only when a picker is actually opened. */
export class LazySlotPicker {
  private picker?: SlotPicker;
  private disposed = false;
  constructor(
    root: HTMLElement,
    private options: SlotPickerOptions,
  ) {
    root.innerHTML = `<p role="status" class="help-text">${t("Loading available times…", "Cargando los horarios disponibles…")}</p>`;
    void import("./slots")
      .then(({ SlotPicker }) => {
        if (!this.disposed && root.isConnected)
          this.picker = new SlotPicker(root, options);
      })
      .catch(() => {
        if (!this.disposed && root.isConnected)
          root.innerHTML = `<p role="alert" class="notice error">${esc(t("The time picker could not load. Please reload this page to try again.", "No se pudo cargar el selector de horarios. Recarga la página para intentarlo de nuevo."))}</p>`;
      });
  }
  setLocation(location: string) {
    this.options.location = location;
    this.picker?.setLocation(location);
  }
  destroy() {
    this.disposed = true;
    this.picker?.destroy();
  }
}
