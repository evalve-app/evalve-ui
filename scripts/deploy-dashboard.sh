#!/usr/bin/env bash
# Builds the dashboard and installs it on the Evalve EC2 server.
#
#   scripts/deploy-dashboard.sh [aws-profile] [region]
#
# The profile defaults to "evalve", the same one the evalve CLI uses. Sign in
# first with `aws login --profile evalve` if your session has expired.
#
# How the files get there: the server has no SSH and its role can't read S3.
# So the build is uploaded to the private Evalve state bucket, and the server
# downloads it through a link that expires in 15 minutes. The install itself
# (scripts/remote-install.sh) runs through AWS Systems Manager, the same way
# `evalve stop` drains Kitaru.
set -euo pipefail

profile=${1:-evalve}
region=${2:-$(command aws configure get region --profile "$profile" || true)}
if [ -z "$region" ]; then
  echo "AWS profile '$profile' has no region. Pass one: scripts/deploy-dashboard.sh $profile us-east-1" >&2
  exit 1
fi
aws() { command aws --profile "$profile" --region "$region" "$@"; }

cd "$(dirname "$0")/.."

account=$(aws sts get-caller-identity --query Account --output text)
bucket="evalve-state-$account-$region"
instance=$(aws ec2 describe-instances \
  --filters Name=tag:ManagedBy,Values=evalve Name=tag:Name,Values=evalve Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [[ ! "$instance" =~ ^i-[a-f0-9]+$ ]]; then
  echo "Expected exactly one running Evalve server in $region, found: ${instance:-none}" >&2
  exit 1
fi

echo "Building the dashboard"
npm run build --silent

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
COPYFILE_DISABLE=1 tar -czf "$work/ui.tgz" -C dist .
sha=$(shasum -a 256 "$work/ui.tgz" | cut -d ' ' -f 1)

echo "Uploading the build"
key=dashboard/evalve-ui.tgz
aws s3 cp "$work/ui.tgz" "s3://$bucket/$key" --only-show-errors
url=$(aws s3 presign "s3://$bucket/$key" --expires-in 900)

python3 - "$work/params.json" "$url" "$sha" scripts/remote-install.sh <<'PY'
import base64
import json
import sys

out, url, sha, script = sys.argv[1:]
encoded = base64.b64encode(open(script, "rb").read()).decode()
commands = [
    f"echo {encoded} | base64 -d > /root/evalve-dashboard-install.sh",
    f"bash /root/evalve-dashboard-install.sh '{url}' {sha}",
]
json.dump({"commands": commands}, open(out, "w"))
PY

echo "Installing on $instance"
command_id=$(aws ssm send-command --document-name AWS-RunShellScript --instance-ids "$instance" \
  --comment "Install the Evalve dashboard" --parameters "file://$work/params.json" \
  --query Command.CommandId --output text)

status=Pending
for attempt in $(seq 1 100); do
  status=$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$status" in Pending | InProgress | Delayed) sleep 3 ;; *) break ;; esac
done

aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" \
  --query StandardOutputContent --output text
if [ "$status" != Success ]; then
  aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" \
    --query StandardErrorContent --output text >&2
  echo "The install did not finish (status: $status)." >&2
  exit 1
fi
