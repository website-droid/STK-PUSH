# Paynecta Backend - 50 KSH Student Registration

## Environment Variables (Set in Render)
- `PAYNECTA_API_KEY` = Your secret key
- `PAYNECTA_USER_EMAIL` = Your email
- `PORT` = 3000

## API Endpoints
- `GET /health` - Server status
- `GET /api/verify` - Test Paynecta auth
- `POST /api/stk-push` - Single student (body: { "phone": "0712345678" })
- `POST /api/stk-push/bulk` - Bulk students (body: { "students": [{"phone":"...","name":"..."}] })
- `POST /api/webhook` - Paynecta callback URL

## Deployment
Push to GitHub → Connect to Render → Add Env Vars → Deploy.
