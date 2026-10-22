# GymNotes P2P / MCP

## Flow

1. The user copies the connection prompt in GymNotes and sends it to an agent
   with local computer execution (Codex, Claude Code, Gemini CLI or a desktop client).
2. The agent starts `npm run connect -- --setup` and configures its local MCP
   client using the distinct tools key from the prompt.
3. The foreground phone discovers `_gymnotes._tcp` on the same trusted LAN,
   matches the invitation fingerprint and authenticates both peers with fresh
   client/server nonces and HMAC-SHA256. The pairing secret is not sent by the
   protocol-2 phone.
4. MCP requests go directly through the local companion to the app. The app's
   existing tool registry and write permission remain authoritative.

There is no hosted GymNotes relay, public port, IP editing or return-code step.
The manual connection link remains an advanced fallback. Browser clients use
their computer's loopback companion; browser tabs cannot browse Bonjour.

## Setup And Verification

- Windows setup uses a separate, signed Node executable under
  `~/.gymnotes/runtime`. It requests scoped LAN rules only for that executable:
  TCP 3847 and discovery UDP 5353. It never changes network profiles, disables
  other rules or changes the machine's script execution policy.
- Authenticated `GET /api/v1/tools` must report `connected=true`.
- Authenticated `GET /api/v1/ping` must complete an app round trip with `ok=true`.
  Neither verification reads the diary or runs paid inference.
- A known live peer is not replaced when setup runs again. Unrelated processes
  and MCP configurations must be preserved.

## Boundaries

- Automatic phone discovery requires the native GymNotes 1.0.3 build. Its new
  module and Bonjour permissions cannot be added to 1.0.2 by OTA.
- Keep the app in the foreground and both devices on the same trusted LAN.
  Cloud-only chats without local execution cannot use this local transport.
- HMAC authenticates the peers; the local WebSocket is not a TLS channel.
  Do not expose this transport to public networks or tunnels.
- Discovery publishes only a fingerprint and protocol version, never the master
  secret, tools key, diary, provider credentials or model responses.
- Legacy phones can still use their existing explicitly configured connection.
