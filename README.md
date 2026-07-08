# Plak

Every date, ranked. Plak is a web app for couples to log the activities and dates they do together, rank them against each other, and build a shared memory of what they loved — think Beli, but for two people and every kind of date, not just restaurants.

**Live at:** `https://d1f1ffj966e44z.cloudfront.net`

## How ranking works

Adding a new activity doesn't just drop it at the bottom of a list. You pick a mood bucket (Loved it / It was fine / Wouldn't repeat), then answer a few "which was better" comparisons against existing entries in that bucket. The app uses those answers to binary-search the new entry into its exact rank position — O(log n) comparisons, so even with dozens of entries it only takes a few taps. You can still drag to manually reorder afterward.

## Features

- Mood-bucket comparison ranking (binary search, Beli-style)
- Shared list — both partners see and drag the same order in real time
- Photo gallery per activity (multiple photos, presigned S3 uploads)
- Notes and date tracking per activity, editable anytime
- Times-done counter with frequency sort
- Sort by rank, frequency, or date
- Filter by category
- Couple invite-code system — share a code, partner joins your list
- Activity detail view with full photo gallery, notes editing, times-done stepper

## Project structure

```
plak/
├── frontend/                   React app (Vite)
│   └── src/
│       ├── App.jsx
│       ├── Home.jsx            Ranked list, sort/filter, drag-to-reorder
│       ├── AddActivity.jsx     Add form with mood picker + photo upload
│       ├── ActivityDetail.jsx  Detail view, gallery, notes/date editing
│       ├── Compare.jsx         Binary-search comparison screen
│       ├── Auth.jsx            Login/signup with invite code support
│       ├── authHelpers.js      Cognito SDK wrapper
│       ├── apiConfig.js        API URL config
│       └── cognitoConfig.js    User pool config
├── infra/                      AWS CDK stack (TypeScript)
│   └── lib/infra-stack.ts      All infrastructure defined as code
└── backend/                    Lambda function source
    ├── get-activities/         GET /activities
    ├── post-activity/          POST /activities
    ├── put-activity/           PUT /activities/{id}
    ├── delete-activity/        DELETE /activities/{id}
    ├── put-reorder/            PUT /activities/reorder
    ├── get-activities-by-bucket/  GET /activities/bucket/{bucket}
    ├── put-bucket-rank/        PUT /activities/bucket-rank
    ├── get-upload-url/         GET /activities/{id}/photo
    ├── get-couple/             GET /couple
    └── post-confirmation/      Cognito Post Confirmation trigger
```

Each folder under `backend/` is one Lambda function. `infra/` deploys and wires them all together — there's no standalone backend server.

## Architecture

| Layer | Service |
|---|---|
| Frontend hosting | S3 + CloudFront |
| Auth | Cognito (User Pool, custom attributes, Post Confirmation trigger) |
| API | API Gateway with Cognito JWT authorizer on every route |
| Compute | Lambda (Node.js 20), one function per route |
| Database | RDS Postgres 16, private isolated VPC subnet |
| File storage | S3 (presigned URLs for upload and viewing) |
| S3 access | VPC Gateway Endpoint (free, no NAT Gateway) |
| Secrets | Secrets Manager (auto-generated DB credentials) |
| Infra as code | AWS CDK (TypeScript) |

The database has no public internet access. Lambda reaches it via VPC. Lambda reaches S3 via a VPC Gateway Endpoint — no NAT Gateway, which keeps costs near zero.

**Total infrastructure cost: ~$0.28/month** (RDS T3.micro, free-tier covered).

## Data model

```
user             (id, email, name, cognito_sub, created_at)
couple           (id, name, invite_code, created_at)
couple_member    (couple_id, user_id, role)
activity         (id, couple_id, title, category, notes, bucket,
                  rank_position, times_done, date_occurred, photo_key,
                  created_by, created_at)
activity_photo   (id, activity_id, photo_key, position, created_at)
ranking          (id, activity_id, user_id, bucket, rank_position, score)
```

`bucket` + `rank_position` on `activity` power the shared ranking. `activity_photo` supports multiple photos per activity. `invite_code` on `couple` enables the partner-joining flow.

## API routes

| Method | Path | Description |
|---|---|---|
| GET | /activities | All activities for the logged-in couple, with photo URLs |
| POST | /activities | Create a new activity |
| PUT | /activities/{id} | Update notes, date, times_done |
| DELETE | /activities/{id} | Delete activity + photos (DB + S3) |
| PUT | /activities/reorder | Save drag-reorder result |
| GET | /activities/bucket/{bucket} | Ranked list within one mood bucket |
| PUT | /activities/bucket-rank | Insert activity at a specific bucket position |
| GET | /activities/{id}/photo | Get presigned S3 upload URL |
| GET | /couple | Couple info including invite code |

All routes require a valid Cognito JWT in the `Authorization` header. API Gateway validates the token before invoking any Lambda.

## Prerequisites

- Node.js 18+
- AWS CLI configured (`aws configure`)
- AWS CDK: `npm install -g aws-cdk`
- Docker (CDK uses it to bundle Lambda assets)
- An AWS account with a billing alert set up

## First-time setup

```bash
git clone <repo-url>
cd plak

cd infra && npm install && cd ..
cd frontend && npm install && cd ..

# One-time per account/region
cdk bootstrap aws://<account-id>/<region>
```

## Deploying

### Backend

```bash
cd infra
npm run build
cdk deploy
```

First deploy takes 10-15 minutes (RDS provisioning is the slow part). Save the outputs:

- `ApiUrl` — API Gateway endpoint
- `UserPoolId` and `UserPoolClientId` — for Cognito
- `FrontendUrl` — CloudFront distribution URL

### Database migration

RDS is in a private subnet — connect via SSM Session Manager port forwarding through a bastion EC2 instance (add the bastion block to `infra-stack.ts`, deploy, connect, run migrations, remove bastion, redeploy).

```bash
aws ssm start-session \
  --target <bastion-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}'

psql -h localhost -p 5433 -U plak_admin -d plak
```

Run the schema from `infra/migrations/schema.sql`.

### Frontend config

Update `frontend/src/apiConfig.js` and `frontend/src/cognitoConfig.js` with your deploy outputs (these are not `.env` files — values are set directly in the source).

```bash
cd frontend
npm run dev       # local dev
npm run build     # production build
```

### Deploying frontend changes

```bash
cd frontend && npm run build
cd ../infra && cdk deploy
```

CDK's `BucketDeployment` construct uploads `frontend/dist` to S3 and automatically invalidates the CloudFront cache on every deploy.

## Tearing down

```bash
cd infra
cdk destroy
```

Note: if you have photos in the S3 bucket, set `autoDeleteObjects: true` on the bucket (already set) or the destroy will fail. RDS has `deletionProtection: false` set so it tears down cleanly.

## Cost notes

Designed to run as cheaply as possible:
- No NAT Gateway (saves ~$32/month) — S3 access goes through a free VPC Gateway Endpoint
- Serverless compute (Lambda) — costs nothing when idle
- RDS T3.micro — free-tier eligible for 12 months on a new account, ~$13/month after
- CloudFront + S3 frontend — essentially free at this traffic level

## Roadmap

- Delete individual photos
- Per-person ranking view (each partner has their own private order)
- Custom domain via Route 53 + ACM
- Performance: Lambda connection reuse, memory bump
- Mood/bucket view on home screen (grouped by Loved / Fine / Skip)
