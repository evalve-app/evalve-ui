import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, approveDevice, getCurrentAccount, getDevice, type Device } from "../api/client";
import { Alert, Button, Card } from "../design-system/components";
import { DEVICE_LINK_INCOMPLETE, deviceApproveError, deviceLoadError, type DeviceFailure } from "../lib/devices";
import { formatDateTime } from "../lib/format";

// A call that threw something other than an ApiError got no response.
function deviceFailure(error: unknown): DeviceFailure {
  return error instanceof ApiError ? { status: error.status, detail: error.detail } : { status: null, detail: null };
}

// The page that `kitaru login` opens:
// /devices/verify?device_id=<id>&user_code=<code>. A signed-in person compares
// the code with the terminal and approves the device.
export function ApproveDevicePage() {
  const [params] = useSearchParams();
  const deviceId = params.get("device_id") ?? "";
  const userCode = params.get("user_code") ?? "";
  const linkComplete = deviceId !== "" && userCode !== "";

  const me = useQuery({ queryKey: ["me"], queryFn: getCurrentAccount });
  const device = useQuery({
    queryKey: ["device", deviceId, userCode],
    queryFn: () => getDevice(deviceId, userCode),
    enabled: linkComplete,
    // One load only: no silent reload when the network returns.
    staleTime: Infinity,
    refetchOnReconnect: false,
  });
  // No retry: three wrong codes lock the device.
  const approval = useMutation({ mutationFn: () => approveDevice(deviceId, userCode), retry: false });

  // The approval returns the newest state of the device.
  const current = approval.data ?? device.data;
  const approved = current !== undefined && current.status !== "pending";

  return (
    <div className="page device-page">
      <div className="page-header">
        <h1 className="page-title">{approved ? "Device approved" : "Approve this device?"}</h1>
      </div>
      {linkComplete && !device.isError ? (
        <p className="device-intro">
          A Kitaru CLI asks to sign in to this server{me.data ? <> as <strong>{me.data.name}</strong></> : null}.
          {approved ? null : " Approve it only if you started this sign-in and your terminal shows the same code."}
        </p>
      ) : null}

      {!linkComplete ? (
        <Alert variant="destructive" title="This link is not complete">
          {DEVICE_LINK_INCOMPLETE}
        </Alert>
      ) : device.isPending ? (
        <div className="page-message">Loading</div>
      ) : device.isError ? (
        <Alert variant="destructive">{deviceLoadError(deviceFailure(device.error))}</Alert>
      ) : current ? (
        <>
          <DeviceDetails device={current} userCode={userCode} />
          {approval.isSuccess ? (
            <Alert variant="success">Device approved. Go back to your terminal.</Alert>
          ) : approved ? (
            // The server shows an approved device only to the account that approved it.
            <Alert variant="success">You approved this device already.</Alert>
          ) : (
            <>
              {approval.isError ? <Alert variant="destructive">{deviceApproveError(deviceFailure(approval.error))}</Alert> : null}
              <div>
                <Button onClick={() => approval.mutate()} disabled={approval.isPending}>
                  {approval.isPending ? "Approving device" : "Approve device"}
                </Button>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function DeviceDetails({ device, userCode }: { device: Device; userCode: string }) {
  return (
    <Card>
      <dl className="kv" aria-label="Device request">
        <Detail label="Code" value={userCode} mono />
        <Detail label="Host" value={device.hostname} mono />
        <Detail label="Operating system" value={device.os} />
        <Detail label="IP address" value={device.ip_address} mono />
        <Detail label="Kitaru version" value={device.client_version} mono />
        <Detail label="Requested" value={formatDateTime(device.created)} />
      </dl>
    </Card>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  const shown: ReactNode = value ? value : <span className="muted">Not reported</span>;
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono && value ? "mono" : undefined}>{shown}</dd>
    </div>
  );
}
