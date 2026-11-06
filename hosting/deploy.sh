#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Review this package, then run using your existing AWS CLI profile.
# Creates paid S3/CloudFront hosting and updates the existing relay in Tokyo.
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table
relay_url=$(aws cloudformation describe-stacks --stack-name smart-dive-relay-poc --region ap-northeast-1 --query 'Stacks[0].Outputs[?OutputKey==`RelayURL`].OutputValue' --output text)
if [[ ! "$relay_url" =~ ^https://[a-z0-9]+\.execute-api\.ap-northeast-1\.amazonaws\.com/?$ ]]; then
  echo 'Existing relay URL could not be verified.' >&2; exit 1
fi
relay_url="${relay_url%/}"
aws cloudformation deploy --template-file hosting/template.json --stack-name smart-dive-cockpit-web --region ap-northeast-1 --no-fail-on-empty-changeset
web_url=$(aws cloudformation describe-stacks --stack-name smart-dive-cockpit-web --region ap-northeast-1 --query 'Stacks[0].Outputs[?OutputKey==`WebURL`].OutputValue' --output text)
web_bucket=$(aws cloudformation describe-stacks --stack-name smart-dive-cockpit-web --region ap-northeast-1 --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
[[ "$web_url" =~ ^https://[a-z0-9]+\.cloudfront\.net$ ]] || exit 1
[[ "$web_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || exit 1
aws cloudformation deploy --template-file relay/template.json --s3-bucket "$web_bucket" --s3-prefix cloudformation/relay --stack-name smart-dive-relay-poc --capabilities CAPABILITY_IAM --region ap-northeast-1 --parameter-overrides "WebOrigin=$web_url" --no-fail-on-empty-changeset
aws s3 sync SmartDiveAuth/Web/ "s3://$web_bucket/" --cache-control no-store --region ap-northeast-1
web_config=$(mktemp)
trap 'rm -f "$web_config"' EXIT
python3 - "$relay_url" > "$web_config" <<'PY'
import json,sys
json.dump({'relay':sys.argv[1]},sys.stdout)
PY
aws s3 cp "$web_config" "s3://$web_bucket/config.json" --content-type application/json --cache-control no-store --region ap-northeast-1
echo "Start / Guide URL: $web_url/"
echo "Web companion URL: $web_url/cockpit.html"
echo "Fixed G2 URL: $web_url/?g2=1"
echo 'Generate the Even QR once using the Fixed G2 URL. Keep the same hosting stack to retain this URL.'
