import { describe, expect, it } from "vitest";
import { deviceApproveError, deviceLoadError } from "./devices";

const SIGN_IN_AGAIN = "You are not signed in any more. Load this page again, and sign in.";

const START_AGAIN = "Start the sign-in again in your terminal to get a new link.";

describe("deviceLoadError", () => {
  it("says the request was not found when the id or the code is wrong", () => {
    const text = "This device request was not found. The link is not correct, or a different account approved the device already. " + START_AGAIN;
    expect(deviceLoadError({ status: 404, detail: "Device not found" })).toBe(text);
    expect(deviceLoadError({ status: 422, detail: null })).toBe(text);
  });

  it("gives the reason from the server for any other answer", () => {
    expect(deviceLoadError({ status: 503, detail: "Database is not available" })).toBe("The device request did not load: Database is not available");
    expect(deviceLoadError({ status: 500, detail: null })).toBe("The device request did not load. The server returned HTTP 500.");
  });

  it("tells a person who is not signed in to load the page again", () => {
    expect(deviceLoadError({ status: 401, detail: "Not authenticated" })).toBe(SIGN_IN_AGAIN);
  });

  it("says the server did not answer when there is no response", () => {
    expect(deviceLoadError({ status: null, detail: null })).toBe("The device request did not load, because the server did not answer. Try again in a moment.");
  });
});

describe("deviceApproveError", () => {
  it("tells a person whose sign-in ended to approve the device after the new sign-in", () => {
    expect(deviceApproveError({ status: 401, detail: "Not authenticated" })).toBe(
      "The device was not approved, because your sign-in ended. Approve the device after you sign in.",
    );
  });

  it("says the request expired", () => {
    expect(deviceApproveError({ status: 422, detail: "Device authorization has expired" })).toBe("The device was not approved, because the request expired. " + START_AGAIN);
  });

  it("says the device is locked", () => {
    expect(deviceApproveError({ status: 422, detail: "Device is locked" })).toBe(
      "The device was not approved, because it is locked. A device locks after three wrong codes. " + START_AGAIN,
    );
  });

  it("uses one general message for any other 422", () => {
    const text = "The device was not approved, because the code in the link does not match or the request is not open. " + START_AGAIN;
    expect(deviceApproveError({ status: 422, detail: "Invalid device code" })).toBe(text);
    expect(deviceApproveError({ status: 422, detail: null })).toBe(text);
  });

  it("says a different account approved the device when it is gone", () => {
    expect(deviceApproveError({ status: 404, detail: "Device not found" })).toBe(
      "The device was not approved, because a different account approved it already or the request is gone. " + START_AGAIN,
    );
  });

  it("gives the reason from the server for any other answer", () => {
    expect(deviceApproveError({ status: 503, detail: "Database is not available" })).toBe("The device was not approved: Database is not available");
    expect(deviceApproveError({ status: 500, detail: null })).toBe("The device was not approved. The server returned HTTP 500.");
  });

  it("says the server did not answer when there is no response", () => {
    expect(deviceApproveError({ status: null, detail: null })).toBe("The device was not approved, because the server did not answer. Try again in a moment.");
  });
});
