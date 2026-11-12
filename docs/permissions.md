# Permissions and getting a token

## What the tool asks for

Three read-only delegated Microsoft Graph scopes, and nothing that ends in `ReadWrite`:

| Scope | Used for |
| --- | --- |
| `Policy.Read.All` | The authorisation policy, admin consent policy, security defaults and authentication methods policy |
| `Organization.Read.All` | The organisation profile (contacts, sync time) and subscribed SKUs |
| `Application.Read.All` | Application registrations, for secret and certificate expiry |

`node bin/m365-quick-check.mjs permissions` prints the scopes and the seven endpoints. The scopes are the ones Microsoft's Graph reference lists for each endpoint at the time of writing; confirm them against the current reference, because they change.

The signed-in account also needs a role that can read this data in Entra. Global Reader is the simplest read-only role.

## Getting a token

The tool does not sign in. It never asks for a password and it never stores a token. You give it an access token for your own session, in an environment variable:

```bash
export GRAPH_ACCESS_TOKEN='...'          # bash
$env:GRAPH_ACCESS_TOKEN = '...'          # PowerShell
node bin/m365-quick-check.mjs run
```

Ways to get a token for the three scopes above include copying it from Microsoft Graph Explorer after you consent to those scopes, or using your own app registration with a sign-in flow you already trust. Treat the token like a password: it grants access for as long as it is valid (usually about an hour), do not paste it into a ticket or a chat, and let it expire.

The token is sent only as a bearer header to the Graph origin. It is not accepted as a command-line argument, so it does not end up in your shell history or the process list.

## What is stored

Nothing, unless you pass `--save`. A saved snapshot contains tenant details: contact addresses, application names and licence counts. It does not contain the token. Keep a snapshot as private as you would any tenant export.

## Throttling and size

The client reads one page of 100 applications at a time and follows paging links on the same origin, up to 20 pages. It retries after a 429 or 503 response, honouring `Retry-After`, up to three times.
