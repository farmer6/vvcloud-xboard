# OPS User Hard Delete API

This API is intended for server-to-server use by external ops systems such as the SES suppression monitor. It does not depend on the Xboard admin login flow and does not modify the existing admin delete endpoint.

## Endpoint

- `POST /api/v2/ops/user/hardDelete`

## Do Not Call It From Browser Frontend

This endpoint is designed for backend-to-backend calls only.

- Your SES system frontend should call its own backend.
- The SES backend should generate the signature and call Xboard.
- Do not expose the shared key in browser code.

## Authentication

This endpoint uses a shared secret plus timestamped HMAC signature.

Required headers:

- `X-Ops-Timestamp`: Unix timestamp in seconds
- `X-Ops-Signature`: `sha256=<hex>` or raw hex digest

Environment variables on the Xboard side:

- `SES_OPS_HARD_DELETE_SHARED_KEY`: required shared secret
- `SES_OPS_HARD_DELETE_ALLOWED_IPS`: optional comma-separated IP allowlist
- `SES_OPS_HARD_DELETE_TTL`: optional signature TTL in seconds, default `300`

## Signature Canonical String

The canonical string is:

```text
{HTTP_METHOD}
/{request_path}
{timestamp}
{sha256_of_raw_request_body}
```

Example for this endpoint:

```text
POST
/api/v2/ops/user/hardDelete
1710000000
<sha256(body)>
```

The final signature is:

```text
hash_hmac('sha256', canonicalString, sharedKey)
```

## Request Body

Provide either `id` or `email`.

```json
{
  "email": "user@example.com",
  "reason": "SES suppression auto cleanup",
  "source": "ses-suppression-monitor"
}
```

Or:

```json
{
  "id": 123,
  "reason": "manual ops action",
  "source": "ses-suppression-monitor"
}
```

## What It Deletes

The endpoint reuses [UserHardDeleteService.php](/Users/liaoguangze/Projects/vvcloud-xboard/app/Services/UserHardDeleteService.php#L13).

Deleted:

- `v2_user`
- `personal_access_tokens`
- `v2_order` where `user_id = target`
- `v2_invite_code` where `user_id = target`
- `v2_stat_user` where `user_id = target`
- `v2_ticket`
- `v2_ticket_message` owned by the user or under the user's tickets
- `v2_traffic_reset_logs`

Detached:

- `v2_user.invite_user_id`
- `v2_user.parent_id`
- `v2_order.invite_user_id`
- `v2_gift_card_code.user_id`
- `v2_gift_card_usage.invite_user_id`

Preserved:

- `v2_commission_log`
- `v2_gift_card_usage.user_id`

## Success Response

```json
{
  "status": "success",
  "message": "操作成功",
  "data": {
    "mode": "hard_delete",
    "user": {
      "id": 123,
      "email": "user@example.com"
    },
    "deleted": {},
    "detached": {},
    "preserved": {},
    "notes": []
  },
  "error": null
}
```

## Node.js Example

```js
import crypto from 'node:crypto';

async function callXboardHardDelete({
  baseUrl,
  sharedKey,
  body,
}) {
  const path = '/api/v2/ops/user/hardDelete';
  const method = 'POST';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify(body);
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const canonical = [method, path, timestamp, bodyHash].join('\n');
  const signature = crypto
    .createHmac('sha256', sharedKey)
    .update(canonical)
    .digest('hex');

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Ops-Timestamp': timestamp,
      'X-Ops-Signature': `sha256=${signature}`,
    },
    body: rawBody,
  });

  const payload = await response.json();

  if (!response.ok || payload.status !== 'success') {
    throw new Error(payload.message || 'hard delete failed');
  }

  return payload.data;
}
```
