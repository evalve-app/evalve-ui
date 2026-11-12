// The text for each way the device page can fail. A device is a computer on
// which the Kitaru CLI asks to sign in (see GLOSSARY.md).

// How a call to the server failed. `status` is null when no response came.
export type DeviceFailure = { status: number | null; detail: string | null };

const START_AGAIN = "Start the sign-in again in your terminal to get a new link.";
// The sign-in to the dashboard ends after a time. The page load sends a
// signed-out person to the login page and then back to the same link.
const SIGN_IN_AGAIN = "You are not signed in any more. Load this page again, and sign in.";

// For a link that has no device id or no user code.
export const DEVICE_LINK_INCOMPLETE = `The device id or the code is missing. ${START_AGAIN}`;

// The server answers 404 for an unknown id, a wrong or missing code, and a
// device that a different account approved. An id that is not a UUID gets 422.
export function deviceLoadError({ status, detail }: DeviceFailure): string {
  if (status === 401) return SIGN_IN_AGAIN;
  if (status === null) return "The device request did not load, because the server did not answer. Try again in a moment.";
  if (status === 404 || status === 422) {
    return `This device request was not found. The link is not correct, or a different account approved the device already. ${START_AGAIN}`;
  }
  if (detail) return `The device request did not load: ${detail}`;
  return `The device request did not load. The server returned HTTP ${status}.`;
}

// The server gives 422 for an expired request, a locked device, and a wrong
// code. Only the detail text tells them apart, so any other 422 gets the
// general message. Three wrong codes lock the device.
export function deviceApproveError({ status, detail }: DeviceFailure): string {
  if (status === 401) return SIGN_IN_AGAIN;
  if (status === null) return "The device was not approved, because the server did not answer. Try again in a moment.";
  if (status === 422) {
    if (detail === "Device authorization has expired") return `The device was not approved, because the request expired. ${START_AGAIN}`;
    if (detail === "Device is locked") {
      return `The device was not approved, because it is locked. A device locks after three wrong codes. ${START_AGAIN}`;
    }
    return `The device was not approved, because the code in the link does not match or the request is not open. ${START_AGAIN}`;
  }
  if (status === 404) {
    return `The device was not approved, because a different account approved it already or the request is gone. ${START_AGAIN}`;
  }
  if (detail) return `The device was not approved: ${detail}`;
  return `The device was not approved. The server returned HTTP ${status}.`;
}
