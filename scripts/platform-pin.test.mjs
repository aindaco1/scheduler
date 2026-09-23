import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertConsumerPin } from "../shared/dust-wave-platform/packages/test-core/src/consumer-pin.js";

const root = fileURLToPath(new URL("../", import.meta.url));
test("uses the recorded immutable Platform commit and package versions", () => {
  assertConsumerPin({
    root,
    expectedCommit: "816da7b52ed346025f5bbe3a7a420e9ad7c4a815",
    packages: {
      "worker-core": "0.15.0",
      "test-core": "0.3.0",
      "admin-shell": "0.12.0",
      "site-shell": "0.3.0",
    },
    lockfiles: [
      {
        path: "package-lock.json",
        packages: {
          "shared/dust-wave-platform/packages/admin-shell": "0.12.0",
          "shared/dust-wave-platform/packages/worker-core": "0.15.0",
          "shared/dust-wave-platform/packages/site-shell": "0.3.0",
          "shared/dust-wave-platform/packages/test-core": "0.3.0",
        },
      },
    ],
  });
});
