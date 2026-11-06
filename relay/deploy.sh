#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# Updates the same relay stack; adds an asynchronous Nova 2 Lite worker and AI routes.
# Uses the current AWS CLI profile; paid AWS resources. No attendee tokens here.
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table
deploy_bucket="${SMART_DIVE_DEPLOY_BUCKET:-}"
if [[ -z "$deploy_bucket" ]]; then
  deploy_bucket=$(aws cloudformation describe-stacks --stack-name smart-dive-cockpit-web --region ap-northeast-1 --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)
fi
if [[ ! "$deploy_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo 'Deployment bucket missing. Set SMART_DIVE_DEPLOY_BUCKET to an existing Tokyo S3 bucket.' >&2
  exit 1
fi
aws cloudformation deploy --template-file template.json --s3-bucket "$deploy_bucket" --s3-prefix cloudformation/relay --stack-name smart-dive-relay-poc --capabilities CAPABILITY_IAM --region ap-northeast-1 --no-fail-on-empty-changeset
aws cloudformation describe-stacks --stack-name smart-dive-relay-poc --region ap-northeast-1 --query 'Stacks[0].Outputs[?OutputKey==`RelayURL`].OutputValue' --output text
